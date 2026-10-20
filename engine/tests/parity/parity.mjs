// TS ↔ C++ parity for the make-sfx 1.x pipeline (spec §12.3).
//
// Renders every preset and game-pack design with several seeds through the
// TypeScript reference (packages/core/dist) and through `makesfx-cli legacy`,
// then compares loudness, true peak, length and spectrum.
//
// usage: node parity.mjs <packages/core/dist/index.js> <makesfx-cli> [--json report.json] [--verbose]

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [corePath, cliPath, ...rest] = process.argv.slice(2);
if (!corePath || !cliPath) {
  console.error("usage: node parity.mjs <core dist index.js> <makesfx-cli> [--json out.json] [--verbose]");
  process.exit(2);
}
const verbose = rest.includes("--verbose");
const jsonOut = rest.includes("--json") ? rest[rest.indexOf("--json") + 1] : undefined;

const core = await import(pathToFileURL(corePath).href);
const SR = core.SAMPLE_RATE;

// Spec §12.3 thresholds. Renders below SILENT_LUFS are not normalized by the
// mastering stage either; for those both engines must simply be silent.
const LIMITS = { lufs: 0.5, durationMs: 1, lsdDb: 1.5, truePeakDbtp: -0.99 };
const SILENT_LUFS = -60;
const SEEDS = [1, 42, 1042];

// ── Spectrum: 1/3-octave band levels, 50 Hz – 16 kHz ────────────────────────

function fftMagnitudes(x) {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  const mags = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mags[k] = re[k] * re[k] + im[k] * im[k];
  return { mags, binHz: SR / n };
}

// Bands narrower than 4 resolution cells (SR / signal length) are skipped:
// in a short render they hold one or two bins, so their level is estimation
// noise rather than a property of the sound.
function bandLevels(x, length) {
  const { mags, binHz } = fftMagnitudes(x);
  const resolutionHz = SR / length;
  const levels = [];
  for (let c = 50; c <= 16000; c *= Math.pow(2, 1 / 3)) {
    if (c * (Math.pow(2, 1 / 6) - Math.pow(2, -1 / 6)) < 4 * resolutionHz) {
      levels.push(null);
      continue;
    }
    const lo = Math.floor((c / Math.pow(2, 1 / 6)) / binHz);
    const hi = Math.max(lo + 1, Math.ceil((c * Math.pow(2, 1 / 6)) / binHz));
    let e = 0;
    for (let k = lo; k < hi && k < mags.length; k++) e += mags[k];
    levels.push(10 * Math.log10(e + 1e-30));
  }
  return levels;
}

// Mean |ΔdB| over bands that carry energy (within 60 dB of the loudest band in either render).
function logSpectralDistance(a, b) {
  const length = Math.min(a.length, b.length);
  const la = bandLevels(a, length);
  const lb = bandLevels(b, length);
  const top = Math.max(...la.filter((v) => v !== null), ...lb.filter((v) => v !== null));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < la.length; i++) {
    if (la[i] === null || lb[i] === null) continue;
    if (Math.max(la[i], lb[i]) < top - 60) continue;
    sum += Math.abs(la[i] - lb[i]);
    count++;
  }
  return count ? sum / count : 0;
}

// ── Cases ───────────────────────────────────────────────────────────────────

const cases = [];
for (const p of core.listPresets()) {
  const id = p.id ?? p;
  for (const seed of SEEDS) cases.push({ name: `preset:${id}#${seed}`, config: core.buildSoundConfig({ preset: id }), seed, presetId: id });
}
for (const [label, designs] of [["game", core.GAME_PACK_DESIGNS], ["digital", core.DIGITAL_PACK_DESIGNS ?? []]]) {
  designs.forEach((design, i) => {
    for (const seed of [1042, 2042]) {
      cases.push({ name: `${label}[${i}]:${design.name ?? design.preset}#${seed}`, config: core.buildSoundConfig(design), seed, presetId: design.preset });
    }
  });
}

// ── Run ─────────────────────────────────────────────────────────────────────

const work = mkdtempSync(join(tmpdir(), "makesfx-parity-"));
const results = [];
try {
  for (const c of cases) {
    const ts = core.renderMasteredBuffer(c.config, { seed: c.seed, presetId: c.presetId });
    const configPath = join(work, "config.json");
    const rawPath = join(work, "out.f32");
    writeFileSync(configPath, JSON.stringify(c.config));
    const args = ["legacy", configPath, "--seed", String(c.seed), "--raw", rawPath];
    if (c.presetId) args.push("--preset-id", c.presetId);
    let report;
    try {
      report = JSON.parse(execFileSync(cliPath, args, { encoding: "utf8" }));
    } catch (err) {
      results.push({ name: c.name, error: String(err.stdout || err.message).trim() });
      continue;
    }
    const raw = readFileSync(rawPath);
    const interleaved = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let cppMono;
    if (report.channels === 2) {
      const left = new Float32Array(report.frames);
      const right = new Float32Array(report.frames);
      for (let i = 0; i < report.frames; i++) {
        left[i] = interleaved[2 * i];
        right[i] = interleaved[2 * i + 1];
      }
      cppMono = core.mixDownMono(left, right);
    } else {
      cppMono = interleaved.slice();
    }
    const tsMono = ts.mono;

    let maxDiff = 0;
    const n = Math.min(tsMono.length, cppMono.length);
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(tsMono[i] - cppMono[i]));

    const r = {
      name: c.name,
      stereo: [ts.stereo, report.channels === 2],
      lufs: [core.measureLufs(tsMono), core.measureLufs(cppMono)],
      truePeak: [core.measureTruePeak(tsMono), core.measureTruePeak(cppMono)],
      durationMs: [(tsMono.length / SR) * 1000, (cppMono.length / SR) * 1000],
      lsdDb: logSpectralDistance(tsMono, cppMono),
      maxAbsDiff: maxDiff,
    };
    r.failures = [];
    r.silent = r.lufs[0] < SILENT_LUFS && r.lufs[1] < SILENT_LUFS;
    if (r.stereo[0] !== r.stereo[1]) r.failures.push("stereo");
    if (r.silent) {
      if (Math.abs(r.durationMs[0] - r.durationMs[1]) > LIMITS.durationMs) r.failures.push("duration");
      results.push(r);
      continue;
    }
    if (Math.abs(r.lufs[0] - r.lufs[1]) > LIMITS.lufs) r.failures.push("lufs");
    if (r.truePeak[1] > LIMITS.truePeakDbtp && r.truePeak[0] <= LIMITS.truePeakDbtp) r.failures.push("true_peak");
    if (Math.abs(r.durationMs[0] - r.durationMs[1]) > LIMITS.durationMs) r.failures.push("duration");
    if (r.lsdDb > LIMITS.lsdDb) r.failures.push("spectrum");
    results.push(r);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// ── Report ──────────────────────────────────────────────────────────────────

const failed = results.filter((r) => r.error || r.failures.length);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
for (const r of results) {
  if (!verbose && !r.error && !r.failures.length && !r.silent) continue;
  if (r.error) {
    console.log(`ERROR  ${r.name}: ${r.error}`);
    continue;
  }
  if (r.silent) {
    console.log(`${r.failures.length ? "FAIL " : "SILENT"} ${r.name.padEnd(36)} both renders below ${SILENT_LUFS} LUFS (TS ${fmt(r.lufs[0], 1)}, C++ ${fmt(r.lufs[1], 1)})`);
    continue;
  }
  console.log(
    `${r.failures.length ? "FAIL " : "ok   "} ${r.name.padEnd(36)} ΔLUFS ${fmt(r.lufs[1] - r.lufs[0])}  ` +
      `TP ${fmt(r.truePeak[0])}/${fmt(r.truePeak[1])}  Δdur ${fmt(r.durationMs[1] - r.durationMs[0], 3)} ms  ` +
      `LSD ${fmt(r.lsdDb)} dB  max|Δ| ${r.maxAbsDiff.toExponential(1)}` +
      (r.failures.length ? `  [${r.failures.join(", ")}]` : ""),
  );
}
const ok = results.filter((r) => !r.error && !r.failures.length && !r.silent);
const silent = results.filter((r) => r.silent && !r.failures.length);
const worst = (key, f) => Math.max(...ok.map(f));
if (ok.length) {
  console.log(
    `\nparity: ${ok.length + silent.length}/${results.length} cases pass, ${silent.length} silent in both  ` +
      `(worst ΔLUFS ${fmt(worst("l", (r) => Math.abs(r.lufs[1] - r.lufs[0])))}, ` +
      `worst LSD ${fmt(worst("s", (r) => r.lsdDb))} dB, ` +
      `worst max|Δ| ${worst("d", (r) => r.maxAbsDiff).toExponential(1)})`,
  );
} else {
  console.log(`\nparity: 0/${results.length} cases pass`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
