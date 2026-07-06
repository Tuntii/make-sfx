import { SAMPLE_RATE } from "./types.js";

/** Encode mono Float32 samples to a WAV file buffer (Node + browser). */
export function encodeWav(
  samples: Float32Array,
  sampleRate = SAMPLE_RATE,
): Uint8Array {
  const sampleCount = samples.length;
  const headerSize = 44;
  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = headerSize;
  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    const clamped = s < -1 ? -1 : s > 1 ? 1 : s;
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Encode stereo interleaved Float32 to WAV. */
export function encodeWavStereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate = SAMPLE_RATE,
): Uint8Array {
  const sampleCount = Math.max(left.length, right.length);
  const headerSize = 44;
  const dataSize = sampleCount * 4;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = headerSize;
  for (let i = 0; i < sampleCount; i++) {
    const l = i < left.length ? left[i] : 0;
    const r = i < right.length ? right[i] : 0;
    const clampL = l < -1 ? -1 : l > 1 ? 1 : l;
    const clampR = r < -1 ? -1 : r > 1 ? 1 : r;
    view.setInt16(offset, clampL < 0 ? clampL * 0x8000 : clampL * 0x7fff, true);
    view.setInt16(offset + 2, clampR < 0 ? clampR * 0x8000 : clampR * 0x7fff, true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}