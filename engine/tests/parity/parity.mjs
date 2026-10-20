// TS ↔ C++ parity for the make-sfx 1.x pipeline (spec §12.3).
//
// make-sfx-core 2.0 renders through the C++ engine (WASM); the 1.x TypeScript
// engine was removed in M2. Its renders live on in reference.json: per case
// the golden config file, seed, and the TS loudness, true peak, length and
// 1/3-octave band levels. `check` renders the same cases with
// `makesfx-cli legacy` and compares against the reference.
//
// usage: node parity.mjs record <1.x core dist/index.js> <reference.json>
//        node parity.mjs check <core dist/index.js> <makesfx-cli> <reference.json> [--json out.json] [--verbose]
//
// `record` needs a make-sfx-core 1.x build (TS engine). `check` uses
// make-sfx-core only to measure loudness and true peak.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [mode, ...args] = process.argv.slice(2);
function usage() {
  console.error("usage: node parity.mjs record <core dist index.js> <reference.json>");
  console.error("       node parity.mjs check <core dist index.js> <makesfx-cli> <reference.json> [--json out.json] [--verbose]");
  process.exit(2);
}
if ((mode !== "record" && mode !== "check") || !args[0]) usage();

const core = await import(pathToFileURL(args[0]).href);
const SR = 44100;
const goldenLegacyDir = join(dirname(fileURLToPath(import.meta.url)), "..", "golden", "legacy");

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
function logSpectralDistance(la, lb) {
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

const round = (v, digits) => (v === null || !Number.isFinite(v) ? v : Number(v.toFixed(digits)));

// ── record: TS reference renders ────────────────────────────────────────────

if (mode === "record") {
  const outPath = args[1];
  if (!outPath) usage();
  // Configs are the golden corpus files written by export-legacy.mjs.
  const groups = [];
  for (const p of core.listPresets()) {
    const id = p.id ?? p;
    groups.push({ name: `preset:${id}`, file: `preset_${id}.json`, presetId: id, seeds: SEEDS });
  }
  for (const [label, designs] of [["game", core.GAME_PACK_DESIGNS], ["digital", core.DIGITAL_PACK_DESIGNS ?? []]]) {
    designs.forEach((design, i) => {
      const tag = design.name ?? design.preset;
      groups.push({ name: `${label}[${i}]:${tag}`, file: `${label}_${i}_${tag}.json`, presetId: design.preset, seeds: [1042, 2042] });
    });
  }
  const cases = [];
  for (const g of groups) {
    const config = JSON.parse(readFileSync(join(goldenLegacyDir, g.file), "utf8"));
    for (const seed of g.seeds) {
      const ts = core.renderMasteredBuffer(config, { seed, presetId: g.presetId });
      cases.push({
        name: `${g.name}#${seed}`,
        file: g.file,
        seed,
        presetId: g.presetId,
        stereo: ts.stereo,
        lufs: round(core.measureLufs(ts.mono), 4),
        truePeak: round(core.measureTruePeak(ts.mono), 4),
        frames: ts.mono.length,
        bands: bandLevels(ts.mono, ts.mono.length).map((v) => round(v, 3)),
      });
    }
  }
  const reference = { note: "make-sfx-core 1.x TypeScript engine renders, written by `parity.mjs record`", cases };
  writeFileSync(outPath, JSON.stringify(reference) + "\n");
  console.log(`recorded ${cases.length} cases to ${relative(process.cwd(), outPath)}`);
  process.exit(0);
}

// ── check: C++ renders against the reference ────────────────────────────────

const [, cliPath, referencePath, ...rest] = args;
if (!cliPath || !referencePath) usage();
const verbose = rest.includes("--verbose");
const jsonOut = rest.includes("--json") ? rest[rest.indexOf("--json") + 1] : undefined;
const reference = JSON.parse(readFileSync(referencePath, "utf8"));

const work = mkdtempSync(join(tmpdir(), "makesfx-parity-"));
const results = [];
try {
  for (const c of reference.cases) {
    const rawPath = join(work, "out.f32");
    const cliArgs = ["legacy", join(goldenLegacyDir, c.file), "--seed", String(c.seed), "--raw", rawPath];
    if (c.presetId) cliArgs.push("--preset-id", c.presetId);
    let report;
    try {
      report = JSON.parse(execFileSync(cliPath, cliArgs, { encoding: "utf8" }));
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

    const r = {
      name: c.name,
      stereo: [c.stereo, report.channels === 2],
      lufs: [c.lufs, core.measureLufs(cppMono)],
      truePeak: [c.truePeak, core.measureTruePeak(cppMono)],
      durationMs: [(c.frames / SR) * 1000, (cppMono.length / SR) * 1000],
      lsdDb: logSpectralDistance(c.bands, bandLevels(cppMono, c.frames)),
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
      `LSD ${fmt(r.lsdDb)} dB` +
      (r.failures.length ? `  [${r.failures.join(", ")}]` : ""),
  );
}
const ok = results.filter((r) => !r.error && !r.failures.length && !r.silent);
const silent = results.filter((r) => r.silent && !r.failures.length);
const worst = (f) => Math.max(...ok.map(f));
if (ok.length) {
  console.log(
    `\nparity: ${ok.length + silent.length}/${results.length} cases pass, ${silent.length} silent in both  ` +
      `(worst ΔLUFS ${fmt(worst((r) => Math.abs(r.lufs[1] - r.lufs[0])))}, worst LSD ${fmt(worst((r) => r.lsdDb))} dB)`,
  );
} else {
  console.log(`\nparity: 0/${results.length} cases pass`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
