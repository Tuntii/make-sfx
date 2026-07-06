import { synthesizeFull } from "./render.js";
import { SAMPLE_RATE, type SoundConfig, type SoundParams } from "./types.js";

let audioContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function play(
  config: SoundParams | SoundConfig,
  options: { volume?: number; pitch?: number } = {},
): AudioBufferSourceNode | undefined {
  const ctx = getContext();
  const samples = synthesizeFull(config);
  const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = options.pitch ?? 1;
  source.connect(ctx.destination);
  source.start();
  return source;
}

export { defineSound, toCodeSnippet } from "./define.js";
export { modify } from "./modify.js";
export { presets, listPresets, getPreset } from "./presets.js";
export { renderSound, synthesizeFull } from "./render.js";
export { encodeWav } from "./wav.js";