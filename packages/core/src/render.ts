import { getPresetCategory, type SfxCategory } from "./categories.js";
import { applyMasterEnvelope } from "./duration.js";
import { applyFx, applyFxStereo } from "./fx.js";
import { synthesizeLayers } from "./layers.js";
import {
  applyLoudnessGain,
  computeLoudnessGain,
  normalizeLoudness,
} from "./loudness.js";
import { applyModulators } from "./modulation.js";
import { applyTexture } from "./texture.js";
import { applyVariation } from "./variation.js";
import {
  DEFAULT_FX_PARAMS,
  DEFAULT_MASTER_PARAMS,
  DEFAULT_TEXTURE_PARAMS,
  type SoundConfig,
  type SoundParams,
} from "./types.js";
import { encodeWav, encodeWavStereo } from "./wav.js";

export interface RenderOptions {
  /** Seed-based micro-variation at render time. */
  seed?: number;
  /** Loudness mastering category. */
  category?: SfxCategory;
  /** Resolve category from preset when not on config. */
  presetId?: string;
  /** Apply LUFS normalization (default: true when category resolves). */
  normalize?: boolean;
}

export function isSoundConfig(
  input: SoundParams | SoundConfig,
): input is SoundConfig {
  return "params" in input && typeof input.params === "object";
}

export function normalizeConfig(
  input: SoundParams | SoundConfig,
): Required<Pick<SoundConfig, "params">> & SoundConfig {
  if (isSoundConfig(input)) {
    return {
      params: input.params,
      fx: input.fx ? { ...DEFAULT_FX_PARAMS, ...input.fx } : undefined,
      master: input.master
        ? { ...DEFAULT_MASTER_PARAMS, ...input.master }
        : undefined,
      oscillators: input.oscillators,
      modulators: input.modulators,
      texture: input.texture
        ? { ...DEFAULT_TEXTURE_PARAMS, ...input.texture }
        : undefined,
      category: input.category,
      seed: input.seed,
    };
  }
  return { params: input };
}

function resolveCategory(
  cfg: SoundConfig,
  options?: RenderOptions,
): SfxCategory | undefined {
  return (
    options?.category ??
    cfg.category ??
    (options?.presetId ? getPresetCategory(options.presetId) : undefined)
  );
}

function mixMono(left: Float32Array, right: Float32Array): Float32Array {
  const len = Math.max(left.length, right.length);
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    mono[i] = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5;
  }
  return mono;
}

function masterSamples(
  samples: Float32Array,
  category: SfxCategory | undefined,
  normalize: boolean,
): Float32Array {
  if (!normalize || !category) return samples;
  return normalizeLoudness(samples, category);
}

function masterStereo(
  left: Float32Array,
  right: Float32Array,
  category: SfxCategory | undefined,
  normalize: boolean,
): { left: Float32Array; right: Float32Array } {
  if (!normalize || !category) return { left, right };

  const gain = computeLoudnessGain(mixMono(left, right), category);
  return {
    left: applyLoudnessGain(left, gain),
    right: applyLoudnessGain(right, gain),
  };
}

function prepareConfig(
  config: SoundParams | SoundConfig,
  options?: RenderOptions,
): SoundConfig {
  let cfg = normalizeConfig(config);
  const seed = options?.seed ?? cfg.seed;
  if (seed !== undefined) cfg = applyVariation(cfg, seed);
  return cfg;
}

export function synthesizeDry(config: SoundParams | SoundConfig): Float32Array {
  const cfg = normalizeConfig(config);

  let dry = synthesizeLayers(cfg.params, cfg.oscillators, cfg.master);
  dry = applyModulators(dry, cfg.modulators);
  dry = applyTexture(dry, cfg.texture);
  return applyMasterEnvelope(dry, cfg.master);
}

export function synthesizeFull(config: SoundParams | SoundConfig): Float32Array {
  const cfg = normalizeConfig(config);
  const dry = synthesizeDry(cfg);
  return cfg.fx ? applyFx(dry, cfg.fx) : dry;
}

/** Synthesize full buffer with variation, FX, and optional loudness mastering. */
export function renderSamples(
  config: SoundParams | SoundConfig,
  options?: RenderOptions,
): Float32Array {
  const cfg = prepareConfig(config, options);
  const category = resolveCategory(cfg, options);
  const normalize = options?.normalize ?? category !== undefined;
  const f = { ...DEFAULT_FX_PARAMS, ...cfg.fx };

  if (f.stereoWidth > 0) {
    let { left, right } = applyFxStereo(synthesizeDry(cfg), f);
    ({ left, right } = masterStereo(left, right, category, normalize));
    return mixMono(left, right);
  }

  const dry = synthesizeDry(cfg);
  return masterSamples(cfg.fx ? applyFx(dry, f) : dry, category, normalize);
}

/** Render with seed variation — convenience wrapper over renderSound. */
export function renderVariant(
  config: SoundParams | SoundConfig,
  seed: number,
  options?: Omit<RenderOptions, "seed">,
): Uint8Array {
  return renderSound(config, { ...options, seed });
}

export function renderSound(
  config: SoundParams | SoundConfig,
  options?: RenderOptions,
): Uint8Array {
  const cfg = prepareConfig(config, options);
  const category = resolveCategory(cfg, options);
  const normalize = options?.normalize ?? category !== undefined;
  const f = { ...DEFAULT_FX_PARAMS, ...cfg.fx };

  if (f.stereoWidth > 0) {
    let { left, right } = applyFxStereo(synthesizeDry(cfg), f);
    ({ left, right } = masterStereo(left, right, category, normalize));
    return encodeWavStereo(left, right);
  }

  return encodeWav(renderSamples(config, options));
}