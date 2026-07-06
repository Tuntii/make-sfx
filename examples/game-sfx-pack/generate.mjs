import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSoundConfig,
  GAME_PACK_DESIGNS,
  getTargetLufs,
  measureLufs,
  measureTruePeak,
  renderSound,
  renderSamples,
  toCodeSnippet,
  toConfigSnippet,
  paramsToZzfxArray,
} from "make-sfx-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "public", "assets", "sfx");
const VARIANTS_PER_SOUND = 4;

await mkdir(outDir, { recursive: true });

const manifest = {
  version: 2,
  generatedAt: new Date().toISOString(),
  outputDir: "public/assets/sfx",
  source: "GAME_PACK_DESIGNS — MCP sfx_game_pack equivalent",
  variantsPerSound: VARIANTS_PER_SOUND,
  sounds: [],
};

for (const design of GAME_PACK_DESIGNS) {
  const config = buildSoundConfig(design);
  const category = config.category;
  const targetLufs = category ? getTargetLufs(category) : undefined;
  const variants = [];

  for (let s = 1; s <= VARIANTS_PER_SOUND; s++) {
    const seed = s * 1000 + 42;
    const renderOpts = { seed, category, presetId: design.preset };
    const wav = renderSound(config, renderOpts);
    const fileName = `${design.name}-s${s}.wav`;
    const filePath = join(outDir, fileName);
    await writeFile(filePath, wav);

    const samples = renderSamples(config, renderOpts);
    variants.push({
      seed,
      file: `public/assets/sfx/${fileName}`,
      measuredLufs: measureLufs(samples),
      truePeakDbTp: measureTruePeak(samples),
      length: wav.length,
    });
    console.log(`✓ ${fileName} (${category}, seed ${seed})`);
  }

  manifest.sounds.push({
    name: design.name,
    preset: design.preset,
    category,
    targetLufs,
    design,
    config,
    params: config.params,
    zzfx: paramsToZzfxArray(config.params),
    code: toConfigSnippet(design.name, config),
    codeSimple: toCodeSnippet({ id: design.name, preset: design.preset, ...config.params }),
    variants,
  });
}

await writeFile(
  join(__dirname, "sounds.json"),
  JSON.stringify(manifest, null, 2),
);

console.log(
  `\nGenerated ${GAME_PACK_DESIGNS.length * VARIANTS_PER_SOUND} sounds (${VARIANTS_PER_SOUND} variants each) → ${outDir}`,
);