#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildSoundConfig, GAME_PACK_DESIGNS, listPresets, renderSound } from "./index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    preset: { type: "string", short: "p" },
    out: { type: "string", short: "o" },
    "pitch-shift": { type: "string" },
    duration: { type: "string" },
    punch: { type: "string" },
    count: { type: "string" },
    pack: { type: "boolean" },
    "base-seed": { type: "string" },
    help: { type: "boolean", short: "h" },
    list: { type: "boolean", short: "l" },
  },
});

function printHelp() {
  console.log(`make-sfx — procedural game SFX CLI

Usage:
  make-sfx --list
  make-sfx --preset jump --out ./assets/jump.wav
  make-sfx --preset coin --count 8 --out variants/          # 8 seeded variants
  make-sfx --pack --out assets/sfx                          # full GAME_PACK_DESIGNS (25+)
  make-sfx --pack --count 3 --base-seed 100 --out pack-v/   # 3 variants per design

Options:
  -p, --preset       Preset id (jump, blink, coin, hit, laser…)
  -o, --out          Output WAV path or directory for batches
  --pitch-shift      Engineer modifier (1.5 = higher pitch)
  --duration         master.duration in seconds
  --punch            Punch modifier 0–1
  --count            Number of variants to generate (uses seed)
  --pack             Render the full GAME_PACK_DESIGNS (recommended for games)
  --base-seed        Starting seed for deterministic variants (default 1)
  -l, --list         List available presets
  -h, --help         Show help
`);
}

async function main() {
  if (values.help) {
    printHelp();
    return;
  }

  if (values.list) {
    for (const p of listPresets()) {
      console.log(`${p.id.padEnd(12)} ${p.name} — ${p.tags.slice(0, 4).join(", ")}`);
    }
    return;
  }

  let count = 1;
  if (values.count != null) {
    const n = parseInt(String(values.count), 10);
    count = Number.isFinite(n) && n >= 1 ? n : 1;
  }
  let baseSeed = 1;
  if (values["base-seed"] != null) {
    const n = parseInt(String(values["base-seed"]), 10);
    baseSeed = Number.isFinite(n) ? n : 1;
  }
  const isPack = !!values.pack;
  const outArg = values.out ? resolve(values.out) : undefined;

  if (isPack) {
    // Full game pack using GAME_PACK_DESIGNS
    const outDir = outArg || resolve("assets/sfx");
    await mkdir(outDir, { recursive: true });
    let rendered = 0;
    for (let i = 0; i < GAME_PACK_DESIGNS.length; i++) {
      const design = GAME_PACK_DESIGNS[i];
      const baseName = (design.name || design.preset || `sfx${i}`).toString().replace(/\s+/g, "-");
      for (let v = 0; v < count; v++) {
        const seed = baseSeed + v + i * 1000; // stable offset per design
        const config = buildSoundConfig({ ...design, seed });
        const fileName = count > 1 ? `${String(i).padStart(2, "0")}-${baseName}-v${v}.wav` : `${String(i).padStart(2, "0")}-${baseName}.wav`;
        const outPath = join(outDir, fileName);
        await writeFile(outPath, renderSound(config));
        rendered++;
      }
    }
    console.log(`✓ Pack: ${rendered} files → ${outDir}`);
    return;
  }

  if (!values.preset) {
    console.error("Error: --preset required (or use --pack). Run make-sfx --help");
    process.exit(1);
  }

  const baseConfig = buildSoundConfig({
    preset: values.preset,
    pitchShift: values["pitch-shift"] ? Number(values["pitch-shift"]) : undefined,
    punch: values.punch ? Number(values.punch) : undefined,
    master: values.duration ? { duration: Number(values.duration) } : undefined,
  });

  if (count > 1) {
    const outDir = outArg || resolve(`${values.preset}-variants`);
    await mkdir(outDir, { recursive: true });
    for (let i = 0; i < count; i++) {
      const seed = baseSeed + i;
      const cfg = { ...baseConfig, seed };
      const fileName = `${values.preset}-s${seed}.wav`;
      const outPath = join(outDir, fileName);
      await writeFile(outPath, renderSound(cfg));
      console.log(`✓ ${outPath}`);
    }
    console.log(`✓ Generated ${count} variants of ${values.preset}`);
    return;
  }

  // Single file (original behavior)
  const outPath = outArg ?? resolve(`${values.preset}.wav`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, renderSound(baseConfig));
  console.log(`✓ ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});