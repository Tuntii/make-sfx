import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildSoundConfig,
  getTargetLufs,
  listPresets,
  measureLufs,
  measureTruePeak,
  paramsToZzfxArray,
  renderMasteredBuffer,
  renderSound,
  isWithinLoudnessTarget,
  toCodeSnippet,
  toConfigSnippet,
  type FxParams,
  type MasterParams,
  type ModulatorConfig,
  type OscillatorLayer,
  type SfxCategory,
  type SoundConfig,
  type SoundModifiers,
  type SoundParams,
  type SoundDesignInput,
  type TextureParams,
} from "make-sfx-core";

export type CreateSoundInput = SoundDesignInput & { name: string };

export interface CreateSoundResult {
  name: string;
  preset?: string;
  designProfile?: string;
  category?: SfxCategory;
  seed?: number;
  targetLufs?: number;
  measuredLufs?: number;
  withinLoudnessTarget?: boolean;
  truePeakDbTp?: number;
  config: SoundConfig;
  params: SoundParams;
  fx?: FxParams;
  zzfx: unknown[];
  filePath?: string;
  code: string;
  codeSimple: string;
}

export { buildSoundConfig };

export async function createSound(
  input: CreateSoundInput,
  outputDir?: string,
  options?: { seed?: number },
): Promise<CreateSoundResult> {
  const seed = options?.seed ?? input.seed;
  const config = buildSoundConfig({ ...input, seed });

  const category = config.category;
  const renderOpts = {
    seed,
    category,
    presetId: input.preset,
  };

  let filePath: string | undefined;
  if (outputDir) {
    const dir = resolve(outputDir);
    await mkdir(dir, { recursive: true });
    const fileName = seed !== undefined ? `${input.name}-s${seed}` : input.name;
    filePath = join(dir, `${fileName}.wav`);
    await writeFile(filePath, renderSound(config, renderOpts));
  }

  const mastered = category ? renderMasteredBuffer(config, renderOpts) : undefined;
  const measuredLufs = mastered ? measureLufs(mastered.mono) : undefined;

  return {
    name: input.name,
    preset: input.preset,
    designProfile: input.designProfile,
    category,
    seed,
    targetLufs: category ? getTargetLufs(category) : undefined,
    measuredLufs,
    withinLoudnessTarget:
      category && mastered ? isWithinLoudnessTarget(mastered.mono, category) : undefined,
    truePeakDbTp: mastered ? measureTruePeak(mastered.mono) : undefined,
    config,
    params: config.params,
    fx: config.fx,
    zzfx: paramsToZzfxArray(config.params),
    filePath,
    code: toConfigSnippet(input.name, config),
    codeSimple: toCodeSnippet({
      id: input.name,
      preset: input.preset,
      ...config.params,
    }),
  };
}

export { listPresets };