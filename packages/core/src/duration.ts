import { SAMPLE_RATE, type MasterParams, type SoundParams } from "./types.js";

export function envelopeLength(params: SoundParams): number {
  return (
    (params.attack ?? 0) +
    (params.decay ?? 0) +
    (params.sustain ?? 0) +
    (params.release ?? 0.1)
  );
}

export function resolveDurationScale(
  params: SoundParams,
  master?: MasterParams,
): number {
  if (!master) return 1;
  if (master.duration && master.duration > 0) {
    const natural = envelopeLength(params);
    return natural > 0 ? master.duration / natural : 1;
  }
  return master.durationScale ?? 1;
}

export function scaleParamsDuration(
  params: SoundParams,
  master?: MasterParams,
): SoundParams {
  const scale = resolveDurationScale(params, master);
  if (scale === 1) return params;
  return {
    ...params,
    attack: (params.attack ?? 0) * scale,
    decay: (params.decay ?? 0) * scale,
    sustain: (params.sustain ?? 0) * scale,
    release: (params.release ?? 0) * scale,
    pitchJumpTime: (params.pitchJumpTime ?? 0) * scale,
    repeatTime: (params.repeatTime ?? 0) * scale,
    delay: (params.delay ?? 0) * scale,
  };
}

export function applyMasterEnvelope(
  samples: Float32Array,
  master?: MasterParams,
): Float32Array {
  if (!master) return samples;
  const tailSamples = Math.floor((master.tail ?? 0) * SAMPLE_RATE);
  const fadeInSamples = Math.floor((master.fadeIn ?? 0) * SAMPLE_RATE);
  const fadeOutSamples = Math.floor((master.fadeOut ?? 0) * SAMPLE_RATE);

  const totalLen = samples.length + tailSamples;
  if (totalLen === samples.length && fadeInSamples === 0 && fadeOutSamples === 0) {
    return samples;
  }

  const out = new Float32Array(totalLen);
  out.set(samples);

  if (fadeInSamples > 0) {
    for (let i = 0; i < Math.min(fadeInSamples, out.length); i++) {
      out[i] *= i / fadeInSamples;
    }
  }

  if (fadeOutSamples > 0) {
    const start = Math.max(0, out.length - fadeOutSamples);
    for (let i = start; i < out.length; i++) {
      out[i] *= (out.length - i) / fadeOutSamples;
    }
  }

  return out;
}