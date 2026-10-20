import type { MasterParams, VoiceNote, VoicePatch } from "./types.js";
import { callEngine } from "./wasm.js";

// Channel synth (C++ engine): three oscillators, amplitude ADSR, resonant
// filter with envelope, unison.

const voiceJson = (op: string, patch: VoicePatch, extra?: object, factor?: number): VoicePatch =>
  JSON.parse(
    callEngine(op, { params: {}, voice: patch, ...extra }, factor === undefined ? undefined : { factor }).json!,
  ) as VoicePatch;

export function resolveVoiceNotes(patch: VoicePatch): VoiceNote[] {
  if (patch.notes && patch.notes.length > 0) return patch.notes;
  return [{ time: 0, gate: patch.gate ?? 0.1 }];
}

/** Seconds until the last note's release (amp or filter, whichever is longer) ends. */
export function voiceLength(patch: VoicePatch): number {
  return callEngine("voiceLength", { params: {}, voice: patch }).number;
}

/** Fit note times and envelopes so the patch lasts `master.duration` seconds. */
export function fitVoiceDuration(patch: VoicePatch, master?: MasterParams): VoicePatch {
  if (!master?.duration || master.duration <= 0) return patch;
  return voiceJson("fitVoiceDuration", patch, { master });
}

export function shiftVoicePitch(patch: VoicePatch, factor: number): VoicePatch {
  if (factor === 1) return patch;
  return voiceJson("shiftVoicePitch", patch, undefined, factor);
}

export function cloneVoice(patch: VoicePatch): VoicePatch {
  return structuredClone(patch);
}

export function synthesizeVoice(patch: VoicePatch): Float32Array {
  return callEngine("synthesizeVoice", { params: {}, voice: patch }).buffers[0]!;
}
