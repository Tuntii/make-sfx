import { describe, expect, it } from "vitest";
import { buildSoundConfig, renderSound } from "./index.js";
import { SAMPLE_RATE } from "./types.js";
import { synthesizeVoice } from "./voice.js";

function risingCrossings(samples: Float32Array, start: number, end: number): number {
  let count = 0;
  let prev = samples[start] ?? 0;
  for (let i = start + 1; i < end; i++) {
    const cur = samples[i] ?? 0;
    if (prev <= 0 && cur > 0) count++;
    prev = cur;
  }
  return count;
}

function estimateHz(samples: Float32Array): number {
  const start = Math.floor(0.02 * SAMPLE_RATE);
  const end = Math.min(samples.length - 8, start + Math.floor(0.15 * SAMPLE_RATE));
  const seconds = (end - start) / SAMPLE_RATE;
  return risingCrossings(samples, start, end) / seconds;
}

function toneEnergy(samples: Float32Array, freq: number): number {
  let re = 0;
  let im = 0;
  const w = (2 * Math.PI * freq) / SAMPLE_RATE;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    re += s * Math.cos(w * i);
    im -= s * Math.sin(w * i);
  }
  return re * re + im * im;
}

describe("channel synth", () => {
  it("plays a sine at the requested frequency", () => {
    const samples = synthesizeVoice({
      frequency: 440,
      gate: 0.25,
      volume: 0.8,
      osc1: { wave: "sine", level: 1 },
      amp: { attack: 0.01, decay: 0, sustain: 1, release: 0.02 },
    });
    expect(estimateHz(samples)).toBeCloseTo(440, 0);
    expect(samples.some((s) => Math.abs(s) > 0.05)).toBe(true);
  });

  it("keeps a polyblep square near the requested frequency", () => {
    const samples = synthesizeVoice({
      frequency: 440,
      gate: 0.25,
      osc1: { wave: "square", level: 1, pulseWidth: 0.5 },
      amp: { attack: 0.005, decay: 0, sustain: 1, release: 0.02 },
    });
    expect(estimateHz(samples)).toBeGreaterThan(420);
    expect(estimateHz(samples)).toBeLessThan(460);
  });

  it("lowpass removes upper harmonics of a saw", () => {
    const bright = synthesizeVoice({
      frequency: 220,
      gate: 0.2,
      osc1: { wave: "saw", level: 1 },
      amp: { attack: 0.005, decay: 0, sustain: 1, release: 0.01 },
      filter: { type: "lowpass", cutoff: 8000, resonance: 0, envAmount: 0 },
    });
    const dark = synthesizeVoice({
      frequency: 220,
      gate: 0.2,
      osc1: { wave: "saw", level: 1 },
      amp: { attack: 0.005, decay: 0, sustain: 1, release: 0.01 },
      filter: { type: "lowpass", cutoff: 400, resonance: 0, envAmount: 0 },
    });
    expect(toneEnergy(dark, 1760)).toBeLessThan(toneEnergy(bright, 1760) * 0.35);
  });

  it("unison changes the waveform and stays finite at high resonance", () => {
    const plain = synthesizeVoice({
      frequency: 330,
      gate: 0.15,
      osc1: { wave: "saw", level: 1 },
      amp: { attack: 0.005, decay: 0.05, sustain: 0.4, release: 0.05 },
      filter: {
        cutoff: 800,
        resonance: 0.95,
        envAmount: 2,
        adsr: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.05 },
      },
    });
    const wide = synthesizeVoice({
      frequency: 330,
      gate: 0.15,
      osc1: { wave: "saw", level: 1 },
      amp: { attack: 0.005, decay: 0.05, sustain: 0.4, release: 0.05 },
      unison: { voices: 5, detune: 30, blend: 1 },
      filter: {
        cutoff: 800,
        resonance: 0.95,
        envAmount: 2,
        adsr: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.05 },
      },
    });
    expect(plain.some((s, i) => s !== wide[i])).toBe(true);
    for (const buffer of [plain, wide]) {
      expect(buffer.every((s) => Number.isFinite(s))).toBe(true);
    }
  });

  it("renders the same sine twice", () => {
    const patch = {
      frequency: 660,
      gate: 0.1,
      osc1: { wave: "square" as const, level: 1, pulseWidth: 0.5 },
      osc2: { wave: "sine" as const, level: 0.3, coarse: 12 },
      amp: { attack: 0.004, decay: 0.04, sustain: 0.2, release: 0.04 },
      filter: { cutoff: 2000, resonance: 0.3, envAmount: 1 },
    };
    const a = synthesizeVoice(patch);
    const b = synthesizeVoice(patch);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("seed variation detunes a channel preset", () => {
    const a = renderSound(buildSoundConfig({ preset: "blip", seed: 3 }));
    const b = renderSound(buildSoundConfig({ preset: "blip", seed: 9 }));
    expect(a).not.toEqual(b);
  });
});
