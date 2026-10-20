// Exports the 1.x presets and pack designs as SoundConfig JSON for the golden
// corpus, and appends any missing `legacy` entries to golden.txt (hash
// placeholder; fill with `makesfx-cli golden golden.txt --update`).
//
// usage: node export-legacy.mjs <packages/core/dist/index.js>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const corePath = process.argv[2];
if (!corePath) {
  console.error("usage: node export-legacy.mjs <packages/core/dist/index.js>");
  process.exit(2);
}
const core = await import(pathToFileURL(corePath).href);
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "legacy");
mkdirSync(outDir, { recursive: true });

const entries = [];
const add = (name, config, seed) => {
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(config, null, 2) + "\n");
  entries.push(`legacy_${name}_s${seed} legacy legacy/${name}.json ${seed} -`);
};

for (const p of core.listPresets()) {
  const id = p.id ?? p;
  add(`preset_${id}`, core.buildSoundConfig({ preset: id }), 1);
}
core.GAME_PACK_DESIGNS.forEach((d, i) => add(`game_${i}_${d.name ?? d.preset}`, core.buildSoundConfig(d), 1042));
(core.DIGITAL_PACK_DESIGNS ?? []).forEach((d, i) =>
  add(`digital_${i}_${d.name ?? d.preset}`, core.buildSoundConfig(d), 1042),
);

const goldenPath = join(here, "golden.txt");
const golden = readFileSync(goldenPath, "utf8");
const known = new Set(golden.split(/\r?\n/).map((l) => l.split(/\s+/)[0]));
const missing = entries.filter((e) => !known.has(e.split(" ")[0]));
if (missing.length) {
  const placeholder = "0".repeat(64);
  writeFileSync(goldenPath, golden.replace(/\s*$/, "\n") + missing.map((e) => `${e} ${placeholder}`).join("\n") + "\n");
}
console.log(`${entries.length} configs exported, ${missing.length} golden entries added`);
