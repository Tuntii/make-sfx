// Writes the source WAVs of the `edit` golden entries from make-sfx renders:
//   hits.wav    mono, 32 kHz, 16-bit: three hits in silence (onset slicing)
//   stereo.wav  stereo, 48 kHz, 24-bit (decoder, resampler, stereo paths)
// The files are committed; rerun only to replace them on purpose.
//
// usage: node make-sources.mjs <packages/core/dist/index.js>

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const core = await import(pathToFileURL(process.argv[2]).href);
const here = dirname(fileURLToPath(import.meta.url));

function wav(channels, sampleRate, bits) {
  const frames = channels[0].length;
  const bytesPerSample = bits / 8;
  const data = Buffer.alloc(frames * channels.length * bytesPerSample);
  const max = 2 ** (bits - 1) - 1;
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (const ch of channels) {
      const v = Math.round(Math.max(-1, Math.min(1, ch[i])) * max);
      data.writeIntLE(v, o, bytesPerSample);
      o += bytesPerSample;
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels.length, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels.length * bytesPerSample, 28);
  header.writeUInt16LE(channels.length * bytesPerSample, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Renders are 44.1 kHz; place them by sample index, which is fine for test material.
const place = (length, items) => {
  const out = new Float32Array(length);
  for (const { at, samples, gain = 1 } of items) {
    for (let i = 0; i < samples.length && at + i < length; i++) out[at + i] += samples[i] * gain;
  }
  return out;
};
const render = (preset, seed) => core.renderMasteredBuffer({ params: core.presets[preset] }, { seed, normalize: false }).mono;

const hits = place(32000, [
  { at: 3200, samples: render("hit", 1) },
  { at: 12800, samples: render("coin", 2), gain: 0.6 },
  { at: 22400, samples: render("footstep", 3) },
]);
writeFileSync(join(here, "hits.wav"), wav([hits], 32000, 16));

const tone = render("laser", 4);
const left = place(14400, [{ at: 480, samples: tone }]);
const right = place(14400, [{ at: 960, samples: tone, gain: 0.7 }]);
writeFileSync(join(here, "stereo.wav"), wav([left, right], 48000, 24));
console.log("wrote hits.wav, stereo.wav");
