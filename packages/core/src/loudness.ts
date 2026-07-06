import { getTargetLufs, type SfxCategory } from "./categories.js";
import { SAMPLE_RATE } from "./types.js";

const MIN_MEASURE_SAMPLES = Math.floor(SAMPLE_RATE * 0.1);
export const LOUDNESS_TOLERANCE_LUFS = 2;
export const MAX_LOUDNESS_PASSES = 12;

// ─── ITU-R BS.1770 K-weighting ──────────────────────────────────────────────
// Two biquad stages: a high-shelf "pre-filter" (+~4 dB above ~1.5 kHz) and an
// "RLB" high-pass (~38 Hz). Coefficients are derived from the analog prototypes
// via bilinear transform at the actual SAMPLE_RATE, so measurement stays correct
// off the 48 kHz reference. No gating: SFX are often <150ms and BS.1770 gating
// would discard nearly every one-shot — intentional for short effects.

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function kWeightHighShelf(fs: number): Biquad {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

function kWeightHighPass(fs: number): Biquad {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / fs);
  const a0 = 1 + K / Q + K * K;
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
}

const K_STAGES: readonly Biquad[] = [
  kWeightHighShelf(SAMPLE_RATE),
  kWeightHighPass(SAMPLE_RATE),
];

function applyBiquad(x: Float32Array, c: Biquad): Float32Array {
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = c.b0 * xn + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = xn;
    y2 = y1;
    y1 = yn;
    out[i] = yn;
  }
  return out;
}

/** Pad short SFX for reliable integrated loudness measurement. */
function padForMeasurement(samples: Float32Array): Float32Array {
  if (samples.length >= MIN_MEASURE_SAMPLES) return samples;
  const out = new Float32Array(MIN_MEASURE_SAMPLES);
  out.set(samples);
  return out;
}

/**
 * Integrated loudness (LUFS) via ITU-R BS.1770 K-weighting.
 * Suitable for SFX ≥10ms; shorter buffers are zero-padded for measurement.
 * Bright content reads louder than dark content at equal RMS — the point of
 * K-weighting — so category loudness matching becomes perceptually accurate.
 */
export function measureLufs(samples: Float32Array): number {
  let buf = padForMeasurement(samples);
  if (buf.length === 0) return -70;

  for (const stage of K_STAGES) buf = applyBiquad(buf, stage);

  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i];
  }
  const meanSquare = sum / buf.length;
  if (meanSquare < 1e-20) return -70;
  return 10 * Math.log10(meanSquare) - 0.691;
}

// ─── Oversampled true-peak (inter-sample) ───────────────────────────────────
// A 4× windowed-sinc reconstruction estimates peaks that fall between samples,
// which a plain sample-peak scan misses. Used for both measurement and limiting.

const TP_OVERSAMPLE = 4;
const TP_HALF = 6; // taps span input samples [-(TP_HALF-1) .. TP_HALF]

/** Precompute a fractional-delay windowed-sinc kernel per oversample phase. */
const TP_KERNELS: readonly Float32Array[] = Array.from(
  { length: TP_OVERSAMPLE },
  (_, phase) => {
    const frac = phase / TP_OVERSAMPLE;
    const taps = 2 * TP_HALF;
    const ker = new Float32Array(taps);
    for (let k = 0; k < taps; k++) {
      const t = k - (TP_HALF - 1); // input-sample offset for this tap
      const d = t - frac;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      // Hann window over the tap support, centred on the fractional position.
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / TP_HALF));
      ker[k] = Math.abs(d) < TP_HALF ? sinc * w : 0;
    }
    return ker;
  },
);

/** Max |sample| over the 4× oversampled reconstruction (linear amplitude). */
function truePeakAmp(x: Float32Array): number {
  const n = x.length;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    for (let phase = 0; phase < TP_OVERSAMPLE; phase++) {
      const ker = TP_KERNELS[phase]!;
      let acc = 0;
      for (let k = 0; k < ker.length; k++) {
        const idx = i + (k - (TP_HALF - 1));
        if (idx >= 0 && idx < n) acc += x[idx] * ker[k];
      }
      const a = acc < 0 ? -acc : acc;
      if (a > peak) peak = a;
    }
  }
  return peak;
}

export function measureTruePeak(samples: Float32Array): number {
  const peak = truePeakAmp(samples);
  return peak > 1e-10 ? 20 * Math.log10(peak) : -70;
}

function hardClip(x: Float32Array, ceiling: number): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const s = x[i];
    out[i] = s > ceiling ? ceiling : s < -ceiling ? -ceiling : s;
  }
  return out;
}

/**
 * Limit inter-sample (true) peaks to `ceilingDbTp` (default −1 dBTP).
 * Clips samples, then tightens the clip level until the oversampled true peak is
 * under ceiling — flattening peaks preserves loudness (unlike a global trim), so
 * this cooperates with LUFS normalization instead of fighting it.
 */
export function applyTruePeakLimit(
  samples: Float32Array,
  ceilingDbTp = -1,
): Float32Array {
  const ceiling = Math.pow(10, ceilingDbTp / 20);
  let clip = ceiling;
  let out = hardClip(samples, clip);

  for (let iter = 0; iter < 8; iter++) {
    const tp = truePeakAmp(out);
    if (tp <= ceiling * 1.0001) return out;
    clip *= ceiling / tp;
    out = hardClip(samples, clip);
  }

  // Guarantee the ceiling even if clipping hasn't fully converged.
  const tp = truePeakAmp(out);
  if (tp > ceiling) {
    const g = ceiling / tp;
    for (let i = 0; i < out.length; i++) out[i] *= g;
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