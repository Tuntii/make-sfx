import { getTargetLufs, type SfxCategory } from "./categories.js";
import { SAMPLE_RATE } from "./types.js";

const MIN_MEASURE_SAMPLES = Math.floor(SAMPLE_RATE * 0.1);
export const LOUDNESS_TOLERANCE_LUFS = 2;
export const MAX_LOUDNESS_PASSES = 12;

/** Pad short SFX for reliable integrated loudness measurement. */
function padForMeasurement(samples: Float32Array): Float32Array {
  if (samples.length >= MIN_MEASURE_SAMPLES) return samples;
  const out = new Float32Array(MIN_MEASURE_SAMPLES);
  out.set(samples);
  return out;
}

/**
 * Simplified integrated loudness (LUFS approximation).
 * Suitable for SFX ≥10ms; shorter buffers are zero-padded for measurement.
 */
export function measureLufs(samples: Float32Array): number {
  const buf = padForMeasurement(samples);
  if (buf.length === 0) return -70;

  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i];
  }
  const rms = Math.sqrt(sum / buf.length);
  if (rms < 1e-10) return -70;
  return 20 * Math.log10(rms) - 0.691;
}

export function measureTruePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return peak > 1e-10 ? 20 * Math.log10(peak) : -70;
}

/** Limit to ceiling dBTP (default −1 dBTP). */
export function applyTruePeakLimit(
  samples: Float32Array,
  ceilingDbTp = -1,
): Float32Array {
  const ceiling = Math.pow(10, ceilingDbTp / 20);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    out[i] = s > ceiling ? ceiling : s < -ceiling ? -ceiling : s;
  }
  return out;
}

/** Gain multiplier to hit category LUFS target (1 = no change). */
export function computeLoudnessGain(
  samples: Float32Array,
  category: SfxCategory,
): number {
  const current = measureLufs(samples);
  if (!Number.isFinite(current) || current < -60) return 1;
  return Math.pow(10, (getTargetLufs(category) - current) / 20);
}

/** Apply gain with true-peak safety. */
export function applyLoudnessGain(
  samples: Float32Array,
  gain: number,
  ceilingDbTp = -1,
): Float32Array {
  const scaled = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) scaled[i] = samples[i] * gain;
  return applyTruePeakLimit(scaled, ceilingDbTp);
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

/**
 * Iteratively gain+limit until LUFS is within tolerance (measured after limiting).
 * Returns processed buffer and whether target was reached.
 */
export function normalizeLoudness(
  samples: Float32Array,
  category: SfxCategory,
  toleranceLufs = LOUDNESS_TOLERANCE_LUFS,
): Float32Array {
  const target = getTargetLufs(category);
  let result = samples;

  for (let pass = 0; pass < MAX_LOUDNESS_PASSES; pass++) {
    const current = measureLufs(result);
    if (!Number.isFinite(current) || current < -60) return samples;
    if (Math.abs(current - target) <= toleranceLufs) return result;

    const gain = Math.pow(10, (target - current) / 20);
    result = applyLoudnessGain(result, gain);
  }

  return result;
}

/** Mix stereo pair to mono for integrated loudness measurement. */
export function mixDownMono(left: Float32Array, right: Float32Array): Float32Array {
  const len = Math.max(left.length, right.length);
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    mono[i] = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5;
  }
  return mono;
}

/**
 * Stereo loudness mastering — iterative gain on both channels, LUFS measured on mono downmix after limiting.
 */
export function normalizeLoudnessStereo(
  left: Float32Array,
  right: Float32Array,
  category: SfxCategory,
  toleranceLufs = LOUDNESS_TOLERANCE_LUFS,
): { left: Float32Array; right: Float32Array } {
  const target = getTargetLufs(category);
  let l = left;
  let r = right;

  for (let pass = 0; pass < MAX_LOUDNESS_PASSES; pass++) {
    const current = measureLufs(mixDownMono(l, r));
    if (!Number.isFinite(current) || current < -60) return { left, right };
    if (Math.abs(current - target) <= toleranceLufs) return { left: l, right: r };

    const gain = Math.pow(10, (target - current) / 20);
    l = applyLoudnessGain(l, gain);
    r = applyLoudnessGain(r, gain);
  }

  return { left: l, right: r };
}