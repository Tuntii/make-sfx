import { describe, expect, it } from "vitest";
import {
  MakeSfxError,
  encodeWav,
  encodeWavStereo,
  engineVersion,
  init,
  isReady,
  presets,
  renderMasteredBuffer,
  renderSound,
  synthesizeFull,
} from "./index.js";

describe("WASM engine", () => {
  it("loads synchronously on first use and init() is then a no-op", async () => {
    synthesizeFull({ params: presets.click });
    expect(isReady()).toBe(true);
    await expect(init()).resolves.toBeUndefined();
    expect(engineVersion()).toMatch(/^2\./);
  });

  it("renders deterministically without a seed", () => {
    expect(renderSound(presets.laser)).toEqual(renderSound(presets.laser));
    expect(renderSound(presets.laser, { seed: 1 })).not.toEqual(renderSound(presets.laser, { seed: 2 }));
  });

  it("reports invalid input with JSON Pointer diagnostics", () => {
    let error: unknown;
    try {
      renderSound({ params: { frequency: Number.NaN, volumee: 1 } } as never);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(MakeSfxError);
    const paths = (error as MakeSfxError).diagnostics.map((d) => `${d.code} ${d.path}`);
    expect(paths).toContain("E_TYPE /params/frequency");
    expect(paths).toContain("E_UNKNOWN_FIELD /params/volumee");
  });

  it("refuses renders past the length limit", () => {
    expect(() => renderMasteredBuffer({ params: { sustain: 100000 } })).toThrow(/E_TOO_LONG/);
  });

  it("writes WAV headers for empty and uneven input", () => {
    expect(encodeWav(new Float32Array(0)).length).toBe(44);
    const stereo = encodeWavStereo(new Float32Array(10), new Float32Array(0));
    expect(stereo.length).toBe(44 + 10 * 4);
    expect(new DataView(stereo.buffer, stereo.byteOffset).getUint16(22, true)).toBe(2);
  });
});
