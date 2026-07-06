import { z } from "zod";
import {
  DESIGN_PROFILES,
  FX_PARAMETERS,
  MASTER_PARAMETERS,
  MODULATOR_TARGETS,
  SYNTH_PARAMETERS,
  TEXTURE_FX_PARAMETERS,
  presetCatalog,
} from "make-sfx-core";

const presetIds = presetCatalog.map((p) => p.id) as [string, ...string[]];
const profileIds = DESIGN_PROFILES.map((p) => p.id) as [string, ...string[]];
const modTargets = MODULATOR_TARGETS.map((t) => t.value) as [
  "amplitude",
  "pitch",
  "filter",
];

function specsToZod(specs: { key: string; min: number; max: number; description: string; aiHint: string; unit?: string }[]) {
  return Object.fromEntries(
    specs.map((p) => [
      p.key,
      z
        .number()
        .min(p.min)
        .max(p.max)
        .optional()
        .describe(`${p.key} [${p.min}–${p.max}${p.unit ? " " + p.unit : ""}] — ${p.aiHint}`),
    ]),
  );
}

export const soundParamsSchema = z
  .object(specsToZod(SYNTH_PARAMETERS))
  .optional()
  .describe("21 synth parameters");

export const fxParamsSchema = z
  .object(specsToZod(FX_PARAMETERS))
  .optional()
  .describe("12 post-FX parameters");

export const masterParamsSchema = z
  .object(specsToZod(MASTER_PARAMETERS))
  .optional()
  .describe("Duration & master envelope: duration (seconds), tail, fadeIn, fadeOut");

export const textureParamsSchema = z
  .object(specsToZod(TEXTURE_FX_PARAMETERS))
  .optional()
  .describe("11 texture processors: chorus, phaser, crackle, sub, grain, ringMod…");

const layerRootZod = {
  enabled: z.boolean().optional(),
  mix: z.number().min(0).max(1).optional().describe("Layer blend 0–1"),
  detune: z.number().min(-24).max(24).optional().describe("Semitones — root field, not params"),
  delay: z.number().min(0).max(0.2).optional().describe("Start offset seconds"),
};

export const oscillatorLayerParamsSchema = z
  .object(specsToZod([
    { key: "frequency", min: 40, max: 4000, description: "Per-layer frequency", aiHint: "oscillators[i].params.frequency", unit: "Hz" },
    { key: "shape", min: 0, max: 5, description: "Per-layer wave shape", aiHint: "oscillators[i].params.shape" },
    { key: "noise", min: 0, max: 1, description: "Per-layer noise", aiHint: "oscillators[i].params.noise" },
  ]))
  .optional()
  .describe("Synth overrides nested under oscillators[].params — NOT root keys");

export const oscillatorLayerSchema = z
  .object({
    ...layerRootZod,
    params: oscillatorLayerParamsSchema,
  })
  .describe("Extra oscillator layer (OSC 2–4): root=mix/detune/delay, params={frequency,shape,noise}");

export const modulatorSchema = z
  .object({
    enabled: z.boolean().optional(),
    target: z.enum(modTargets).optional(),
    rate: z.number().min(0.1).max(30).optional().describe("Hz"),
    depth: z.number().min(0).max(1).optional(),
    shape: z
      .union([z.literal(0), z.literal(1), z.literal(2)])
      .optional()
      .describe("0=sine 1=tri 2=square"),
    phase: z.number().min(0).max(1).optional(),
  })
  .describe("LFO modulator");

export const presetIdSchema = z.enum(presetIds).optional();
export const designProfileIdSchema = z.enum(profileIds).optional();

export const engineerModifiersSchema = {
  pitchShift: z.number().min(0.25).max(4).optional().describe("1.5=tiz, 0.5=kalın"),
  durationScale: z.number().min(0.1).max(5).optional(),
  volume: z.number().min(0).max(1).optional(),
  randomness: z.number().min(0).max(0.3).optional(),
  brightness: z.number().min(0).max(1).optional(),
  warmth: z.number().min(0).max(1).optional(),
  punch: z.number().min(0).max(1).optional(),
  grit: z.number().min(0).max(1).optional(),
  space: z.number().min(0).max(1).optional(),
};

export const soundDesignFields = {
  designProfile: designProfileIdSchema,
  params: soundParamsSchema,
  fx: fxParamsSchema,
  master: masterParamsSchema,
  texture: textureParamsSchema,
  oscillators: z
    .array(oscillatorLayerSchema)
    .max(3)
    .optional()
    .describe("Up to 3 extra oscillator layers"),
  modulators: z
    .array(modulatorSchema)
    .max(4)
    .optional()
    .describe("Up to 4 LFO modulators"),
  ...engineerModifiersSchema,
};

export const extendedSoundSchema = {
  preset: presetIdSchema,
  ...soundDesignFields,
};

export const designSoundInputSchema = z.object({
  name: z.string(),
  outputDir: z.string().optional(),
  ...extendedSoundSchema,
});