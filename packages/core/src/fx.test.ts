import { describe, expect, it } from "vitest";
import { synthesize } from "./synth.js";
import { applyFx, computeFxTailSamples } from "./fx.js";
import { renderSound } from "./render.js";
import { presets } from "./presets.js";
import { SAMPLE_RATE } from "./types.js";

describe("post-FX tails", () => {
  it("computeFxTailSamples reports delay and reverb extension", () => {
    expect(computeFxTailSamples({})).toBe(0);
    expect(computeFxTailSamples({ delayMix: 0.3, delayTime: 0.1 })).toBeGreaterThan(0);
    expect(computeFxTailSamples({ reverbMix: 0.4, reverbDecay: 1.2 })).toBeGreaterThan(0);
  });

  it("applyFx extends buffer beyond dry length for delay", () => {
    const dry = synthesize(presets.click);
    const wet = applyFx(dry, { delayMix: 0.35, delayTime: 0.08, delayFeedback: 0.4 });
    expect(wet.length).toBeGreaterThan(dry.length);
    const tailEnergy = wet.slice(dry.length).reduce((s, v) => s + Math.abs(v), 0);
    expect(tailEnergy).toBeGreaterThan(0.001);
  });

  it("applyFx extends buffer beyond dry length for reverb", () => {
    const dry = synthesize(presets.explosion);
    const wet = applyFx(dry, { reverbMix: 0.45, reverbDecay: 1.5 });
    expect(wet.length).toBeGreaterThan(dry.length);
    const tailEnergy = wet.slice(dry.length).reduce((s, v) => s + Math.abs(v), 0);
    expect(tailEnergy).toBeGreaterThan(0.001);
  });

  it("renderSound with space/reverb produces longer WAV than dry-only", () => {
    const dryOnly = renderSound({ params: presets.blink });
    const withSpace = renderSound({
      params: presets.blink,
      fx: { reverbMix: 0.35, reverbDecay: 1.0 },
    });
    expect(withSpace.length).toBeGreaterThan(dryOnly.length);
    const drySamples = (dryOnly.length - 44) / 2;
    const wetSamples = (withSpace.length - 44) / 2;
    expect(wetSamples).toBeGreaterThan(drySamples + SAMPLE_RATE * 0.05);
  });
});