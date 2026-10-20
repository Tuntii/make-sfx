import type { ModulatorConfig } from "./types.js";
import { callEngine } from "./wasm.js";

/** LFO modulators (amplitude, pitch, filter, pan); only enabled ones with depth > 0 run. */
export function applyModulators(
  samples: Float32Array,
  modulators: ModulatorConfig[] = [],
): Float32Array {
  return callEngine("applyModulators", { params: {}, modulators }, undefined, samples).buffers[0]!;
}
