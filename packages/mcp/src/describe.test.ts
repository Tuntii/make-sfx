import { describe, expect, it } from "vitest";
import { parseDescription, refineDesign } from "./describe.js";

describe("parseDescription", () => {
  it("parses Turkish jump + tiz blink", () => {
    const result = parseDescription("zıplama ve tiz blink");
    expect(result.designs).toHaveLength(2);
    expect(result.designs[0]!.preset).toBe("jump");
    expect(result.designs[1]!.preset).toBe("blink");
    expect(result.designs[1]!.pitchShift).toBe(1.5);
    expect(result.designs[0]!.category).toBe("combat");
    expect(result.designs[1]!.category).toBe("ui");
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

  it("assigns category to game pack designs", () => {
    const result = parseDescription("oyun sfx pack");
    expect(result.designs.every((d) => d.category)).toBe(true);
    expect(result.designs.find((d) => d.preset === "coin")?.category).toBe("pickup");
  });

  it("refineDesign applies modifiers to existing design", () => {
    const base = parseDescription("jump").designs[0]!;
    const { design } = refineDesign(base, "daha tiz ve kısa");
    expect(design.pitchShift).toBe(1.5);
    expect(design.master?.duration).toBe(0.08);
  });
});