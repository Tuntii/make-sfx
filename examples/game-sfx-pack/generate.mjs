import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSoundConfig,
  GAME_PACK_DESIGNS,
  renderSound,
  toCodeSnippet,
  toConfigSnippet,
  paramsToZzfxArray,
} from "@make-sfx/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "public", "assets", "sfx");

await mkdir(outDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  outputDir: "public/assets/sfx",
  source: "GAME_PACK_DESIGNS — same as MCP sfx_design_batch",
  sounds: [],
};

for (const design of GAME_PACK_DESIGNS) {
  const config = buildSoundConfig(design);
  const wav = renderSound(config);
  const filePath = join(outDir, `${design.name}.wav`);
  await writeFile(filePath, wav);

  manifest.sounds.push({
    name: design.name,
    preset: design.preset,
    design,
    config,
    file: `public/assets/sfx/${design.name}.wav`,
    params: config.params,
    zzfx: paramsToZzfxArray(config.params),
    code: toConfigSnippet(design.name, config),
    codeSimple: toCodeSnippet({ id: design.name, preset: design.preset, ...config.params }),
  });

  console.log(`✓ ${design.name}.wav`);
}

await writeFile(
  join(__dirname, "sounds.json"),
  JSON.stringify(manifest, null, 2),
);

console.log(`\nGenerated ${GAME_PACK_DESIGNS.length} sounds → ${outDir}`);