import {
  SFX_GROUPS,
  SFX_MODULATOR_TARGETS,
  SFX_PARAMS,
  SFX_WAVE_SHAPES,
  type ParamGroup,
  type RegistryParam,
} from "./generated/registry.js";
import type { FxParams, SoundParams } from "./types.js";

// Parameter tables for UIs, docs and the MCP `sfx_get_parameters` tool. The
// data comes from the engine registry (engine/src/legacy/registry.cpp) via
// src/generated/registry.ts; this module only shapes it.

export type { ParamGroup };

export interface ParamSpec {
  key: string;
  label: string;
  labelTr: string;
  group: ParamGroup;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  description: string;
  aiHint: string;
}

export const WAVE_SHAPES = SFX_WAVE_SHAPES;

export const PARAM_GROUPS: { id: ParamGroup; label: string; labelTr: string }[] = SFX_GROUPS.map((g) => ({ ...g }));

/** Registry entries directly under `prefix` ("fx." → fx.reverbMix, not deeper paths). */
function specsAt(prefix: string, slot?: number): ParamSpec[] {
  const fill = (text: string) => (slot === undefined ? text : text.replaceAll("{n}", String(slot)));
  return SFX_PARAMS.filter((p) => p.path.startsWith(prefix) && !p.path.includes(".", prefix.length)).map(
    (p: RegistryParam): ParamSpec => ({
      key: p.path.slice(prefix.length),
      label: fill(p.label),
      labelTr: fill(p.labelTr),
      group: p.group,
      min: p.min,
      max: p.max,
      step: p.step,
      default: p.default,
      ...(p.unit !== undefined && { unit: p.unit }),
      description: fill(p.description),
      aiHint: p.aiHint,
    }),
  );
}

export const SYNTH_PARAMETERS: ParamSpec[] = specsAt("params.");
export const FX_PARAMETERS: ParamSpec[] = specsAt("fx.");
export const MASTER_PARAMETERS: ParamSpec[] = specsAt("master.");
export const TEXTURE_FX_PARAMETERS: ParamSpec[] = specsAt("texture.");

export interface LayerParamSpecs {
  /** Layer root fields — map to oscillators[i].mix / .detune / .delay */
  root: ParamSpec[];
  /** Synth overrides — map to oscillators[i].params.{key} */
  params: ParamSpec[];
}

/** Per-layer oscillator controls (OSC 2–4). Root vs params matches OscillatorLayer type. */
export function getLayerParamSpecs(index: number): LayerParamSpecs {
  return { root: specsAt("oscillators[].", index + 2), params: specsAt("oscillators[].params.", index + 2) };
}

export function getModulatorParamSpecs(index: number): ParamSpec[] {
  return specsAt("modulators[].", index + 1);
}

export const MODULATOR_TARGETS = SFX_MODULATOR_TARGETS;

export const ALL_PARAMETERS = [
  ...SYNTH_PARAMETERS,
  ...MASTER_PARAMETERS,
  ...TEXTURE_FX_PARAMETERS,
  ...FX_PARAMETERS,
];

export function getParameterSchema(): {
  groups: typeof PARAM_GROUPS;
  waveShapes: typeof WAVE_SHAPES;
  modulatorTargets: typeof MODULATOR_TARGETS;
  synth: ParamSpec[];
  master: ParamSpec[];
  textureFx: ParamSpec[];
  postFx: ParamSpec[];
  oscillatorLayers: {
    osc2: LayerParamSpecs;
    osc3: LayerParamSpecs;
    osc4: LayerParamSpecs;
    structure: string;
  };
  modulators: { lfo1: ParamSpec[]; lfo2: ParamSpec[]; lfo3: ParamSpec[]; lfo4: ParamSpec[] };
  totalParams: number;
} {
  return {
    groups: PARAM_GROUPS,
    waveShapes: WAVE_SHAPES,
    modulatorTargets: MODULATOR_TARGETS,
    synth: SYNTH_PARAMETERS,
    master: MASTER_PARAMETERS,
    textureFx: TEXTURE_FX_PARAMETERS,
    postFx: FX_PARAMETERS,
    oscillatorLayers: {
      osc2: getLayerParamSpecs(0),
      osc3: getLayerParamSpecs(1),
      osc4: getLayerParamSpecs(2),
      structure:
        "oscillators[{ enabled, mix, detune, delay, params: { frequency, shape, noise, ... } }]",
    },
    modulators: {
      lfo1: getModulatorParamSpecs(0),
      lfo2: getModulatorParamSpecs(1),
      lfo3: getModulatorParamSpecs(2),
      lfo4: getModulatorParamSpecs(3),
    },
    totalParams: ALL_PARAMETERS.length + 9 + 9 + 16,
  };
}

export function listParametersByGroup(group: ParamGroup): ParamSpec[] {
  return ALL_PARAMETERS.filter((p) => p.group === group);
}

/** AI-facing design profiles — starting points for common sound design goals. */
export const DESIGN_PROFILES = [
  {
    id: "bright-ui-tick",
    name: "Bright UI Tick",
    nameTr: "Parlak UI Tık",
    tags: ["ui", "click", "bright", "tiz"],
    params: { frequency: 1200, shape: 0, release: 0.025, volume: 0.4, filter: 0.15 } satisfies SoundParams,
    fx: { eqHigh: 4, reverbMix: 0.05 } satisfies FxParams,
  },
  {
    id: "muffled-distant",
    name: "Muffled Distant",
    nameTr: "Uzak/Soluk",
    tags: ["distant", "underwater", "muffled", "uzak"],
    params: { filter: -0.35, frequency: 200, release: 0.3, noise: 0.1 } satisfies SoundParams,
    fx: { eqLow: 3, eqHigh: -8, reverbMix: 0.45, reverbDecay: 1.2 } satisfies FxParams,
  },
  {
    id: "punchy-impact",
    name: "Punchy Impact",
    nameTr: "Güçlü Darbe",
    tags: ["hit", "punch", "impact", "darbe"],
    params: { frequency: 90, shape: 3, attack: 0, decay: 0.02, release: 0.08, sustainVolume: 0.5, noise: 0.25 } satisfies SoundParams,
    fx: { compression: 0.5, eqLow: 5, saturation: 0.2 } satisfies FxParams,
  },
  {
    id: "retro-8bit",
    name: "Retro 8-bit",
    nameTr: "Retro 8-bit",
    tags: ["8bit", "chiptune", "retro", "arcade"],
    params: { shape: 5, frequency: 440, pulseWidth: 0.25, bitCrush: 0.05, release: 0.06 } satisfies SoundParams,
    fx: { saturation: 0.15, eqMid: -3 } satisfies FxParams,
  },
  {
    id: "sci-fi-laser",
    name: "Sci-fi Laser",
    nameTr: "Bilim Kurgu Lazer",
    tags: ["laser", "sci-fi", "lazer", "beam"],
    params: { frequency: 600, shape: 2, slide: -0.4, modulation: 12, release: 0.15 } satisfies SoundParams,
    fx: { delayTime: 0.12, delayMix: 0.35, delayFeedback: 0.4, stereoWidth: 0.5 } satisfies FxParams,
  },
  {
    id: "cinematic-boom",
    name: "Cinematic Boom",
    nameTr: "Sinematik Patlama",
    tags: ["boom", "cinematic", "explosion", "patlama"],
    params: { frequency: 55, shape: 4, noise: 0.7, release: 0.6, slide: -0.3, sustain: 0.05 } satisfies SoundParams,
    fx: { reverbMix: 0.5, reverbDecay: 2, eqLow: 8, compression: 0.6, saturation: 0.25 } satisfies FxParams,
  },
  {
    id: "soft-notification",
    name: "Soft Notification",
    nameTr: "Yumuşak Bildirim",
    tags: ["notification", "soft", "gentle", "bildirim"],
    params: { frequency: 660, shape: 0, attack: 0.01, release: 0.12, volume: 0.45 } satisfies SoundParams,
    fx: { reverbMix: 0.15, eqHigh: 2 } satisfies FxParams,
  },
  {
    id: "mechanical-click",
    name: "Mechanical Click",
    nameTr: "Mekanik Tık",
    tags: ["mechanical", "switch", "keyboard", "mekanik"],
    params: { frequency: 800, shape: 1, release: 0.02, noise: 0.08, bitCrush: 0.02 } satisfies SoundParams,
    fx: { compression: 0.4, eqMid: 2 } satisfies FxParams,
  },
] as const;