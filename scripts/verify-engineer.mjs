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

// 1. Build + test
const testOut = await run("pnpm", ["test"], root);
const testsPass = /Tests\s+\d+ passed/.test(testOut) && !/FAIL/.test(testOut);
await log("test.log", [testOut, `PASS: ${testsPass}`]);

// 2. Engineer pipeline
const core = await import(pathToFileURL(join(root, "packages/core/dist/index.js")).href);
const jumpConfig = core.buildSoundConfig(core.GAME_PACK_DESIGNS[0]);
const wav1 = core.renderVariant(jumpConfig, 1, { category: "combat", presetId: "jump" });
const wav2 = core.renderVariant(jumpConfig, 2, { category: "combat", presetId: "jump" });
const samples1 = core.renderSamples(jumpConfig, { seed: 1, category: "combat", presetId: "jump" });
const samples2 = core.renderSamples(jumpConfig, { seed: 2, category: "combat", presetId: "jump" });
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

const blinkSamples = core.renderSamples(
  core.buildSoundConfig({ preset: "blink" }),
  { category: "ui", presetId: "blink" },
);
const uiLufs = core.measureLufs(blinkSamples);
const uiOk = uiLufs >= -16 && uiLufs <= -12;

const hitSamples = core.renderSamples(
  core.buildSoundConfig({ preset: "hit" }),
  { category: "combat", presetId: "hit" },
);
const combatLufs = core.measureLufs(hitSamples);
const combatOk = combatLufs >= -11 && combatLufs <= -7;

const peakOk = core.measureTruePeak(hitSamples) <= -0.99;

await log("engineer-pipeline.log", [
  `wav1 RIFF: ${riff(wav1)}`,
  `wav2 RIFF: ${riff(wav2)}`,
  `different seeds differ: ${pcmDiff}`,
  `freq within ±20%: ${freqOk} (${varied.params.frequency} vs ${baseFreq})`,
  `ui LUFS: ${uiLufs.toFixed(2)} (target -14 ±2)`,
  `combat LUFS: ${combatLufs.toFixed(2)} (target -9 ±2)`,
  `true peak <= -1 dBTP: ${core.measureTruePeak(hitSamples).toFixed(2)}`,
  `PASS: ${riff(wav1) === "RIFF" && pcmDiff && freqOk && uiOk && combatOk && peakOk}`,
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
const exportBuf = await readFile(created.filePath);
await log("mcp-category.log", [
  `designs: ${parsed.designs.length}`,
  `categories: ${parsed.designs.map((d) => d.category).join(", ")}`,
  `jump combat: ${jumpCombat}`,
  `blink ui: ${blinkUi}`,
  `export RIFF: ${riff(exportBuf)}`,
  `export length: ${exportBuf.length}`,
  `measuredLufs: ${created.measuredLufs?.toFixed(2)}`,
  `PASS: ${allHaveCategory && jumpCombat && blinkUi && riff(exportBuf) === "RIFF" && exportBuf.length > 500}`,
]);
await rm(exportDir, { recursive: true, force: true });

// 4. Variation pack — jump 4 seeds
const seeds = [1, 2, 3, 4].map((s) => s * 1000 + 42);
const packDir = join(scratch, "variation-pack");
await mkdir(packDir, { recursive: true });
const packWavs = [];
const packLufs = [];

for (const seed of seeds) {
  const wav = core.renderVariant(jumpConfig, seed, { category: "combat", presetId: "jump" });
  const path = join(packDir, `jump-s${seed}.wav`);
  await writeFile(path, wav);
  packWavs.push(wav);
  packLufs.push(
    core.measureLufs(
      core.renderSamples(jumpConfig, { seed, category: "combat", presetId: "jump" }),
    ),
  );
}

let pairwiseDiff = false;
const packSamples = seeds.map((seed) =>
  core.renderSamples(jumpConfig, { seed, category: "combat", presetId: "jump" }),
);
for (let i = 0; i < packSamples.length; i++) {
  for (let j = i + 1; j < packSamples.length; j++) {
    const a = packSamples[i];
    const b = packSamples[j];
    let diff = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) diff += Math.abs(a[k] - b[k]);
    if (diff > 0) {
      pairwiseDiff = true;
      break;
    }
  }
  if (pairwiseDiff) break;
}

const lufsBandOk = packLufs.every((l) => l >= -11 && l <= -7);
await log("variation-pack.log", [
  `seeds: ${seeds.join(", ")}`,
  `LUFS: ${packLufs.map((l) => l.toFixed(2)).join(", ")}`,
  `pairwise PCM diff: ${pairwiseDiff}`,
  `all combat LUFS band: ${lufsBandOk}`,
  `PASS: ${pairwiseDiff && lufsBandOk}`,
]);
await rm(packDir, { recursive: true, force: true });

console.log(`Engineer verification → ${scratch}`);
for (const { name, pass } of results) {
  console.log(`  ${pass ? "✓" : "✗"} ${name}`);
}