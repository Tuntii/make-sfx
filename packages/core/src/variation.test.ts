import { describe, expect, it } from "vitest";
import { presets } from "./presets.js";
import { applyVariation } from "./variation.js";
import { synthesizeFull } from "./render.js";

describe("applyVariation", () => {
  it("different seeds produce different PCM", () => {
    const base = { params: presets.jump };
    const a = synthesizeFull(applyVariation(base, 1));
    const b = synthesizeFull(applyVariation(base, 2));
    let diff = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeGreaterThan(0);
  });

  it("keeps frequency within ±20% of base", () => {
    const baseFreq = presets.jump.frequency!;
    for (const seed of [1, 42, 999, 12345]) {
      const v = applyVariation({ params: presets.jump }, seed);
      const freq = v.params.frequency!;
      expect(freq).toBeGreaterThanOrEqual(baseFreq * 0.8);
      expect(freq).toBeLessThanOrEqual(baseFreq * 1.2);
    }
  });

  it("same seed produces identical config (synth randomness is separate)", () => {
    const cfg = { params: presets.coin, master: { duration: 0.1 } };
    const a = applyVariation(cfg, 42);
    const b = applyVariation(cfg, 42);
    expect(a.params.frequency).toBe(b.params.frequency);
    expect(a.params.randomness).toBe(b.params.randomness);
    expect(a.master?.duration).toBe(b.master?.duration);
  });
});