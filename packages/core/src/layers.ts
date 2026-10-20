import type { MasterParams, OscillatorLayer, SoundParams } from "./types.js";
import { callEngine } from "./wasm.js";

/** Main ZzFX voice plus detuned/delayed extra layers, with master duration scaling. */
export function synthesizeLayers(
  baseParams: SoundParams,
  layers: OscillatorLayer[] = [],
  master?: MasterParams,
): Float32Array {
  return callEngine("synthesizeLayers", { params: baseParams, oscillators: layers, master }).buffers[0]!;
}
