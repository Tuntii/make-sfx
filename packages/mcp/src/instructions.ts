export const MCP_WORKFLOW = `
# make-sfx MCP v0.4 — 70+ Parameter Sound Engineer

## Architecture
- OSC 1: main \`params\` (21 ZzFX knobs)
- OSC 2–4: \`oscillators[]\` — mix, detune (semitones), delay, per-layer overrides
- LFO 1–4: \`modulators[]\` — target: amplitude|pitch|filter, rate (Hz), depth, shape
- Duration: \`master.duration\` (seconds) — scales entire ADSR to fit
- Texture: chorus, phaser, crackle, sub, grain, ringMod, wow, transient, gate
- Post-FX: reverb, delay, EQ, compression, saturation, stereo

## Tool order (natural language — start here)
1. sfx_help
2. **sfx_from_description** — "zıplama ve tiz blink" → WAV + code in one call
3. sfx_describe — preview configs without writing files
4. sfx_get_parameters — full schema when tweaking
5. sfx_design — manual full control

## Natural language (PRIMARY)
sfx_from_description({
  description: "zıplama ve tiz blink, hafif reverb",
  outputDir: "./assets/sfx"
})

sfx_describe({ description: "coin pickup bright, punchy hit" })
// → designs[] ready for sfx_design_batch

## Duration example
sfx_design({
  name: "long-boom",
  designProfile: "cinematic-boom",
  master: { duration: 1.2, fadeOut: 0.15 },
  outputDir: "./assets/sfx"
})

## Multi-oscillator example
sfx_design({
  name: "rich-laser",
  preset: "laser",
  oscillators: [
    { enabled: true, mix: 0.4, detune: 7, params: { shape: 2 } },
    { enabled: true, mix: 0.3, detune: -12, params: { noise: 0.3 } }
  ],
  modulators: [
    { enabled: true, target: "pitch", rate: 12, depth: 0.4, shape: 0 },
    { enabled: true, target: "amplitude", rate: 6, depth: 0.2, shape: 1 }
  ],
  texture: { chorus: 0.3, phaser: 0.2 },
  fx: { delayMix: 0.35, stereoWidth: 0.5 },
  outputDir: "./assets/sfx"
})

## Describe → ses (Türkçe oyun pack)
Kullanıcı "zıplama ve tiz blink" derse:
1. sfx_list_presets({ tag: "zıplama" }) → jump
2. sfx_list_presets({ tag: "tiz" }) → blink
3. sfx_design_batch ile GAME_PACK_DESIGNS eşdeğeri:

sfx_design_batch({
  outputDir: "./assets/sfx",
  sounds: [
    { name: "jump", preset: "jump", master: { duration: 0.12 }, punch: 0.5,
      oscillators: [{ enabled: true, mix: 0.25, detune: 7 }], texture: { transient: 0.3 } },
    { name: "blink", preset: "blink", pitchShift: 1.5, master: { duration: 0.06 },
      fx: { reverbMix: 0.05 } },
    { name: "coin", preset: "coin", master: { duration: 0.1 }, brightness: 0.2 },
    { name: "hit", preset: "hit", punch: 0.6, texture: { transient: 0.5 } },
    { name: "powerup", preset: "powerup", master: { duration: 0.28 },
      modulators: [{ enabled: true, target: "pitch", rate: 6, depth: 0.25 }] }
  ]
})

Tarif ipuçları: "tiz/kalın" → pitchShift, "kısa/uzun" → master.duration,
"parlak" → brightness, "yankılı" → space veya fx.reverbMix,
"kalın katman" → oscillators[], "titreme" → modulators[].
`.trim();