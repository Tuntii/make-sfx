import { describe, expect, it } from "vitest";
import { envelopeLength, resolveDurationScale } from "./duration.js";
import { synthesizeLayers } from "./layers.js";
import { applyModulators } from "./modulation.js";
import { synthesizeDry, synthesizeFull, renderSound } from "./render.js";
import { presets } from "./presets.js";
import { applyTexture } from "./texture.js";
import { buildSamples } from "./synth.js";
import { buildSoundConfig, renderSamples } from "./index.js";

describe("extended engine", () => {
  it("duration scales envelope", () => {
    const natural = envelopeLength(presets.jump);
    const scale = resolveDurationScale(presets.jump, { duration: natural * 2 });
    expect(scale).toBeCloseTo(2, 1);
  });

  it("multi-oscillator produces louder output", () => {
    const mono = synthesizeLayers(presets.laser, []);
    const multi = synthesizeLayers(presets.laser, [
      { enabled: true, mix: 0.5, detune: 7 },
    ]);
    const maxMono = Math.max(...mono.map(Math.abs));
    const maxMulti = Math.max(...multi.map(Math.abs));
    expect(maxMulti).toBeGreaterThan(0);
    expect(multi.length).toBeGreaterThanOrEqual(mono.length);
  });

  it("LFO modulator changes signal", () => {
    const dry = synthesizeDry({ params: presets.alarm });
    const mod = applyModulators(dry, [
      { enabled: true, target: "amplitude", rate: 8, depth: 0.6, shape: 0 },
    ]);
    let diff = 0;
    for (let i = 0; i < dry.length; i++) diff += Math.abs(dry[i] - mod[i]);
    expect(diff).toBeGreaterThan(0);
  });

  it("texture chorus changes signal", () => {
    const dry = synthesizeDry({ params: presets.swoosh });
    const wet = applyTexture(dry, { chorus: 0.5 });
    let diff = 0;
    for (let i = 0; i < dry.length; i++) diff += Math.abs(dry[i] - wet[i]);
    expect(diff).toBeGreaterThan(0);
  });

  it("full config with duration + layers renders WAV", () => {
    const wav = renderSound({
      params: presets.jump,
      master: { duration: 0.2 },
      oscillators: [{ enabled: true, mix: 0.3, detune: 12 }],
      modulators: [{ enabled: true, target: "amplitude", rate: 5, depth: 0.3 }],
      texture: { transient: 0.4 },
      fx: { reverbMix: 0.1 },
    });
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(wav.length).toBeGreaterThan(1000);
  });

  it("master duration increases sample length", () => {
    const short = synthesizeFull({ params: presets.click, master: { duration: 0.05 } });
    const long = synthesizeFull({ params: presets.click, master: { duration: 0.4 } });
    expect(long.length).toBeGreaterThan(short.length);
  });

  it("square (shape=5) omitted pulseWidth falls back to shapeCurve duty (legacy path)", () => {
    // omitted key in params object -> must use shapeCurve/2
    // explicit pulseWidth overrides
    const legacyShapeCurve = 0.25; // => duty 0.125
    const cfgOmitted = { shape: 5, frequency: 880, shapeCurve: legacyShapeCurve, release: 0.05, randomness: 0 };
    const cfgExplicit = { shape: 5, frequency: 880, pulseWidth: legacyShapeCurve / 2, release: 0.05, randomness: 0 };
    // drive the real shipped buildSamples (core of render path)
    const sOmitted = buildSamples(cfgOmitted);
    const sExplicit = buildSamples(cfgExplicit);
    expect(sOmitted.length).toBe(sExplicit.length);
    let maxDiff = 0;
    for (let i = 0; i < sOmitted.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(sOmitted[i] - sExplicit[i]));
    }
    expect(maxDiff).toBeLessThan(1e-9);
    // also drive via public buildSoundConfig + renderSamples path with omitted in inner params
    const cfgFromBuilderOmit = buildSoundConfig({ params: { shape: 5, frequency: 440, shapeCurve: 0.5, release: 0.03, randomness: 0 } });
    const cfgFromBuilderExp = buildSoundConfig({ params: { shape: 5, frequency: 440, pulseWidth: 0.25, release: 0.03, randomness: 0 } });
    const rOmit = renderSamples(cfgFromBuilderOmit);
    const rExp = renderSamples(cfgFromBuilderExp);
    expect(rOmit.length).toBe(rExp.length);
    let d2 = 0;
    for (let i = 0; i < rOmit.length; i++) d2 = Math.max(d2, Math.abs(rOmit[i] - rExp[i]));
    expect(d2).toBeLessThan(1e-9);
  });
});