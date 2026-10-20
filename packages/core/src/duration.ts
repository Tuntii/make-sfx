import type { MasterParams, SoundParams } from "./types.js";
import { callEngine } from "./wasm.js";

/** attack + decay + sustain + release (release defaults to 0.1 s). */
export function envelopeLength(params: SoundParams): number {
  return callEngine("envelopeLength", { params }).number;
}

/** Factor that stretches the envelope to `master.duration`, else `master.durationScale`, else 1. */
export function resolveDurationScale(params: SoundParams, master?: MasterParams): number {
  return callEngine("resolveDurationScale", { params, master }).number;
}

/** Params with every time field multiplied by resolveDurationScale(). */
export function scaleParamsDuration(params: SoundParams, master?: MasterParams): SoundParams {
  return JSON.parse(callEngine("scaleParamsDuration", { params, master }).json!) as SoundParams;
}

/** Master tail, fade-in and fade-out on the dry mix. */
export function applyMasterEnvelope(samples: Float32Array, master?: MasterParams): Float32Array {
  return callEngine("applyMasterEnvelope", { params: {}, master }, undefined, samples).buffers[0]!;
}
