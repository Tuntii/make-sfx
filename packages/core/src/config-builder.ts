import { getPresetCategory } from "./categories.js";
import { applyModifiers } from "./modify.js";
import { DESIGN_PROFILES } from "./parameters.js";
import { getPreset, presetCatalog } from "./presets.js";
import type {
  FxParams,
  MasterParams,
  ModulatorConfig,
  OscillatorLayer,
  SoundConfig,
  SfxCategory,
  SoundModifiers,
  SoundParams,
  TextureParams,
} from "./types.js";

export interface SoundDesignInput {
  name?: string;
  preset?: string;
  category?: SfxCategory;
  seed?: number;
  designProfile?: string;
  params?: SoundParams;
  fx?: FxParams;
  master?: MasterParams;
  oscillators?: OscillatorLayer[];
  modulators?: ModulatorConfig[];
  texture?: TextureParams;
  pitchShift?: number;
  durationScale?: number;
  volume?: number;
  randomness?: number;
  brightness?: number;
  warmth?: number;
  punch?: number;
  grit?: number;
  space?: number;
}

export function resolveModifiers(input: SoundDesignInput): SoundModifiers {
  return {
    pitchShift: input.pitchShift,
    durationScale: input.durationScale,
    volume: input.volume,
    randomness: input.randomness,
    brightness: input.brightness,
    warmth: input.warmth,
    punch: input.punch,
    grit: input.grit,
    space: input.space,
  };
}

export function resolveDesignProfile(
  profileId?: string,
): { params?: SoundParams; fx?: FxParams } {
  if (!profileId) return {};
  const profile = DESIGN_PROFILES.find((p) => p.id === profileId);
  if (!profile) {
    throw new Error(
      `Unknown design profile: "${profileId}". Use sfx_list_design_profiles.`,
    );
  }
  return { params: { ...profile.params }, fx: { ...profile.fx } };
}

export function buildSoundConfig(input: SoundDesignInput): SoundConfig {
  const catalogEntry = input.preset
    ? presetCatalog.find((p) => p.id === input.preset)
    : undefined;
  const profile = resolveDesignProfile(input.designProfile);

  const presetParams = input.preset ? getPreset(input.preset) : undefined;
  const baseParams = presetParams ?? profile.params ?? input.params;

  if (!baseParams) {
    throw new Error(
      "Provide at least one of: preset, designProfile, or params. Use sfx_get_parameters for schema.",
    );
  }

  const mergedFx: FxParams = {
    ...catalogEntry?.fx,
    ...profile.fx,
    ...input.fx,
  };
  const hasFxKeys = Object.keys(mergedFx).length > 0;

  const category =
    input.category ??
    catalogEntry?.category ??
    (input.preset ? getPresetCategory(input.preset) : undefined);

  let config: SoundConfig = {
    params: {
      ...baseParams,
      ...profile.params,
      ...input.params,
    },
    ...(hasFxKeys ? { fx: mergedFx } : {}),
    master: { ...catalogEntry?.master, ...input.master },
    oscillators: input.oscillators ?? catalogEntry?.oscillators,
    modulators: input.modulators ?? catalogEntry?.modulators,
    texture: {
      ...catalogEntry?.texture,
      ...input.texture,
    },
    ...(category ? { category } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  };

  const modifiers = resolveModifiers(input);
  const hasModifiers = Object.values(modifiers).some((v) => v !== undefined);
  if (hasModifiers) {
    const applied = applyModifiers(
      { params: config.params, fx: config.fx },
      modifiers,
    );
    config = { ...config, params: applied.params };
    if (applied.fx) {
      config.fx = { ...config.fx, ...applied.fx };
    }
  }

  return config;
}

/** MCP-aligned Turkish game pack — single source for examples + AI describe workflow. */
export const GAME_PACK_DESIGNS: SoundDesignInput[] = [
  {
    name: "jump",
    preset: "jump",
    punch: 0.5,
    master: { duration: 0.12 },
    oscillators: [{ enabled: true, mix: 0.25, detune: 7 }],
    texture: { transient: 0.3 },
    space: 0.08,
  },
  {
    name: "blink",
    preset: "blink",
    pitchShift: 1.5,
    master: { duration: 0.06 },
    fx: { reverbMix: 0.05 },
  },
  {
    name: "coin",
    preset: "coin",
    master: { duration: 0.1 },
    brightness: 0.2,
    texture: { chorus: 0.15 },
  },
  {
    name: "hit",
    preset: "hit",
    punch: 0.6,
    master: { duration: 0.08 },
    texture: { transient: 0.5, subMix: 0.2 },
    fx: { compression: 0.35 },
  },
  {
    name: "powerup",
    preset: "powerup",
    master: { duration: 0.28 },
    modulators: [{ enabled: true, target: "pitch", rate: 6, depth: 0.25, shape: 0 }],
    texture: { chorus: 0.2 },
    fx: { stereoWidth: 0.35, delayMix: 0.15 },
    space: 0.12,
  },
];