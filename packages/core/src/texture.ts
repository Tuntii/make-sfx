import { random } from "./rng.js";
import { SAMPLE_RATE, DEFAULT_TEXTURE_PARAMS, type TextureParams } from "./types.js";

function rand(): number {
  return random() * 2 - 1;
}

export function applyTexture(
  samples: Float32Array,
  texture: TextureParams = {},
): Float32Array {
  const t = { ...DEFAULT_TEXTURE_PARAMS, ...texture };
  let out = new Float32Array(samples);
  const sr = SAMPLE_RATE;

  if (t.subMix > 0) {
    const mixed = new Float32Array(out.length);
    let phase = 0;
    const baseFreq = 220 * (t.subOctave ?? 0.5);
    for (let i = 0; i < out.length; i++) {
      phase += (baseFreq * 2 * Math.PI) / sr;
      mixed[i] = out[i] + Math.sin(phase) * t.subMix * 0.4;
    }
    out = mixed;
  }

  if (t.chorus > 0) {
    const mixed = new Float32Array(out.length);
    const delay = Math.floor(0.02 * sr);
    for (let i = 0; i < out.length; i++) {
      const mod = Math.sin((i / sr) * 1.5) * t.chorus * delay;
      const idx = Math.max(0, Math.min(out.length - 1, i - delay + Math.floor(mod)));
      mixed[i] = out[i] * (1 - t.chorus * 0.4) + out[idx] * t.chorus * 0.4;
    }
    out = mixed;
  }

  if (t.phaser > 0) {
    const mixed = new Float32Array(out.length);
    let ap = 0;
    for (let i = 0; i < out.length; i++) {
      const coeff = 0.5 + Math.sin((i / sr) * 3) * t.phaser * 0.45;
      ap = out[i] + coeff * ap;
      mixed[i] = out[i] - ap * t.phaser;
    }
    out = mixed;
  }

  if (t.ringMod > 0) {
    const mixed = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) {
      const carrier = Math.sin((i / sr) * 80 * Math.PI * 2);
      mixed[i] = out[i] * (1 - t.ringMod) + out[i] * carrier * t.ringMod;
    }
    out = mixed;
  }

  if (t.flutter > 0) {
    const mixed = new Float32Array(out.length);
    let readPos = 0;
    for (let i = 0; i < out.length; i++) {
      readPos += 1 + Math.sin((i / sr) * 12) * t.flutter * 0.02;
      const idx = Math.floor(readPos);
      mixed[i] = out[Math.min(idx, out.length - 1)];
    }
    out = mixed;
  }

  if (t.wow > 0) {
    const mixed = new Float32Array(out.length);
    let readPos = 0;
    for (let i = 0; i < out.length; i++) {
      readPos += 1 + Math.sin((i / sr) * 0.6) * t.wow * 0.015;
      const idx = Math.floor(readPos);
      mixed[i] = out[Math.min(idx, out.length - 1)];
    }
    out = mixed;
  }

  if (t.transient > 0) {
    const mixed = new Float32Array(out);
    const boost = Math.floor(0.008 * sr);
    for (let i = 0; i < boost && i < mixed.length; i++) {
      mixed[i] *= 1 + t.transient * (1 - i / boost);
    }
    out = mixed;
  }

  if (t.crackle > 0) {
    const mixed = new Float32Array(out);
    for (let i = 0; i < mixed.length; i++) {
      if (random() < t.crackle * 0.002) {
        mixed[i] += rand() * t.crackle * 0.3;
      }
    }
    out = mixed;
  }

  if (t.grain > 0) {
    const mixed = new Float32Array(out);
    const grainSize = Math.floor(0.006 * sr);
    for (let i = 0; i < mixed.length; i += grainSize) {
      const g = 0.5 + random() * t.grain;
      for (let j = 0; j < grainSize && i + j < mixed.length; j++) {
        mixed[i + j] *= g;
      }
    }
    out = mixed;
  }

  if (t.gate > 0) {
    const mixed = new Float32Array(out);
    const threshold = t.gate * 0.15;
    for (let i = 0; i < mixed.length; i++) {
      if (Math.abs(mixed[i]) < threshold) mixed[i] = 0;
    }
    out = mixed;
  }

  return out;
}