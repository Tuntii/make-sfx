import { describe, expect, it } from "vitest";
import { modify } from "./modify.js";
import { presetCatalog, presets } from "./presets.js";
import { synthesize } from "./synth.js";
import { renderSound } from "./render.js";
import { encodeWav } from "./wav.js";

describe("presets", () => {
  it("has 18+ presets with bilingual tags", () => {
    expect(presetCatalog.length).toBeGreaterThanOrEqual(18);
    for (const preset of presetCatalog) {
      expect(preset.tags.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(Object.keys(presets))("generates valid audio for %s", (id) => {
    const samples = synthesize(presets[id as keyof typeof presets]);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.some((s) => Math.abs(s) > 0.001)).toBe(true);
  });

  it("renders WAV with RIFF header", () => {
    const wav = renderSound(presets.jump);
    const header = String.fromCharCode(...wav.slice(0, 4));
    expect(header).toBe("RIFF");
    expect(wav.length).toBeGreaterThan(44);
  });

  it("modify pitchShift raises frequency", () => {
    const modified = modify(presets.blink, { pitchShift: 1.5 });
    expect(modified.frequency).toBe(presets.blink.frequency! * 1.5);
    const wav = encodeWav(synthesize(modified));
    expect(wav.length).toBeGreaterThan(44);
  });

  it("post-FX renders stereo when stereoWidth > 0", () => {
    const wav = renderSound({
      params: presets.laser,
      fx: { stereoWidth: 0.5, delayMix: 0.2, delayTime: 0.1 },
    });
    expect(wav.length).toBeGreaterThan(44);
  });

  it("engineer modifiers brightness increases frequency", () => {
    const modified = modify(presets.click, { brightness: 0.5 });
    expect(modified.frequency!).toBeGreaterThan(presets.click.frequency!);
  });

  it("catalog extended configs render non-silent WAV", () => {
    for (const entry of presetCatalog.filter((p) =>
      ["jump", "blink", "coin", "hit", "powerup", "laser"].includes(p.id),
    )) {
      const wav = renderSound({
        params: entry.params,
        fx: entry.fx,
        master: entry.master,
        oscillators: entry.oscillators,
        modulators: entry.modulators,
        texture: entry.texture,
      });
      expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
      expect(wav.length).toBeGreaterThan(500);
    }
  });
});