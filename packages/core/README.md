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
import { play } from "make-sfx-core/browser";
import { buildSoundConfig, GAME_PACK_DESIGNS } from "make-sfx-core";

play(buildSoundConfig(GAME_PACK_DESIGNS[0]));
```

## CLI

```bash
npx make-sfx-core --list
npx make-sfx-core --preset jump --out jump.wav
npx make-sfx-core --preset blink --pitch-shift 1.5 --out blink.wav
```

## License

MIT