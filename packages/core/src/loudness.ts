import { getTargetLufs, type SfxCategory } from "./categories.js";
import { SAMPLE_RATE } from "./types.js";
import { callEngine } from "./wasm.js";

// ITU-R BS.1770 K-weighted loudness, 4x oversampled true peak, the true-peak
// limiter and category normalization, all measured and processed by the C++
// engine at 44.1 kHz.

export const LOUDNESS_TOLERANCE_LUFS = 2;
export const MAX_LOUDNESS_PASSES = 12;

const measure = (op: string, samples: Float32Array): number =>
  callEngine(op, undefined, { sample_rate: SAMPLE_RATE }, samples).number;

/** Ungated integrated loudness over the whole buffer (BS.1770 without gating). */
export function measureIntegratedLufs(samples: Float32Array): number {
  return measure("measureIntegratedLufs", samples);
}

/**
 * Category loudness: maximum momentary loudness (400 ms window). Silent tails
 * do not pull it down, so short SFX and long tails master to the same level.
 */
export function measureLufs(samples: Float32Array): number {
  return measure("measureLufs", samples);
}

/** True peak in dBTP (4x oversampled). */
export function measureTruePeak(samples: Float32Array): number {
  return measure("measureTruePeak", samples);
}

/**
 * Limit inter-sample (true) peaks to `ceilingDbTp` (default -1 dBTP).
 * Clips samples, then tightens the clip level until the oversampled true peak is
 * under ceiling. Flattening peaks preserves loudness (unlike a global trim), so
 * this cooperates with LUFS normalization instead of fighting it.
 */
export function applyTruePeakLimit(samples: Float32Array, ceilingDbTp = -1): Float32Array {
  return callEngine("applyTruePeakLimit", undefined, { ceiling_dbtp: ceilingDbTp }, samples).buffers[0]!;
}

/** Gain multiplier to hit category LUFS target (1 = no change). */
export function computeLoudnessGain(samples: Float32Array, category: SfxCategory): number {
  const current = measureLufs(samples);
  if (!Number.isFinite(current) || current < -60) return 1;
  return Math.pow(10, (getTargetLufs(category) - current) / 20);
}

/** Apply gain with true-peak safety. */
export function applyLoudnessGain(samples: Float32Array, gain: number, ceilingDbTp = -1): Float32Array {
  return callEngine("applyLoudnessGain", undefined, { gain, ceiling_dbtp: ceilingDbTp }, samples).buffers[0]!;
}

export function isWithinLoudnessTarget(
  samples: Float32Array,
  category: SfxCategory,
  toleranceLufs = LOUDNESS_TOLERANCE_LUFS,
): boolean {
  const current = measureLufs(samples);
  if (!Number.isFinite(current) || current < -60) return false;
  return Math.abs(current - getTargetLufs(category)) <= toleranceLufs;
}

/** Iteratively gain + limit until loudness is within tolerance (measured after limiting). */
export function normalizeLoudness(
  samples: Float32Array,
  category: SfxCategory,
  toleranceLufs = LOUDNESS_TOLERANCE_LUFS,
): Float32Array {
  return callEngine(
    "normalizeLoudness",
    undefined,
    { category, tolerance_lufs: toleranceLufs, sample_rate: SAMPLE_RATE },
    samples,
  ).buffers[0]!;
}

/** Mix stereo pair to mono for loudness measurement. */
export function mixDownMono(left: Float32Array, right: Float32Array): Float32Array {
  return callEngine("mixDownMono", undefined, undefined, left, right).buffers[0]!;
}

/** Stereo loudness mastering: same gain on both channels, measured on the mono downmix. */
export function normalizeLoudnessStereo(
  left: Float32Array,
  right: Float32Array,
  category: SfxCategory,
  toleranceLufs = LOUDNESS_TOLERANCE_LUFS,
): { left: Float32Array; right: Float32Array } {
  const [l, r] = callEngine(
    "normalizeLoudnessStereo",
    undefined,
    { category, tolerance_lufs: toleranceLufs, sample_rate: SAMPLE_RATE },
    left,
    right,
  ).buffers;
  return { left: l!, right: r! };
}
