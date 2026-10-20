import type { FxParams } from "./types.js";
import { callEngine } from "./wasm.js";

/** Extra samples post-FX may add beyond dry length (delay taps + reverb tail). */
export function computeFxTailSamples(fx: FxParams = {}): number {
  return callEngine("computeFxTailSamples", { params: {}, fx }).number;
}

/** Post-FX chain: EQ → saturation → compression → delay → reverb → limiter. */
export function applyFx(samples: Float32Array, fx: FxParams = {}): Float32Array {
  return callEngine("applyFx", { params: {}, fx }, undefined, samples).buffers[0]!;
}

/** applyFx(), then a Haas widener when `stereoWidth` > 0. */
export function applyFxStereo(
  samples: Float32Array,
  fx: FxParams = {},
): { left: Float32Array; right: Float32Array } {
  const [left, right] = callEngine("applyFxStereo", { params: {}, fx }, undefined, samples).buffers;
  return { left: left!, right: right! };
}
