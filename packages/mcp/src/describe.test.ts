import { describe, expect, it } from "vitest";
import { parseDescription } from "./describe.js";

describe("parseDescription", () => {
  it("parses Turkish jump + tiz blink", () => {
    const result = parseDescription("zıplama ve tiz blink");
    expect(result.designs).toHaveLength(2);
    expect(result.designs[0]!.preset).toBe("jump");
    expect(result.designs[1]!.preset).toBe("blink");
    expect(result.designs[1]!.pitchShift).toBe(1.5);
  });

  it("parses English coin pickup", () => {
    const result = parseDescription("coin pickup, bright");
    expect(result.designs[0]!.preset).toBe("coin");
    expect(result.designs[0]!.brightness).toBeGreaterThan(0);
  });

  it("parses game pack intent", () => {
    const result = parseDescription("oyun sfx pack");
    expect(result.designs).toHaveLength(5);
    expect(result.designs.map((d) => d.name)).toContain("jump");
  });

  it("applies yankılı modifier", () => {
    const result = parseDescription("laser yankılı");
    expect(result.designs[0]!.preset).toBe("laser");
    expect(result.designs[0]!.space ?? result.designs[0]!.fx?.reverbMix).toBeTruthy();
  });
});