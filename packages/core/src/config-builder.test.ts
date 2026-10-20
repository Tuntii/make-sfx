import { describe, expect, it } from "vitest";
import { presets } from "./presets.js";
import { renderSound } from "./render.js";
import { buildSoundConfig, DIGITAL_PACK_DESIGNS, GAME_PACK_DESIGNS } from "./config-builder.js";
import { presetCatalog } from "./presets.js";

function riffHeader(buf: Uint8Array): string {
  return String.fromCharCode(...buf.slice(0, 4));
}

describe("buildSoundConfig", () => {
  it("describe scenario: jump and tiz blink with pitchShift 1.5", () => {
    const jump = buildSoundConfig(GAME_PACK_DESIGNS[0]!);
    const blink = buildSoundConfig(GAME_PACK_DESIGNS[1]!);

    expect(jump.master?.duration).toBe(0.12);
    expect(jump.oscillators?.[0]?.enabled).toBe(true);
    expect(blink.params.frequency).toBeGreaterThan(jump.params.frequency!);
    expect(blink.params.frequency).toBeCloseTo(presets.blink.frequency! * 1.5, 0);

    const jumpWav = renderSound(jump);
    const blinkWav = renderSound(blink);
    expect(riffHeader(jumpWav)).toBe("RIFF");
    expect(riffHeader(blinkWav)).toBe("RIFF");
    expect(jumpWav.length).toBeGreaterThan(1000);
    expect(blinkWav.length).toBeGreaterThan(1000);
  });

  it("full extended config renders non-silent WAV", () => {
    const config = buildSoundConfig({
      preset: "laser",
      master: { duration: 0.3 },
      oscillators: [{ enabled: true, mix: 0.4, detune: 7 }],
      modulators: [{ enabled: true, target: "pitch", rate: 12, depth: 0.4 }],
      texture: { chorus: 0.3, phaser: 0.2 },
      fx: { delayMix: 0.35, stereoWidth: 0.5 },
    });
    const wav = renderSound(config);
    expect(riffHeader(wav)).toBe("RIFF");
    expect(wav.length).toBeGreaterThan(1000);
  });

  it("punch-only modifier does not inject DEFAULT_FX defaults", () => {
    const config = buildSoundConfig({ preset: "jump", punch: 0.5 });
    expect(config.fx?.limiter).toBeUndefined();
    expect(config.fx?.reverbDecay).toBeUndefined();
    expect(config.fx?.compression).toBeCloseTo(0.225, 2);
  });

  it("space modifier adds reverb/delay without limiter default", () => {
    const config = buildSoundConfig({ preset: "blink", space: 0.2 });
    expect(config.fx?.reverbMix).toBeGreaterThan(0);
    expect(config.fx?.limiter).toBeUndefined();
  });

  it("game pack designs all produce valid audio", () => {
    for (const design of GAME_PACK_DESIGNS) {
      const config = buildSoundConfig(design);
      const wav = renderSound(config);
      expect(riffHeader(wav)).toBe("RIFF");
      expect(wav.length).toBeGreaterThan(500);
    }
  });

  it("digital pack renders six distinct catalog sounds", () => {
    const sums = DIGITAL_PACK_DESIGNS.map((design) => {
      const config = buildSoundConfig(design);
      const entry = presetCatalog.find((p) => p.id === design.preset);
      expect(config.category).toBe(entry?.category);
      const wav = renderSound(config);
      expect(riffHeader(wav)).toBe("RIFF");
      expect(wav.length).toBeGreaterThan(500);
      let hash = 2166136261;
      for (let i = 44; i < wav.length; i++) {
        hash ^= wav[i]!;
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    });
    expect(new Set(sums).size).toBe(DIGITAL_PACK_DESIGNS.length);

    const confirm = buildSoundConfig(DIGITAL_PACK_DESIGNS[1]!);
    expect(confirm.voice?.notes?.[1]?.transpose).toBe(7);
    expect(buildSoundConfig({ preset: "jump" }).voice).toBeUndefined();
    const hologram = buildSoundConfig(DIGITAL_PACK_DESIGNS[5]!);
    expect(hologram.category).toBe("stinger");
    expect(hologram.voice?.osc1.wave).toBe("sine");
    expect(hologram.voice?.unison?.voices).toBeGreaterThan(1);

    const blip = buildSoundConfig({ preset: "blip" });
    const tiz = buildSoundConfig({ preset: "blip", pitchShift: 2 });
    expect(tiz.voice!.frequency).toBeCloseTo(blip.voice!.frequency * 2, 3);
  });
});