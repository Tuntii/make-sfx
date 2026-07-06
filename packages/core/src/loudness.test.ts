import { describe, expect, it } from "vitest";
import { GAME_PACK_DESIGNS, buildSoundConfig } from "./config-builder.js";
import { getTargetLufs, type SfxCategory } from "./categories.js";
import { presets } from "./presets.js";
import { renderMasteredBuffer, synthesizeFull } from "./render.js";
import {
  LOUDNESS_TOLERANCE_LUFS,
  applyTruePeakLimit,
  isWithinLoudnessTarget,
  measureLufs,
  measureTruePeak,
} from "./loudness.js";

const CATEGORY_PRESETS: Record<SfxCategory, keyof typeof presets> = {
  ui: "blink",
  combat: "hit",
  pickup: "coin",
  ambient: "footstep",
  stinger: "powerup",
};

function expectWithinTarget(samples: Float32Array, category: SfxCategory) {
  const target = getTargetLufs(category);
  const lufs = measureLufs(samples);
  expect(lufs).toBeGreaterThanOrEqual(target - LOUDNESS_TOLERANCE_LUFS);
  expect(lufs).toBeLessThanOrEqual(target + LOUDNESS_TOLERANCE_LUFS);
  expect(isWithinLoudnessTarget(samples, category)).toBe(true);
}

describe("loudness pipeline", () => {
  it("measureLufs returns finite value for non-silent SFX", () => {
    const samples = synthesizeFull({ params: presets.hit });
    const lufs = measureLufs(samples);
    expect(Number.isFinite(lufs)).toBe(true);
    expect(lufs).toBeGreaterThan(-40);
  });

  it.each(Object.entries(CATEGORY_PRESETS))(
    "renderMasteredBuffer hits %s target for %s preset (seeded)",
    (category, preset) => {
      const mastered = renderMasteredBuffer(
        { params: presets[preset] },
        { category: category as SfxCategory, presetId: preset, seed: 1 },
      );
      expectWithinTarget(mastered.mono, category as SfxCategory);
    },
  );

  it("renderMasteredBuffer hits stinger for stereo powerup game-pack design", () => {
    const config = buildSoundConfig(GAME_PACK_DESIGNS[4]!);
    for (const seed of [1042, 2042, 3042, 4042]) {
      const mastered = renderMasteredBuffer(config, {
        seed,
        category: "stinger",
        presetId: "powerup",
      });
      expect(mastered.stereo).toBe(true);
      expectWithinTarget(mastered.mono, "stinger");
    }
  });

  it.each([
    ["ui", 1],
    ["pickup", 2],
    ["combat", 0],
    ["combat", 3],
    ["stinger", 4],
  ] as const)(
    "renderMasteredBuffer hits %s for game-pack design[%i] with seed variants",
    (category, index) => {
      const design = GAME_PACK_DESIGNS[index]!;
      const config = buildSoundConfig(design);
      for (const seed of [1042, 2042, 3042, 4042]) {
        const mastered = renderMasteredBuffer(config, {
          seed,
          category,
          presetId: design.preset,
        });
        expectWithinTarget(mastered.mono, category);
        expect(measureTruePeak(mastered.mono)).toBeLessThanOrEqual(-0.99);
      }
    },
  );

  it("renderMasteredBuffer hits ambient for footstep preset", () => {
    const config = buildSoundConfig({ preset: "footstep" });
    const mastered = renderMasteredBuffer(config, { category: "ambient", presetId: "footstep" });
    expectWithinTarget(mastered.mono, "ambient");
  });

  it("true-peak limit prevents clipping above -1 dBTP", () => {
    const loud = new Float32Array(1000);
    for (let i = 0; i < loud.length; i++) loud[i] = 1.5;
    const limited = applyTruePeakLimit(loud, -1);
    expect(measureTruePeak(limited)).toBeLessThanOrEqual(-0.99);
  });
});