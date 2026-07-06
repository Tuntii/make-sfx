import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildSoundConfig,
  listPresets,
  paramsToZzfxArray,
  renderSound,
  toCodeSnippet,
  toConfigSnippet,
  type FxParams,
  type MasterParams,
  type ModulatorConfig,
  type OscillatorLayer,
  type SoundConfig,
  type SoundModifiers,
  type SoundParams,
  type SoundDesignInput,
  type TextureParams,
} from "@make-sfx/core";

export type CreateSoundInput = SoundDesignInput & { name: string };

export interface CreateSoundResult {
  name: string;
  preset?: string;
  designProfile?: string;
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
): Promise<CreateSoundResult> {
  const config = buildSoundConfig(input);

  let filePath: string | undefined;
  if (outputDir) {
    const dir = resolve(outputDir);
    await mkdir(dir, { recursive: true });
    filePath = join(dir, `${input.name}.wav`);
    await writeFile(filePath, renderSound(config));
  }

  return {
    name: input.name,
    preset: input.preset,
    designProfile: input.designProfile,
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