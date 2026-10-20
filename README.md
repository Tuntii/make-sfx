# make-sfx

[![CI](https://github.com/Tuntii/make-sfx/actions/workflows/ci.yml/badge.svg)](https://github.com/Tuntii/make-sfx/actions/workflows/ci.yml)
[![npm make-sfx-core](https://img.shields.io/npm/v/make-sfx-core.svg)](https://www.npmjs.com/package/make-sfx-core)
[![npm make-sfx-mcp](https://img.shields.io/npm/v/make-sfx-mcp.svg)](https://www.npmjs.com/package/make-sfx-mcp)

**Code-driven game SFX with broadcast-style loudness mastering.** Remotion, but for sound.

![make-sfx demo — code, MCP, category loudness](docs/demo.gif)

**[▶ Live demo](https://tuntii.github.io/make-sfx/)** · [npm core](https://www.npmjs.com/package/make-sfx-core) · [npm MCP](https://www.npmjs.com/package/make-sfx-mcp)

Generate jumps, coins, lasers, and UI ticks from code — or **describe** them in plain
language and let your AI agent render them over MCP. Every sound is mastered to a
per-category loudness target, so it sits in the mix without hand-tweaking gain.

## 60 seconds

**In code** — preset to WAV:

```typescript
import { presets, renderSound } from "make-sfx-core";
import { writeFileSync } from "node:fs";

writeFileSync("jump.wav", renderSound(presets.jump)); // Uint8Array → WAV
```

**Or describe it** — one MCP call generates WAV + reusable code:

```
sfx_from_description({ description: "coin pickup, a jump, and a higher-pitched blink",
                       outputDir: "./assets/sfx" })
```

```bash
npm install make-sfx-core          # synthesis engine for your game
npx make-sfx-mcp                   # MCP server for Cursor / Claude (no install)
```

## Why it's different

- **Describe → sound.** Natural language becomes real WAVs through the MCP server —
  no DAW, no sample hunting.
- **Loudness mastering built in.** Each sound targets a category LUFS level (UI −14,
  combat −9, pickup −12, ambient −18, stinger −11) using **ITU-R BS.1770 K-weighting**
  and an **oversampled true-peak limiter** (≤ −1 dBTP). Bright coins and dark thuds end
  up equally loud *to the ear*, not just equal in RMS.
- **Deterministic variation.** A `seed` yields reproducible micro-variants — same seed,
  same WAV, byte for byte — so builds and asset diffs stay stable.

### How it compares

| Feature                  | make-sfx                          | ZzFX                  | sfxr / bfxr / jsfxr          |
|--------------------------|-----------------------------------|-----------------------|------------------------------|
| **Parameter surface**    | 70+ (layers, LFOs, texture, FX)   | ~22 (flat)            | ~25–35 (GUI focused)         |
| **Synthesis model**      | Layered + modulators + texture + mastering | Single osc + fx    | Single osc + limited fx      |
| **Loudness mastering**   | ITU-R BS.1770 K-weight + true-peak limiter (per-category LUFS) | None             | None                         |
| **Deterministic seeds**  | Yes (byte-identical variants)     | Basic randomness      | Random / mutate only         |
| **Code-first / library** | Full TS configs, Node + browser   | Yes (tiny)            | Partial (some ports)         |
| **AI / natural language**| MCP tools (`sfx_from_description`) | —                     | —                            |
| **Export**               | Mastered WAV + reusable code      | WAV (browser)         | WAV                          |
| **Use case**             | Production game audio + AI agents | Tiny demos / js13k    | Rapid retro prototyping      |

## Sound engineering (70+ parameters)

Everything is a plain config object; the render pipeline is
`layers → modulators → texture → master envelope → FX → loudness master → WAV`.

<details>
<summary><b>Full parameter surface</b></summary>

| Group | Count | Highlights |
|-------|-------|-----------|
| Synth | 21 | volume, frequency, wave shape, ADSR, pitch slide, FM, tremolo, filter, bit-crush, delay |
| Master | 5 | `duration` (seconds!), tail, fadeIn, fadeOut, durationScale |
| OSC layers | 4 | mix, detune, delay, per-layer overrides |
| LFO modulators | 4 | amplitude / pitch / filter targets, rate, depth, shape |
| Texture | 11 | chorus, phaser, crackle, sub, transient, flutter, gate, grain, ringMod, wow |
| Post-FX | 12 | reverb, delay, 3-band EQ, compression, saturation, stereo width, limiter |
| Engineer knobs | 6 | `pitchShift`, `brightness`, `warmth`, `punch`, `grit`, `space` |

</details>

```typescript
import { renderSound, presets } from "make-sfx-core";

renderSound({
  params: presets.laser,
  master: { duration: 0.3, fadeOut: 0.1 },
  oscillators: [{ enabled: true, mix: 0.4, detune: 7 }],
  modulators: [{ enabled: true, target: "pitch", rate: 12, depth: 0.4 }],
  texture: { chorus: 0.3, phaser: 0.2 },
  fx: { reverbMix: 0.3, eqHigh: 4, stereoWidth: 0.5 },
});
```

Game presets (`GAME_PACK_DESIGNS`, same configs as MCP `sfx_design_batch`) ship extended
defaults — duration, layers, texture — so the describe workflow sounds good out of the box:

```typescript
import { buildSoundConfig, GAME_PACK_DESIGNS, renderSound } from "make-sfx-core";

renderSound(buildSoundConfig(GAME_PACK_DESIGNS[0])); // fully-designed jump
```

## Presets (25)

`jump` `blink` `coin` `hit` `explosion` `click` `powerup` `gameover` `laser`
`swoosh` `footstep` `alarm` `shield` `success` `error` `menu` `door` `reload` `engine`

Digital UI pack (`DIGITAL_PACK_DESIGNS`, or describe `dijital paket`):

`blip` `confirm` `deny` `glitch` `data` `hologram`

CLI:

```bash
npx make-sfx-core --preset jump --out jump.wav
npx make-sfx-core --preset blink --pitch-shift 1.5 --out blink.wav
```

## MCP integration (Cursor / Claude)

```json
{ "mcpServers": { "make-sfx": { "command": "npx", "args": ["-y", "make-sfx-mcp"] } } }
```

Workflow: `sfx_from_description` in one shot, or `sfx_help` → `sfx_describe` (preview) →
`sfx_from_description` (generate).

| Tool | Description |
|------|-------------|
| `sfx_from_description` | **Primary** — natural language → WAV + code |
| `sfx_describe` | Parse a description to configs (preview) |
| `sfx_game_pack` | Standard game pack + optional seed `variants` |
| `sfx_refine` | Refine an existing design with natural language |
| `sfx_help` | Workflow + examples |
| `sfx_get_parameters` | 70+ params with ranges, units, `aiHint` |
| `sfx_list_design_profiles` | 8 design starting points |
| `sfx_list_presets` | 25 presets (tag filter) |
| `sfx_design` / `sfx_design_batch` | Manual full control (70+ params) |
| `sfx_create` / `sfx_batch_create` | Quick preset workflow |
| `sfx_export` | Export to a specific WAV path |

## Browser playback

```typescript
import { play } from "make-sfx-core/browser";
import { buildSoundConfig, GAME_PACK_DESIGNS } from "make-sfx-core";

play(buildSoundConfig(GAME_PACK_DESIGNS[0]));
```

## Packages

- **`make-sfx-core`** — synthesis engine, 70+ params, loudness mastering, `buildSoundConfig`, `GAME_PACK_DESIGNS`
- **`make-sfx-mcp`** — MCP server for AI agents (describe → WAV)
- **`@make-sfx/playground`** — web sound designer

## Development

```bash
pnpm install && pnpm build && pnpm test

pnpm dev:playground     # sound designer at http://localhost:5173 (70+ live params)
pnpm example:generate   # render assets/sfx/*.wav from GAME_PACK_DESIGNS
pnpm example:game       # local demo page
pnpm demo:gif           # render docs/demo.gif via Remotion (~15s)
pnpm publish:packages   # maintainers
```

Local MCP dev (after `pnpm build`): point your config at
`node ./packages/mcp/dist/server.js`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[good first issues](https://github.com/Tuntii/make-sfx/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## License

MIT — ZzFX synthesis algorithm © Frank Force (MIT), vendored in `make-sfx-core`.
