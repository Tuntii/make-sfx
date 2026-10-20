import type { OscillatorLayer, SoundConfig } from "./types.js";
import { cloneVoice, shiftVoicePitch } from "./voice.js";

/** Mulberry32 — deterministic seeded PRNG. */
export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(rng: () => number, amount: number): number {
  return (rng() - 0.5) * 2 * amount;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Seed-based micro-variation — same preset identity, different PCM.
 * Frequency jitter ±10% (within ±20% acceptance band).
 */
export function applyVariation(config: SoundConfig, seed: number): SoundConfig {
  const rng = createSeededRng(seed);
  const params = { ...config.params };

  const baseFreq = params.frequency ?? 220;
  params.frequency = baseFreq * (1 + jitter(rng, 0.1));
  params.randomness = clamp((params.randomness ?? 0.05) + Math.abs(jitter(rng, 0.04)), 0, 0.3);

  if (params.release !== undefined) {
    params.release = clamp(params.release * (1 + jitter(rng, 0.12)), 0.01, 2);
  }
  if (params.decay !== undefined && params.decay > 0) {
    params.decay = clamp(params.decay * (1 + jitter(rng, 0.1)), 0, 1);
  }
  if (params.volume !== undefined) {
    params.volume = clamp(params.volume * (1 + jitter(rng, 0.06)), 0.1, 1);
  }
  if (params.pulseWidth !== undefined && params.shape === 5) {
    params.pulseWidth = clamp(params.pulseWidth + jitter(rng, 0.04), 0.05, 0.95);
  }

  let oscillators: OscillatorLayer[] | undefined;
  if (config.oscillators?.length) {
    oscillators = config.oscillators.map((osc) => {
      const varied = { ...osc };
      if (varied.params) {
        varied.params = { ...varied.params };
        if (varied.params.shape === 5 && varied.params.pulseWidth !== undefined) {
          varied.params.pulseWidth = clamp(varied.params.pulseWidth + jitter(rng, 0.04), 0.05, 0.95);
        }
      }
      varied.mix = osc.mix !== undefined ? clamp(osc.mix + jitter(rng, 0.08), 0, 1) : osc.mix;
      varied.detune = osc.detune !== undefined ? osc.detune + jitter(rng, 1.5) : osc.detune;
      return varied;
    });
  }

  let master = config.master ? { ...config.master } : undefined;
  if (master?.duration && master.duration > 0) {
    master.duration = clamp(master.duration * (1 + jitter(rng, 0.08)), 0.02, 3);
  }

  const voice = config.voice
    ? shiftVoicePitch(cloneVoice(config.voice), 1 + jitter(rng, 0.1))
    : config.voice;

  return {
    ...config,
    params,
    oscillators,
    master,
    voice,
  };
}