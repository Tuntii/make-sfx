import { describe, expect, it } from "vitest";
import { GAME_PACK_DESIGNS, presets } from "make-sfx-core";
import { buildSoundConfig, createSound } from "./utils.js";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function riffHeader(buf: Uint8Array): string {
  return String.fromCharCode(...buf.slice(0, 4));
}

describe("mcp utils", () => {
  it("builds config from preset + modifiers", () => {
    const config = buildSoundConfig({
      name: "blink",
      preset: "blink",
      pitchShift: 1.5,
    });
    expect(config.params.frequency).toBeGreaterThan(800);
  });

  it("builds config from design profile", () => {
    const config = buildSoundConfig({
      name: "boom",
      designProfile: "cinematic-boom",
    });
    expect(config.params.frequency).toBeLessThan(120);
    expect(config.fx?.reverbMix).toBeGreaterThan(0);
  });

  it("applies master duration", () => {
    const config = buildSoundConfig({
      name: "click",
      preset: "click",
      master: { duration: 0.3 },
    });
    expect(config.master?.duration).toBe(0.3);
  });

  it("merges preset + profile + fx", () => {
    const config = buildSoundConfig({
      name: "laser",
      preset: "laser",
      designProfile: "sci-fi-laser",
      fx: { stereoWidth: 0.8 },
      space: 0.2,
    });
    expect(config.fx?.stereoWidth).toBeDefined();
    expect(config.fx?.reverbMix).toBeGreaterThan(0);
  });

  it("describe scenario: Turkish game pack jump + tiz blink", () => {
    const jump = buildSoundConfig(GAME_PACK_DESIGNS[0]!);
    const blink = buildSoundConfig(GAME_PACK_DESIGNS[1]!);

    expect(blink.params.frequency!).toBeGreaterThan(jump.params.frequency!);
    expect(blink.params.frequency).toBeCloseTo(presets.blink.frequency! * 1.5, 0);
    expect(jump.master?.duration).toBe(0.12);
    expect(blink.master?.duration).toBe(0.06);
  });

  it("createSound writes WAV with full config response", async () => {
    const dir = join(tmpdir(), `make-sfx-mcp-${Date.now()}`);
    await mkdir(dir, { recursive: true });

    const result = await createSound(
      {
        name: "jump",
        preset: "jump",
        punch: 0.5,
        master: { duration: 0.15 },
        oscillators: [{ enabled: true, mix: 0.3, detune: 7 }],
        modulators: [{ enabled: true, target: "amplitude", rate: 6, depth: 0.2 }],
        texture: { transient: 0.3 },
        fx: { reverbMix: 0.1 },
      },
      dir,
    );

    expect(result.filePath).toBeTruthy();
    expect(result.config.fx?.reverbMix).toBe(0.1);
    expect(result.code).toContain("renderSound");
    expect(result.code).toContain("reverbMix");

    const buf = await readFile(result.filePath!);
    expect(riffHeader(buf)).toBe("RIFF");
    expect(buf.length).toBeGreaterThan(1000);
    await rm(dir, { recursive: true, force: true });
  });

  it("createSound batch game pack designs", async () => {
    const dir = join(tmpdir(), `make-sfx-pack-${Date.now()}`);
    await mkdir(dir, { recursive: true });

    for (const design of GAME_PACK_DESIGNS) {
      const result = await createSound({ ...design, name: design.name! }, dir);
      const buf = await readFile(result.filePath!);
      expect(riffHeader(buf)).toBe("RIFF");
      expect(buf.length).toBeGreaterThan(500);
    }

    await rm(dir, { recursive: true, force: true });
  });
});