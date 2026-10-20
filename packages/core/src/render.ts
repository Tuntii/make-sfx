import type { SfxCategory } from "./categories.js";
import { LOUDNESS_TOLERANCE_LUFS } from "./loudness.js";
import {
  DEFAULT_FX_PARAMS,
  DEFAULT_MASTER_PARAMS,
  DEFAULT_TEXTURE_PARAMS,
  type SoundConfig,
  type SoundParams,
} from "./types.js";
import { callEngine, type EngineOptions } from "./wasm.js";

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

export function isSoundConfig(input: SoundParams | SoundConfig): input is SoundConfig {
  return "params" in input && typeof input.params === "object";
}

export function normalizeConfig(
  input: SoundParams | SoundConfig,
): Required<Pick<SoundConfig, "params">> & SoundConfig {
  if (isSoundConfig(input)) {
    return {
      params: input.params,
      fx: input.fx ? { ...DEFAULT_FX_PARAMS, ...input.fx } : undefined,
      master: input.master ? { ...DEFAULT_MASTER_PARAMS, ...input.master } : undefined,
      oscillators: input.oscillators,
      modulators: input.modulators,
      texture: input.texture ? { ...DEFAULT_TEXTURE_PARAMS, ...input.texture } : undefined,
      voice: input.voice,
      category: input.category,
      seed: input.seed,
    };
  }
  return { params: input };
}

function engineOptions(options?: RenderOptions): EngineOptions | undefined {
  if (!options) return undefined;
  return {
    seed: options.seed,
    category: options.category,
    preset_id: options.presetId,
    normalize: options.normalize,
  };
}

/**
 * Seed variation, synthesis, post-FX and category loudness mastering in the
 * C++ engine. Single mastering path used by renderSamples, renderSound, and measurement.
 */
export function renderMasteredBuffer(
  config: SoundParams | SoundConfig,
  options?: RenderOptions,
): MasteredBuffer {
  const result = callEngine("renderMasteredBuffer", config, engineOptions(options));
  const info = JSON.parse(result.json!) as { stereo: boolean; category?: SfxCategory };
  const [mono, left, right] = result.buffers;
  return info.stereo
    ? { mono: mono!, left, right, stereo: true, category: info.category }
    : { mono: mono!, stereo: false, category: info.category };
}

/** Voice or layers, modulators, texture and master envelope (no variation, no FX). */
export function synthesizeDry(config: SoundParams | SoundConfig): Float32Array {
  return callEngine("synthesizeDry", config).buffers[0]!;
}

/** synthesizeDry() plus the mono post-FX chain. */
export function synthesizeFull(config: SoundParams | SoundConfig): Float32Array {
  return callEngine("synthesizeFull", config).buffers[0]!;
}

/** Synthesize full buffer with variation, FX, and optional loudness mastering. */
export function renderSamples(config: SoundParams | SoundConfig, options?: RenderOptions): Float32Array {
  return renderMasteredBuffer(config, options).mono;
}

/** Render with seed variation; convenience wrapper over renderSound. */
export function renderVariant(
  config: SoundParams | SoundConfig,
  seed: number,
  options?: Omit<RenderOptions, "seed">,
): Uint8Array {
  return renderSound(config, { ...options, seed });
}

/** Render to a 16-bit PCM WAV file (stereo when `fx.stereoWidth` > 0). */
export function renderSound(config: SoundParams | SoundConfig, options?: RenderOptions): Uint8Array {
  return callEngine("renderSound", config, engineOptions(options)).bytes!;
}

export { LOUDNESS_TOLERANCE_LUFS };
