import { SAMPLE_RATE } from "./types.js";
import { callEngine } from "./wasm.js";

/** Encode mono Float32 samples to a 16-bit PCM WAV file (Node + browser). */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
  return callEngine("encodeWav", undefined, { sample_rate: sampleRate }, samples).bytes!;
}

/** Encode a stereo pair to a 16-bit PCM WAV file; the shorter channel is padded with silence. */
export function encodeWavStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate = SAMPLE_RATE,
): Uint8Array {
  return callEngine("encodeWavStereo", undefined, { sample_rate: sampleRate }, left, right).bytes!;
}
