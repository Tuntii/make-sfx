import { describe, expect, it } from "vitest";
import { GAME_PACK_DESIGNS, buildSoundConfig } from "./config-builder.js";
import { getTargetLufs, type SfxCategory } from "./categories.js";
import { presets } from "./presets.js";
import { renderMasteredBuffer, synthesizeFull } from "./render.js";
import { SAMPLE_RATE } from "./types.js";
import {
  LOUDNESS_TOLERANCE_LUFS,
  applyTruePeakLimit,
  isWithinLoudnessTarget,
  measureLufs,
  measureTruePeak,
} from "./loudness.js";

/** Sine at `freq` Hz, constant amplitude → constant RMS regardless of freq. */
function sine(freq: number, seconds = 0.3, amp = 0.25, phase = 0): Float32Array {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE + phase);
  }
  return out;
}

function samplePeakDb(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak > 1e-10 ? 20 * Math.log10(peak) : -70;
}

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

describe("K-weighted loudness (BS.1770)", () => {
  it("rates high frequencies louder than low frequencies at equal RMS", () => {
    // Equal amplitude → equal RMS. K-weighting boosts highs, so the high tone
    // must measure clearly louder in LUFS. Plain RMS would rate them equal.
    const low = sine(120);
    const high = sine(6000);
    expect(measureLufs(high)).toBeGreaterThan(measureLufs(low) + 2);
  });

  it("leaves a 1 kHz reference near the unweighted level", () => {
    // K-weighting is ~0 dB around 1 kHz, so the value should barely move.
    const s = sine(1000, 0.3, 0.25);
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
    const unweighted = 20 * Math.log10(Math.sqrt(sum / s.length)) - 0.691;
    expect(Math.abs(measureLufs(s) - unweighted)).toBeLessThan(2);
  });
});

describe("oversampled true peak", () => {
  // A tone at SR/4 with a 45° phase lands samples at ±amp/√2 while the real
  // crest (amp) falls between samples — sample peak underreads by ~3 dB.
  const interSample = (amp: number) => sine(SAMPLE_RATE / 4, 0.2, amp, Math.PI / 4);

  it("measureTruePeak detects inter-sample peaks above the sample peak", () => {
    const s = interSample(0.9);
    expect(measureTruePeak(s)).toBeGreaterThan(samplePeakDb(s) + 1);
  });

  it("applyTruePeakLimit brings inter-sample peaks under the ceiling", () => {
    const s = interSample(1.2); // true peak well over 0 dBFS
    const limited = applyTruePeakLimit(s, -1);
    expect(measureTruePeak(limited)).toBeLessThanOrEqual(-0.99);
  });
});