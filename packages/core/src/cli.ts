#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildSoundConfig, listPresets, renderSound } from "./index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    preset: { type: "string", short: "p" },
    out: { type: "string", short: "o" },
    "pitch-shift": { type: "string" },
    duration: { type: "string" },
    punch: { type: "string" },
    help: { type: "boolean", short: "h" },
    list: { type: "boolean", short: "l" },
  },
});

function printHelp() {
  console.log(`make-sfx — procedural game SFX CLI

Usage:
  make-sfx --list
  make-sfx --preset jump --out ./assets/jump.wav
  make-sfx --preset blink --pitch-shift 1.5 --out blink.wav
  make-sfx --preset laser --duration 0.3 --punch 0.5 --out laser.wav

Options:
  -p, --preset       Preset id (jump, blink, coin, hit, laser…)
  -o, --out          Output WAV path (default: <preset>.wav)
  --pitch-shift      Engineer modifier (1.5 = higher pitch)
  --duration         master.duration in seconds
  --punch            Punch modifier 0–1
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

  if (!values.preset) {
    console.error("Error: --preset required. Run make-sfx --help");
    process.exit(1);
  }

  const config = buildSoundConfig({
    preset: values.preset,
    pitchShift: values["pitch-shift"] ? Number(values["pitch-shift"]) : undefined,
    punch: values.punch ? Number(values.punch) : undefined,
    master: values.duration ? { duration: Number(values.duration) } : undefined,
  });

  const outPath = resolve(values.out ?? `${values.preset}.wav`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, renderSound(config));
  console.log(`✓ ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});