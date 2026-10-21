# make-sfx-core

Procedural game sound effects — code-driven synthesis with 70+ parameters.

## Install

```bash
npm install make-sfx-core
# or
pnpm add make-sfx-core
```

## Quick start

```typescript
import { presets, renderSound, buildSoundConfig, DIGITAL_PACK_DESIGNS, GAME_PACK_DESIGNS } from "make-sfx-core";
import { writeFileSync } from "node:fs";

// Simple preset
writeFileSync("jump.wav", renderSound(presets.jump));

// Full config (duration, layers, LFO, texture, post-FX)
const config = buildSoundConfig({
  preset: "laser",
  master: { duration: 0.3 },
  oscillators: [{ enabled: true, mix: 0.4, detune: 7 }],
  fx: { reverbMix: 0.3, stereoWidth: 0.5 },
});
writeFileSync("laser.wav", renderSound(config));

// Game pack (jump, tiz blink, coin, hit, powerup)
for (const d of GAME_PACK_DESIGNS) {
  const cfg = buildSoundConfig(d);
  writeFileSync(`${d.name}.wav`, renderSound(cfg));
}

// Digital UI pack (blip, confirm, deny, glitch, data, hologram)
for (const d of DIGITAL_PACK_DESIGNS) {
  writeFileSync(`${d.name}.wav`, renderSound(buildSoundConfig(d)));
}
```

## Browser

```typescript
import { init, play } from "make-sfx-core/browser";
import { buildSoundConfig, GAME_PACK_DESIGNS } from "make-sfx-core";

await init(); // optional: loads the engine off the critical path
play(buildSoundConfig(GAME_PACK_DESIGNS[0]));
```

## Sample editing

Cut, slice and master any WAV (recordings, downloads or make-sfx renders):

```typescript
import { editAudio, encodeClip, inspectAudio } from "make-sfx-core";
import { readFileSync, writeFileSync } from "node:fs";

const kit = new Uint8Array(readFileSync("drum-loop.wav"));
console.log(inspectAudio(kit).onsets); // hit times in seconds

const { clips } = editAudio(kit, [
  { op: "slice", onsets: true },            // one clip per hit (or { at: [0.5, 1.0] })
  { op: "trim_silence", threshold_db: -50 },
  { op: "fade", in: 0.002, out: 0.02 },
  { op: "pitch", semitones: -2 },           // varispeed; also speed, resample, reverse, mono
  { op: "normalize", category: "combat" },  // or { lufs: -14 } / { peak_db: -1 }
]);
clips.forEach((c, i) => writeFileSync(`hit-${i + 1}.wav`, encodeClip(c, { format: "pcm24" })));
```

Every clip reports where it came from (`sourceStart`/`sourceEnd`, input
seconds) and its levels (`stats.lufs`, `stats.truePeakDbTp`, ...). Input:
PCM 8/16/24/32-bit or float 32/64-bit WAV, mono or stereo, up to 600 s.

## Engine

Rendering runs in the make-sfx C++ engine, compiled to WebAssembly and embedded
in the package: no native build, no `fetch`, no bundler setup. It works the same
in Node, browsers, workers, Deno and Bun, and produces bit-identical PCM on every
platform (the same engine ships as a native library for Unity and Unreal).

The module loads synchronously on first use. In a web page, `await init()` at
startup does the same work asynchronously so the first sound does not stall.

Invalid input throws a `MakeSfxError` listing every problem with a JSON Pointer:

```typescript
import { MakeSfxError, renderSound } from "make-sfx-core";

try {
  renderSound({ params: { frequency: "high" } } as never);
} catch (err) {
  if (err instanceof MakeSfxError) console.log(err.diagnostics);
  // [{ severity: "error", code: "E_TYPE", path: "/params/frequency", message: "expected a number" }]
}
```

### Changes in 2.0

- **Deterministic by default.** A render without `seed` is the same every time
  (1.x drew ZzFX `randomness` from `Math.random`). Pass `seed` for variations.
- **Strict input.** Unknown fields, wrong types, `NaN` and renders longer than
  120 s throw `MakeSfxError` instead of being ignored or allocating gigabytes.
- **Fixed ZzFX pitch.** Frequencies now play at the requested pitch; 1.x derived
  it from the fractional part of the frequency. FM `modulation` follows ZzFX too.
- **Category loudness** is the maximum momentary loudness (400 ms), so silent
  tails no longer make short sounds master louder. `measureIntegratedLufs()`
  keeps the 1.x reading.
- **WAV quantization** rounds to nearest (1.x truncated).
- `SoundParams`, `FxParams`, `MasterParams`, `TextureParams`, their `DEFAULT_*`
  values and the parameter tables are generated from the engine registry.

## CLI

```bash
npx make-sfx-core --list
npx make-sfx-core --preset jump --out jump.wav
npx make-sfx-core --preset blink --pitch-shift 1.5 --out blink.wav
```

## License

MIT