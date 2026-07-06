import { buildSamples } from "./synth.js";
import { scaleParamsDuration } from "./duration.js";
import { SAMPLE_RATE, type MasterParams, type OscillatorLayer, type SoundParams } from "./types.js";

function mergeParams(
  base: SoundParams,
  layer: Partial<SoundParams>,
  detune?: number,
): SoundParams {
  const merged = { ...base, ...layer };
  if (detune) {
    merged.frequency = (merged.frequency ?? 220) * Math.pow(2, detune / 12);
  }
  return merged;
}

export function synthesizeLayers(
  baseParams: SoundParams,
  layers: OscillatorLayer[] = [],
  master?: MasterParams,
): Float32Array {
  const scaledBase = scaleParamsDuration(baseParams, master);
  const active = layers.filter((l) => l.enabled !== false);
  if (active.length === 0) return buildSamples(scaledBase);

  type Voice = { samples: Float32Array; mix: number; offset: number };
  const voices: Voice[] = [
    {
      samples: buildSamples(scaledBase),
      mix: 1,
      offset: 0,
    },
  ];

  for (const layer of active) {
    const p = scaleParamsDuration(
      mergeParams(scaledBase, layer.params ?? {}, layer.detune),
      master,
    );
    voices.push({
      samples: buildSamples(p),
      mix: layer.mix ?? 0.5,
      offset: Math.floor((layer.delay ?? 0) * SAMPLE_RATE),
    });
  }

  const totalMix = voices.reduce((s, v) => s + v.mix, 0) || 1;
  let maxLen = 0;
  for (const v of voices) {
    maxLen = Math.max(maxLen, v.offset + v.samples.length);
  }

  const out = new Float32Array(maxLen);
  for (const v of voices) {
    for (let i = 0; i < v.samples.length; i++) {
      out[i + v.offset] += (v.samples[i] * v.mix) / totalMix;
    }
  }

  return out;
}