import type { SoundConfig, SoundDefinition, SoundParams } from "./types.js";

export function defineSound(definition: SoundDefinition): SoundDefinition {
  return { ...definition };
}

export function toCodeSnippet(definition: SoundDefinition): string {
  const { id, preset, ...overrides } = definition;

  if (preset) {
    const hasOverrides = Object.keys(overrides).length > 0;
    const expr = hasOverrides
      ? `modify(presets.${preset}, ${JSON.stringify(overrides)})`
      : `presets.${preset}`;
    return [
      `import { ${hasOverrides ? "modify, " : ""}presets, play } from "make-sfx-core/browser";`,
      ``,
      `const ${id} = ${expr};`,
      `play(${id});`,
    ].join("\n");
  }

  return [
    `import { defineSound, play } from "make-sfx-core/browser";`,
    ``,
    `const ${id} = defineSound(${JSON.stringify(definition, null, 2)});`,
    `play(${id});`,
  ].join("\n");
}

/** Full synth + post-FX config snippet for MCP / engineer workflow. */
export function toConfigSnippet(name: string, config: SoundConfig): string {
  const cfg = JSON.stringify(config, null, 2);
  return [
    `import { renderSound } from "make-sfx-core";`,
    `import { play } from "make-sfx-core/browser";`,
    ``,
    `export const ${name} = ${cfg} as const;`,
    ``,
    `// Browser playback`,
    `play(${name});`,
    ``,
    `// Export WAV (Node/build)`,
    `const wav = renderSound(${name});`,
  ].join("\n");
}

export function paramsToZzfxArray(params: SoundParams): unknown[] {
  return [
    params.volume ?? 1,
    params.randomness ?? 0.05,
    params.frequency ?? 220,
    params.attack ?? 0,
    params.sustain ?? 0,
    params.release ?? 0.1,
    params.shape ?? 0,
    params.shapeCurve ?? 1,
    params.slide ?? 0,
    params.deltaSlide ?? 0,
    params.pitchJump ?? 0,
    params.pitchJumpTime ?? 0,
    params.repeatTime ?? 0,
    params.noise ?? 0,
    params.modulation ?? 0,
    params.bitCrush ?? 0,
    params.delay ?? 0,
    params.sustainVolume ?? 1,
    params.decay ?? 0,
    params.tremolo ?? 0,
    params.filter ?? 0,
  ];
}