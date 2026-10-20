import type { SoundParams } from "./types.js";
import { callEngine } from "./wasm.js";

/**
 * ZzFX v1.3.2 sample generation (C++ engine). Calls without a render seed are
 * deterministic: ZzFX `randomness` draws from the seed-0 generator.
 */
export function buildSamples(params: SoundParams = {}): Float32Array {
  return callEngine("buildSamples", { params }).buffers[0]!;
}

export function synthesize(params: SoundParams): Float32Array {
  return buildSamples(params);
}
