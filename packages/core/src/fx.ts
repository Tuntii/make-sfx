import { DEFAULT_FX_PARAMS, SAMPLE_RATE, type FxParams } from "./types.js";

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function applyEq(samples: Float32Array, fx: Required<FxParams>): Float32Array {
  const out = new Float32Array(samples.length);
  const lowGain = dbToGain(fx.eqLow);
  const midGain = dbToGain(fx.eqMid);
  const highGain = dbToGain(fx.eqHigh);

  let low = 0;
  let high = 0;
  const lowAlpha = 0.04;
  const highAlpha = 0.15;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    low += lowAlpha * (s - low);
    high += highAlpha * (s - high);
    const mid = s - low - high * 0.5;
    out[i] = low * lowGain + mid * midGain + high * highGain;
  }
  return out;
}

function applySaturation(samples: Float32Array, amount: number): Float32Array {
  if (amount <= 0) return samples;
  const out = new Float32Array(samples.length);
  const drive = 1 + amount * 8;
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.tanh(samples[i] * drive) / Math.tanh(drive);
  }
  return out;
}

function applyCompression(samples: Float32Array, amount: number): Float32Array {
  if (amount <= 0) return samples;
  const out = new Float32Array(samples.length);
  const threshold = 0.3 - amount * 0.2;
  const ratio = 1 + amount * 6;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const abs = Math.abs(s);
    if (abs <= threshold) {
      out[i] = s;
    } else {
      const sign = s < 0 ? -1 : 1;
      const excess = abs - threshold;
      out[i] = sign * (threshold + excess / ratio);
    }
  }
  return out;
}

/** Extra samples post-FX may add beyond dry length (delay taps + reverb tail). */
export function computeFxTailSamples(fx: FxParams = {}): number {
  const f: Required<FxParams> = { ...DEFAULT_FX_PARAMS, ...fx };
  let tail = 0;

  if (f.delayMix > 0 && f.delayTime > 0) {
    const delaySamples = Math.floor(f.delayTime * SAMPLE_RATE);
    tail = Math.max(tail, delaySamples * 4);
  }

  if (f.reverbMix > 0) {
    const decaySamples = Math.floor(f.reverbDecay * SAMPLE_RATE);
    tail = Math.max(tail, Math.min(decaySamples, Math.floor(SAMPLE_RATE * 2)));
  }

  return tail;
}

function applyDelay(samples: Float32Array, fx: Required<FxParams>): Float32Array {
  if (fx.delayMix <= 0 || fx.delayTime <= 0) return samples;
  const delaySamples = Math.floor(fx.delayTime * SAMPLE_RATE);
  const tailLen = delaySamples * 4;
  const out = new Float32Array(samples.length + tailLen);
  const dryMix = 1 - fx.delayMix;

  for (let i = 0; i < samples.length; i++) {
    out[i] += samples[i] * dryMix;
  }

  let feedback = fx.delayMix;
  for (let tap = 1; tap <= 4 && feedback > 0.02; tap++) {
    const offset = delaySamples * tap;
    for (let i = 0; i < samples.length; i++) {
      const idx = i + offset;
      if (idx < out.length) {
        out[idx] += samples[i] * feedback * Math.pow(fx.delayFeedback, tap - 1);
      }
    }
    feedback *= fx.delayFeedback;
  }
  return out;
}

function applyReverb(samples: Float32Array, fx: Required<FxParams>): Float32Array {
  if (fx.reverbMix <= 0) return samples;
  const decaySamples = Math.floor(fx.reverbDecay * SAMPLE_RATE);
  const tail = Math.min(decaySamples, Math.floor(samples.length * 3));
  const buf = new Float32Array(samples.length + tail);
  buf.set(samples);

  const combDelays = [1557, 1889, 2231, 2611].map((d) =>
    Math.floor((d / 44100) * SAMPLE_RATE),
  );

  for (const delay of combDelays) {
    const decay = 0.55 + fx.reverbDecay * 0.1;
    for (let i = delay; i < buf.length; i++) {
      buf[i] += buf[i - delay] * decay * fx.reverbMix * 0.2;
    }
  }

  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const dry = i < samples.length ? samples[i] * (1 - fx.reverbMix) : 0;
    out[i] = dry + buf[i] * fx.reverbMix;
  }
  return out;
}

function applyLimiter(samples: Float32Array, ceiling: number): Float32Array {
  const out = new Float32Array(samples.length);
  const max = Math.max(ceiling, 0.01);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    out[i] = s > max ? max : s < -max ? -max : s;
  }
  return out;
}

function toStereo(
  mono: Float32Array,
  width: number,
): { left: Float32Array; right: Float32Array } {
  if (width <= 0) {
    return { left: mono, right: mono };
  }
  const haas = Math.floor(SAMPLE_RATE * 0.012 * width);
  const left = new Float32Array(mono.length);
  const right = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    left[i] = mono[i];
    right[i] = i >= haas ? mono[i - haas] * (0.85 + width * 0.15) : 0;
  }
  return { left, right };
}

export function applyFx(samples: Float32Array, fx: FxParams = {}): Float32Array {
  const f: Required<FxParams> = { ...DEFAULT_FX_PARAMS, ...fx };
  let out = samples;
  out = applyEq(out, f);
  out = applySaturation(out, f.saturation);
  out = applyCompression(out, f.compression);
  out = applyDelay(out, f);
  out = applyReverb(out, f);
  out = applyLimiter(out, f.limiter);
  return out;
}

export function applyFxStereo(
  samples: Float32Array,
  fx: FxParams = {},
): { left: Float32Array; right: Float32Array } {
  const f: Required<FxParams> = { ...DEFAULT_FX_PARAMS, ...fx };
  const processed = applyFx(samples, f);
  return toStereo(processed, f.stereoWidth);
}