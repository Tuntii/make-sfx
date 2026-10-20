import type { TextureParams } from "./types.js";
import { callEngine } from "./wasm.js";

/** Texture processing: chorus, phaser, crackle, sub, transient, flutter, gate, grain, ring mod, wow. */
export function applyTexture(samples: Float32Array, texture?: TextureParams): Float32Array {
  return callEngine("applyTexture", { params: {}, texture }, undefined, samples).buffers[0]!;
}
