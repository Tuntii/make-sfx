import { SAMPLE_RATE, type ModulatorConfig, type ModulatorShape } from "./types.js";

function lfoValue(shape: ModulatorShape, phase: number): number {
  const t = phase % 1;
  switch (shape) {
    case 1:
      return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
    case 2:
      return t < 0.5 ? 1 : -1;
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

export function applyModulators(
  samples: Float32Array,
  modulators: ModulatorConfig[] = [],
): Float32Array {
  const active = modulators.filter((m) => m.enabled && (m.depth ?? 0) > 0);
  if (active.length === 0) return samples;

  let out = new Float32Array(samples);
  const sr = SAMPLE_RATE;

  for (const mod of active) {
    const rate = mod.rate ?? 4;
    const depth = mod.depth ?? 0;
    const shape = (mod.shape ?? 0) as ModulatorShape;
    const startPhase = mod.phase ?? 0;
    const target = mod.target ?? "amplitude";
    const next = new Float32Array(out.length);

    if (target === "pitch") {
      let readPos = 0;
      for (let i = 0; i < out.length; i++) {
        const phase = startPhase + (i / sr) * rate;
        const lfo = lfoValue(shape, phase);
        readPos += 1 + lfo * depth * 0.06;
        const idx = Math.floor(readPos);
        const frac = readPos - idx;
        const a = out[Math.min(idx, out.length - 1)] ?? 0;
        const b = out[Math.min(idx + 1, out.length - 1)] ?? 0;
        next[i] = a + (b - a) * frac;
      }
    } else if (target === "filter") {
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const phase = startPhase + (i / sr) * rate;
        const lfo = lfoValue(shape, phase);
        const alpha = 0.05 + (0.5 + lfo * 0.5) * depth * 0.3;
        lp += alpha * (out[i] - lp);
        next[i] = lp;
      }
    } else {
      for (let i = 0; i < out.length; i++) {
        const phase = startPhase + (i / sr) * rate;
        const lfo = lfoValue(shape, phase);
        const gain = 1 - depth * 0.5 + lfo * depth * 0.5;
        next[i] = out[i] * gain;
      }
    }

    out = next;
  }

  return out;
}