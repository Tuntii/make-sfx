import { describe, expect, it } from "vitest";
import { presets } from "./presets.js";
import { synthesizeFull } from "./render.js";
import {
  applyTruePeakLimit,
  measureLufs,
  measureTruePeak,
  normalizeLoudness,
} from "./loudness.js";

describe("loudness pipeline", () => {
  it("measureLufs returns finite value for non-silent SFX", () => {
    const samples = synthesizeFull({ params: presets.hit });
    const lufs = measureLufs(samples);
    expect(Number.isFinite(lufs)).toBe(true);
    expect(lufs).toBeGreaterThan(-40);
  });

  it("normalizeLoudness hits UI target within ±2 LUFS", () => {
    const samples = synthesizeFull({ params: presets.blink });
    const normalized = normalizeLoudness(samples, "ui");
    const lufs = measureLufs(normalized);
    expect(lufs).toBeGreaterThanOrEqual(-16);
    expect(lufs).toBeLessThanOrEqual(-12);
  });

  it("normalizeLoudness hits combat target within ±2 LUFS", () => {
    const samples = synthesizeFull({ params: presets.hit });
    const normalized = normalizeLoudness(samples, "combat");
    const lufs = measureLufs(normalized);
    expect(lufs).toBeGreaterThanOrEqual(-11);
    expect(lufs).toBeLessThanOrEqual(-7);
  });

  it("true-peak limit prevents clipping above -1 dBTP", () => {
    const loud = new Float32Array(1000);
    for (let i = 0; i < loud.length; i++) loud[i] = 1.5;
    const limited = applyTruePeakLimit(loud, -1);
    expect(measureTruePeak(limited)).toBeLessThanOrEqual(-0.99);
  });
});