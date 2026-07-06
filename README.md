# make-sfx

Code-driven procedural sound effects — **Remotion for SFX**.

Generate game and UI sounds from code, export WAV files, or let your AI agent create them via MCP by **describing** the sound in natural language.

```typescript
import { buildSoundConfig, GAME_PACK_DESIGNS, renderSound } from "@make-sfx/core";

const jump = buildSoundConfig(GAME_PACK_DESIGNS[0]);
const wav = renderSound(jump);
// → Uint8Array ready to write as jump.wav
```

## Install (npm)

```bash
# Synthesis library — use in your game/project
npm install @make-sfx/core

# MCP server for Cursor / Claude (or use npx, no install)
npm install -g @make-sfx/mcp
```

```typescript
import { presets, renderSound, buildSoundConfig } from "@make-sfx/core";
import { writeFileSync } from "node:fs";

writeFileSync("jump.wav", renderSound(presets.jump));
```

CLI:

```bash
npx @make-sfx/core --preset jump --out jump.wav
npx @make-sfx/core --preset blink --pitch-shift 1.5 --out blink.wav
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Publish to npm (maintainers):

```bash
pnpm publish:packages
```

### Playground (Sound Designer)

```bash
pnpm dev:playground
```

Open http://localhost:5173 — **70+ parameters**: duration, 4 oscillators, 4 LFOs, texture processing, post-FX.

### Game SFX Pack Example (jump + tiz blink)

```bash
pnpm example:generate   # assets/sfx/*.wav üret
pnpm example:game       # demo sayfası
```

`examples/game-sfx-pack/` — zıplama, tiz blink, coin, hit, powerup. Uses `GAME_PACK_DESIGNS` — same configs as MCP `sfx_design_batch`.

### HTML Game Demo

```bash
pnpm --filter @make-sfx/example-html-game dev
```

Press **Space** to jump (jump SFX) or click **Blink UI** (high-pitch blink).

## MCP Integration (Cursor / Grok)

Add to your MCP config (`.cursor/mcp.json` or global MCP settings):

```json
{
  "mcpServers": {
    "make-sfx": {
      "command": "npx",
      "args": ["-y", "@make-sfx/mcp"]
    }
  }
}
```

Local dev (after `pnpm build`):

```json
{
  "mcpServers": {
    "make-sfx": {
      "command": "node",
      "args": ["./packages/mcp/dist/server.js"]
    }
  }
}
```

### Describe → Sound (AI workflow)

> Oyunum için zıplama ve daha tiz blink, hafif reverb

**One call:** `sfx_from_description({ description: "...", outputDir: "./assets/sfx" })`

Or step-by-step:
1. `sfx_help` — read workflow
2. `sfx_describe` — preview parsed configs
3. `sfx_from_description` — generate WAV + code

```json
{
  "outputDir": "./assets/sfx",
  "sounds": [
    {
      "name": "jump",
      "preset": "jump",
      "master": { "duration": 0.12 },
      "punch": 0.5,
      "oscillators": [{ "enabled": true, "mix": 0.25, "detune": 7 }],
      "texture": { "transient": 0.3 }
    },
    {
      "name": "blink",
      "preset": "blink",
      "pitchShift": 1.5,
      "master": { "duration": 0.06 },
      "fx": { "reverbMix": 0.05 }
    }
  ]
}
```

### MCP Tools (v0.4)

| Tool | Description |
|------|-------------|
| `sfx_from_description` | **Primary** — natural language → WAV + code |
| `sfx_describe` | Parse description to configs (preview) |
| `sfx_game_pack` | Standard game pack (jump, blink, coin, hit, powerup) |
| `sfx_help` | Workflow + examples |
| `sfx_get_parameters` | 70+ params with ranges, units, aiHint |
| `sfx_list_design_profiles` | 8 design starting points |
| `sfx_list_presets` | 18 presets (tag filter: zıplama, tiz, coin…) |
| `sfx_design` | Manual full control (70+ params) |
| `sfx_design_batch` | Batch design with explicit configs |
| `sfx_create` / `sfx_batch_create` | Quick preset workflow |
| `sfx_export` | Export to specific WAV path |

## Sound Engineering (70+ parameters)

**21 Synth:** volume, frequency, wave shape, ADSR envelope, pitch slide, FM, tremolo, filter, bit crush, delay…

**5 Master:** `duration` (seconds!), tail, fadeIn, fadeOut, durationScale

**3 OSC layers:** mix, detune, delay, per-layer overrides

**4 LFO modulators:** amplitude/pitch/filter targets, rate, depth, shape

**11 Texture:** chorus, phaser, crackle, sub, transient, flutter, gate, grain, ringMod, wow

**12 Post-FX:** reverb, delay, 3-band EQ, compression, saturation, stereo width, limiter

**Engineer modifiers:** `pitchShift`, `brightness`, `warmth`, `punch`, `grit`, `space`

```typescript
import { renderSound, presets } from "@make-sfx/core";

renderSound({
  params: presets.laser,
  master: { duration: 0.3, fadeOut: 0.1 },
  oscillators: [{ enabled: true, mix: 0.4, detune: 7 }],
  modulators: [{ enabled: true, target: "pitch", rate: 12, depth: 0.4 }],
  texture: { chorus: 0.3, phaser: 0.2 },
  fx: { reverbMix: 0.3, eqHigh: 4, stereoWidth: 0.5 },
});
```

## Presets (18)

`jump` `blink` `coin` `hit` `explosion` `click` `powerup` `gameover` `laser` `swoosh` `footstep` `alarm` `shield` `success` `error` `menu` `door` `reload` `engine`

Game presets include extended defaults (duration, layers, texture) for MCP describe workflow.

## Browser Playback

```typescript
import { play } from "@make-sfx/core/browser";
import { buildSoundConfig, GAME_PACK_DESIGNS } from "@make-sfx/core";

play(buildSoundConfig(GAME_PACK_DESIGNS[0])); // jump with full config
```

## Packages

- `@make-sfx/core` — synthesis engine, 70+ params, `buildSoundConfig`, `GAME_PACK_DESIGNS`
- `@make-sfx/mcp` — MCP server for AI agents (describe → WAV)
- `@make-sfx/playground` — web sound designer

## License

MIT — ZzFX synthesis algorithm © Frank Force (MIT), vendored in `@make-sfx/core`.