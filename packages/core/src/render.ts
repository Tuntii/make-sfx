import { getPresetCategory, type SfxCategory } from "./categories.js";
import { applyMasterEnvelope } from "./duration.js";
import { applyFx, applyFxStereo } from "./fx.js";
import { synthesizeLayers } from "./layers.js";
import { fitVoiceDuration, synthesizeVoice } from "./voice.js";
import {
  LOUDNESS_TOLERANCE_LUFS,
  mixDownMono,
  normalizeLoudness,
  normalizeLoudnessStereo,
} from "./loudness.js";
import { applyModulators } from "./modulation.js";
import { applyTexture } from "./texture.js";
import { withRng } from "./rng.js";
import { createSeededRng, applyVariation } from "./variation.js";
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

export interface MasteredBuffer {
  mono: Float32Array;
  left?: Float32Array;
  right?: Float32Array;
  stereo: boolean;
  category?: SfxCategory;
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
      voice: input.voice,
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

function prepareConfig(
  config: SoundParams | SoundConfig,
  options?: RenderOptions,
): SoundConfig {
  let cfg = normalizeConfig(config);
  const seed = options?.seed ?? cfg.seed;
  if (seed !== undefined) cfg = applyVariation(cfg, seed);
  return cfg;
}

function synthesizeWet(cfg: SoundConfig): Float32Array {
  const f = { ...DEFAULT_FX_PARAMS, ...cfg.fx };
  const dry = synthesizeDry(cfg);
  return cfg.fx ? applyFx(dry, f) : dry;
}

function synthesizeDryForRender(cfg: SoundConfig, seed?: number): Float32Array {
  if (seed === undefined) return synthesizeDry(cfg);
  return withRng(createSeededRng(seed ^ 0x9e3779b9), () => synthesizeDry(cfg));
}

/** Single mastering path used by renderSamples, renderSound, and measurement. */
export function renderMasteredBuffer(
  config: SoundParams | SoundConfig,
  options?: RenderOptions,
): MasteredBuffer {
  const cfg = prepareConfig(config, options);
  const seed = options?.seed ?? cfg.seed;
  const category = resolveCategory(cfg, options);
  const normalize = options?.normalize ?? category !== undefined;
  const f = { ...DEFAULT_FX_PARAMS, ...cfg.fx };

  if (f.stereoWidth > 0) {
    let { left, right } = applyFxStereo(synthesizeDryForRender(cfg, seed), f);
    if (normalize && category) {
      ({ left, right } = normalizeLoudnessStereo(left, right, category));
    }
    return {
      mono: mixDownMono(left, right),
      left,
      right,
      stereo: true,
      category,
    };
  }

  const dry = synthesizeDryForRender(cfg, seed);
  let mono = cfg.fx ? applyFx(dry, f) : dry;
  if (normalize && category) {
    mono = normalizeLoudness(mono, category);
  }

  return { mono, stereo: false, category };
}

export function synthesizeDry(config: SoundParams | SoundConfig): Float32Array {
  const cfg = normalizeConfig(config);

  let dry = cfg.voice
    ? synthesizeVoice(fitVoiceDuration(cfg.voice, cfg.master))
    : synthesizeLayers(cfg.params, cfg.oscillators, cfg.master);
  dry = applyModulators(dry, cfg.modulators);
  dry = applyTexture(dry, cfg.texture);
  return applyMasterEnvelope(dry, cfg.master);
}

export function synthesizeFull(config: SoundParams | SoundConfig): Float32Array {
  const cfg = normalizeConfig(config);
  return synthesizeWet(cfg);
}

/** Synthesize full buffer with variation, FX, and optional loudness mastering. */
export function renderSamples(
  config: SoundParams | SoundConfig,
  options?: RenderOptions,
): Float32Array {
  return renderMasteredBuffer(config, options).mono;
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
  const mastered = renderMasteredBuffer(config, options);
  if (mastered.stereo && mastered.left && mastered.right) {
    return encodeWavStereo(mastered.left, mastered.right);
  }
  return encodeWav(mastered.mono);
}

export { LOUDNESS_TOLERANCE_LUFS };