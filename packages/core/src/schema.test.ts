import { describe, expect, it } from "vitest";
import { getParameterSchema } from "./parameters.js";

describe("parameter schema", () => {
  it("exposes master, textureFx, oscillatorLayers, modulators for AI agents", () => {
    const schema = getParameterSchema();

    expect(schema.master.length).toBeGreaterThan(0);
    expect(schema.master.some((p) => p.key === "duration")).toBe(true);
    expect(schema.textureFx.length).toBeGreaterThanOrEqual(10);
    expect(schema.oscillatorLayers.structure).toContain("params");
    expect(schema.oscillatorLayers.osc2.root.length).toBeGreaterThan(0);
    expect(schema.oscillatorLayers.osc2.params.length).toBeGreaterThan(0);
    expect(schema.oscillatorLayers.osc3.root.length).toBeGreaterThan(0);
    expect(schema.oscillatorLayers.osc4.params.length).toBeGreaterThan(0);
    expect(schema.modulators.lfo1.length).toBeGreaterThan(0);
    expect(schema.modulators.lfo4.length).toBeGreaterThan(0);
    expect(schema.totalParams).toBeGreaterThanOrEqual(70);
  });

  it("includes aiHint on every synth parameter", () => {
    const schema = getParameterSchema();
    for (const p of schema.synth) {
      expect(p.aiHint.length).toBeGreaterThan(5);
    }
  });
});