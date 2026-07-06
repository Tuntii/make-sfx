#!/usr/bin/env node
/**
 * v0.5.0 engineer pipeline verification — writes evidence to SCRATCH dir.
 * Usage: node scripts/verify-engineer.mjs [scratchDir]
 */
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const scratch =
  process.argv[2] ??
  join(tmpdir(), "grok-goal-72f7266a157b", "implementer");

await mkdir(scratch, { recursive: true });

const results = [];

async function log(name, lines) {
  const text = lines.join("\n");
  results.push({ name, pass: text.includes("PASS: true") });
  await writeFile(join(scratch, name), text);
}

function riff(buf) {
  return String.fromCharCode(...buf.slice(0, 4));
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(out))));
  });
}

function withinBand(lufs, target, tol = 2) {
  return lufs >= target - tol && lufs <= target + tol;
}

// 1. Build + test
const testOut = await run("pnpm", ["test"], root);
const testsPass = /Tests\s+\d+ passed/.test(testOut) && !/FAIL/.test(testOut);
await log("test.log", [testOut, `PASS: ${testsPass}`]);

// 2. Engineer pipeline
const core = await import(pathToFileURL(join(root, "packages/core/dist/index.js")).href);
const jumpConfig = core.buildSoundConfig(core.GAME_PACK_DESIGNS[0]);
const powerupConfig = core.buildSoundConfig(core.GAME_PACK_DESIGNS[4]);

const wav1 = core.renderVariant(jumpConfig, 1, { category: "combat", presetId: "jump" });
const wav2 = core.renderVariant(jumpConfig, 2, { category: "combat", presetId: "jump" });
const samples1 = core.renderMasteredBuffer(jumpConfig, { seed: 1, category: "combat", presetId: "jump" }).mono;
const samples2 = core.renderMasteredBuffer(jumpConfig, { seed: 2, category: "combat", presetId: "jump" }).mono;
let floatDiff = 0;
for (let i = 0; i < Math.min(samples1.length, samples2.length); i++) {
  floatDiff += Math.abs(samples1[i] - samples2[i]);
}
const pcmDiff = floatDiff > 0;

const baseFreq = jumpConfig.params.frequency;
const varied = core.applyVariation(jumpConfig, 99);
const freqOk =
  varied.params.frequency >= baseFreq * 0.8 &&
  varied.params.frequency <= baseFreq * 1.2;

const categoryChecks = [
  { label: "ui", preset: "blink", category: "ui", target: -14 },
  { label: "combat", preset: "hit", category: "combat", target: -9 },
  { label: "pickup", preset: "coin", category: "pickup", target: -12 },
  { label: "ambient", preset: "footstep", category: "ambient", target: -18 },
  { label: "stinger-stereo-pack", preset: "powerup", category: "stinger", target: -11, usePack: true, seed: 1042 },
];

const lufsResults = categoryChecks.map((c) => {
  const config = c.usePack ? powerupConfig : core.buildSoundConfig({ preset: c.preset });
  const mastered = core.renderMasteredBuffer(config, {
    category: c.category,
    presetId: c.preset,
    seed: c.seed,
  });
  const lufs = core.measureLufs(mastered.mono);
  const ok = withinBand(lufs, c.target);
  return { label: c.label, lufs, target: c.target, ok, stereo: mastered.stereo };
});

const allCategoriesOk = lufsResults.every((r) => r.ok);
const peakOk = core.measureTruePeak(samples1) <= -0.99;

await log("engineer-pipeline.log", [
  `wav1 RIFF: ${riff(wav1)}`,
  `wav2 RIFF: ${riff(wav2)}`,
  `different seeds differ: ${pcmDiff}`,
  `freq within ±20%: ${freqOk} (${varied.params.frequency} vs ${baseFreq})`,
  ...lufsResults.map((r) => `${r.label} LUFS: ${r.lufs.toFixed(2)} (target ${r.target} ±2, stereo=${r.stereo})`),
  `all 5 categories within band: ${allCategoriesOk}`,
  `true peak <= -1 dBTP: ${core.measureTruePeak(samples1).toFixed(2)}`,
  `PASS: ${riff(wav1) === "RIFF" && pcmDiff && freqOk && allCategoriesOk && peakOk}`,
]);

// 3. MCP describe category
const describe = await import(pathToFileURL(join(root, "packages/mcp/dist/describe.js")).href);
const parsed = describe.parseDescription("zıplama ve tiz blink");
const allHaveCategory = parsed.designs.every((d) => d.category);
const jumpCombat = parsed.designs[0].category === "combat";
const blinkUi = parsed.designs[1].category === "ui";

const mcpUtils = await import(pathToFileURL(join(root, "packages/mcp/dist/utils.js")).href);
const exportDir = join(scratch, "mcp-category");
await mkdir(exportDir, { recursive: true });
const created = await mcpUtils.createSound(
  { ...parsed.designs[0], name: parsed.designs[0].name },
  exportDir,
);
const powerupCreated = await mcpUtils.createSound(
  { ...core.GAME_PACK_DESIGNS[4], name: "powerup", seed: 1042 },
  exportDir,
  { seed: 1042 },
);
const exportBuf = await readFile(created.filePath);
const powerupBuf = await readFile(powerupCreated.filePath);
await log("mcp-category.log", [
  `designs: ${parsed.designs.length}`,
  `categories: ${parsed.designs.map((d) => d.category).join(", ")}`,
  `jump combat: ${jumpCombat}`,
  `blink ui: ${blinkUi}`,
  `export RIFF: ${riff(exportBuf)}`,
  `export length: ${exportBuf.length}`,
  `jump measuredLufs: ${created.measuredLufs?.toFixed(2)} withinTarget: ${created.withinLoudnessTarget}`,
  `powerup measuredLufs: ${powerupCreated.measuredLufs?.toFixed(2)} withinTarget: ${powerupCreated.withinLoudnessTarget}`,
  `powerup RIFF: ${riff(powerupBuf)}`,
  `PASS: ${allHaveCategory && jumpCombat && blinkUi && riff(exportBuf) === "RIFF" && exportBuf.length > 500 && powerupCreated.withinLoudnessTarget === true}`,
]);
await rm(exportDir, { recursive: true, force: true });

// 4. Variation pack — jump + powerup 4 seeds
const seeds = [1, 2, 3, 4].map((s) => s * 1000 + 42);
const packDir = join(scratch, "variation-pack");
await mkdir(packDir, { recursive: true });

const jumpLufs = [];
const powerupLufs = [];
for (const seed of seeds) {
  const jumpMastered = core.renderMasteredBuffer(jumpConfig, {
    seed,
    category: "combat",
    presetId: "jump",
  });
  jumpLufs.push(core.measureLufs(jumpMastered.mono));

  const powerupMastered = core.renderMasteredBuffer(powerupConfig, {
    seed,
    category: "stinger",
    presetId: "powerup",
  });
  powerupLufs.push(core.measureLufs(powerupMastered.mono));
}

let pairwiseDiff = false;
const packSamples = seeds.map((seed) =>
  core.renderMasteredBuffer(jumpConfig, { seed, category: "combat", presetId: "jump" }).mono,
);
for (let i = 0; i < packSamples.length; i++) {
  for (let j = i + 1; j < packSamples.length; j++) {
    let diff = 0;
    for (let k = 0; k < Math.min(packSamples[i].length, packSamples[j].length); k++) {
      diff += Math.abs(packSamples[i][k] - packSamples[j][k]);
    }
    if (diff > 0) {
      pairwiseDiff = true;
      break;
    }
  }
  if (pairwiseDiff) break;
}

const jumpLufsOk = jumpLufs.every((l) => withinBand(l, -9));
const powerupLufsOk = powerupLufs.every((l) => withinBand(l, -11));
await log("variation-pack.log", [
  `seeds: ${seeds.join(", ")}`,
  `jump LUFS: ${jumpLufs.map((l) => l.toFixed(2)).join(", ")}`,
  `powerup LUFS: ${powerupLufs.map((l) => l.toFixed(2)).join(", ")}`,
  `pairwise PCM diff: ${pairwiseDiff}`,
  `jump combat band: ${jumpLufsOk}`,
  `powerup stinger band: ${powerupLufsOk}`,
  `PASS: ${pairwiseDiff && jumpLufsOk && powerupLufsOk}`,
]);
await rm(packDir, { recursive: true, force: true });

console.log(`Engineer verification → ${scratch}`);
for (const { name, pass } of results) {
  console.log(`  ${pass ? "✓" : "✗"} ${name}`);
}