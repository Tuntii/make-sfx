#!/usr/bin/env node
/**
 * Goal verification script — writes evidence logs to SCRATCH dir.
 * Usage: node scripts/verify-goal.mjs [scratchDir]
 */
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const scratch = process.argv[2] ?? join(tmpdir(), "make-sfx-goal-verify");

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

// 1. Build
import { spawn } from "node:child_process";
function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(out))));
  });
}

const buildOut = await run("pnpm", ["build"], root);
const testOut = await run("pnpm", ["test"], root);
const testsPass = /Tests\s+\d+ passed/.test(testOut) && !/FAIL/.test(testOut);
await log("test.log", [testOut, `PASS: ${testsPass}`]);

// 2. Library launch
const core = await import(pathToFileURL(join(root, "packages/core/dist/index.js")).href);
const gameConfig = core.buildSoundConfig({
  preset: "jump",
  master: { duration: 0.2 },
  oscillators: [{ enabled: true, mix: 0.3, detune: 12 }],
  modulators: [{ enabled: true, target: "amplitude", rate: 5, depth: 0.3 }],
  texture: { transient: 0.4 },
  fx: { reverbMix: 0.1 },
});
const wav = core.renderSound(gameConfig);
await log("library-launch.log", [
  `RIFF header: ${riff(wav)}`,
  `WAV length: ${wav.length}`,
  `duration: ${gameConfig.master?.duration}`,
  `PASS: ${riff(wav) === "RIFF" && wav.length > 1000}`,
]);

// 3. MCP export path
const mcpUtils = await import(pathToFileURL(join(root, "packages/mcp/dist/utils.js")).href);
const exportDir = join(scratch, "mcp-export");
await mkdir(exportDir, { recursive: true });
const result = await mcpUtils.createSound(
  {
    name: "jump",
    preset: "jump",
    punch: 0.5,
    master: { duration: 0.15 },
    oscillators: [{ enabled: true, mix: 0.3, detune: 7 }],
    modulators: [{ enabled: true, target: "amplitude", rate: 6, depth: 0.2 }],
    texture: { transient: 0.3 },
    fx: { reverbMix: 0.1 },
  },
  exportDir,
);
const exportBuf = await readFile(result.filePath);
await log("mcp-export.log", [
  `file: ${result.filePath}`,
  `RIFF: ${riff(exportBuf)}`,
  `length: ${exportBuf.length}`,
  `code has renderSound: ${result.code.includes("renderSound")}`,
  `PASS: ${riff(exportBuf) === "RIFF" && result.code.includes("renderSound")}`,
]);
await rm(exportDir, { recursive: true, force: true });

// 4. Describe scenario
const jump = core.buildSoundConfig(core.GAME_PACK_DESIGNS[0]);
const blink = core.buildSoundConfig(core.GAME_PACK_DESIGNS[1]);
await log("describe-scenario.log", [
  `jump frequency: ${jump.params.frequency}`,
  `blink frequency: ${blink.params.frequency}`,
  `blink > jump: ${blink.params.frequency > jump.params.frequency}`,
  `blink pitchShift 1.5: ${Math.abs(blink.params.frequency - core.presets.blink.frequency * 1.5) < 1}`,
  `PASS: ${blink.params.frequency > jump.params.frequency}`,
]);

// 5. MCP load
try {
  await import(pathToFileURL(join(root, "packages/mcp/dist/server.js")).href);
  await log("mcp-load.log", ["MCP server module loaded OK", "PASS: true"]);
} catch (e) {
  await log("mcp-load.log", [`FAIL: ${e.message}`]);
}

// 6. FX tail evidence
const dryWav = core.renderSound({ params: core.presets.blink });
const revWav = core.renderSound({
  params: core.presets.blink,
  fx: { reverbMix: 0.4, reverbDecay: 1.2 },
});
const drySamples = (dryWav.length - 44) / 2;
const revSamples = (revWav.length - 44) / 2;
await log("fx-tail.log", [
  `dry PCM samples: ${drySamples}`,
  `reverb PCM samples: ${revSamples}`,
  `tail extension: ${revSamples - drySamples}`,
  `computeFxTailSamples: ${core.computeFxTailSamples({ reverbMix: 0.4, reverbDecay: 1.2 })}`,
  `PASS: ${revSamples > drySamples}`,
]);

// 7. Layer schema structure
const schema = core.getParameterSchema();
await log("schema-evidence.log", [
  `master keys: ${schema.master.map((p) => p.key).join(", ")}`,
  `textureFx count: ${schema.textureFx.length}`,
  `osc2 params: ${schema.oscillatorLayers.osc2.length}`,
  `lfo1 params: ${schema.modulators.lfo1.length}`,
  `layer structure: ${schema.oscillatorLayers.structure}`,
  `osc2 root keys: ${schema.oscillatorLayers.osc2.root.map((p) => p.key).join(", ")}`,
  `osc2 params keys: ${schema.oscillatorLayers.osc2.params.map((p) => p.key).join(", ")}`,
  `totalParams: ${schema.totalParams}`,
  `PASS: ${schema.master.length > 0 && schema.textureFx.length >= 10 && schema.totalParams >= 70 && schema.oscillatorLayers.structure.includes("params")}`,
]);

console.log(`Verification complete → ${scratch}`);
for (const { name, pass } of results) {
  console.log(`  ${pass ? "✓" : "✗"} ${name}`);
}