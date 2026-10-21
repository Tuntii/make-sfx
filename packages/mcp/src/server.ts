#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  DESIGN_PROFILES,
  WAVE_SHAPES,
  MODULATOR_TARGETS,
  getParameterSchema,
  listPresets,
  renderSound,
  toConfigSnippet,
  paramsToZzfxArray,
} from "make-sfx-core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { GAME_PACK_DESIGNS } from "make-sfx-core";
import { parseDescription, refineDesign } from "./describe.js";
import { MCP_WORKFLOW } from "./instructions.js";
import { createSound, buildSoundConfig, type CreateSoundInput } from "./utils.js";
import {
  defaultOutput,
  editOpSchema,
  editSampleFile,
  inspectSampleFile,
  onsetOptionsSchema,
} from "./samples.js";
import {
  designSoundInputSchema,
  extendedSoundSchema,
  presetIdSchema,
  soundDesignFields,
} from "./schema.js";

const server = new McpServer({
  name: "make-sfx",
  version: "2.0.0",
});

server.tool(
  "sfx_help",
  "Start here. Workflow for 70+ parameters: duration, 4 oscillators, 4 LFOs, texture, post-FX.",
  {},
  async () => ({ content: [{ type: "text" as const, text: MCP_WORKFLOW }] }),
);

server.tool(
  "sfx_get_parameters",
  "Full schema: 21 synth + 5 master (duration!) + 11 texture + 12 post-FX + 3 OSC layers + 4 LFOs. 70+ knobs with aiHint.",
  {
    group: z
      .enum([
        "output", "oscillator", "envelope", "pitch", "modulation", "filter",
        "texture", "master", "layers", "modulators", "textureFx", "postFx", "all",
      ])
      .optional(),
  },
  async (args) => {
    const schema = getParameterSchema();
    const payload =
      args.group && args.group !== "all"
        ? { group: args.group, ...filterSchemaByGroup(schema, args.group) }
        : { ...schema, waveShapes: WAVE_SHAPES, modulatorTargets: MODULATOR_TARGETS };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    };
  },
);

function filterSchemaByGroup(schema: ReturnType<typeof getParameterSchema>, group: string) {
  if (group === "layers") {
    return {
      oscillatorLayers: schema.oscillatorLayers,
      zodShape: "oscillators[{ enabled, mix, detune, delay, params: { frequency, shape, noise } }]",
    };
  }
  if (group === "modulators") return { modulators: schema.modulators, modulatorTargets: MODULATOR_TARGETS };
  return {
    synth: schema.synth.filter((p) => p.group === group),
    master: schema.master.filter((p) => p.group === group),
    textureFx: schema.textureFx.filter((p) => p.group === group),
    postFx: schema.postFx.filter((p) => p.group === group),
  };
}

server.tool(
  "sfx_list_design_profiles",
  "8 AI design starting points.",
  {},
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(DESIGN_PROFILES, null, 2) }],
  }),
);

server.tool(
  "sfx_describe",
  "PRIMARY for natural language — parse description into ready sfx_design configs. No files written.",
  {
    description: z
      .string()
      .describe(
        "Natural language SFX request. e.g. 'zıplama ve tiz blink', 'coin pickup bright', 'oyun sfx pack'",
      ),
  },
  async (args) => {
    const result = parseDescription(args.description);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ...result,
              nextStep: "Call sfx_from_description with same text + outputDir to generate WAVs",
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "sfx_refine",
  "Refine an existing SoundDesignInput with natural-language modifiers (pitch, duration, punch, etc.).",
  {
    design: z.record(z.unknown()).describe("Existing SoundDesignInput object from sfx_describe"),
    refinement: z.string().describe("e.g. 'daha tiz ve kısa', 'more punchy with reverb'"),
  },
  async (args) => {
    const { design, notes } = refineDesign(
      args.design as Parameters<typeof refineDesign>[0],
      args.refinement,
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ design, notes, nextStep: "Call sfx_design with design + outputDir" }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "sfx_from_description",
  "Describe → WAV in one step. Parses natural language, generates files + pasteable code.",
  {
    description: z.string().describe("e.g. 'zıplama ve tiz blink, hafif reverb'"),
    outputDir: z.string().describe("Directory for .wav files"),
  },
  async (args) => {
    const parsed = parseDescription(args.description);
    const results = await Promise.all(
      parsed.designs.map((d) =>
        createSound({ ...d, name: d.name! } as CreateSoundInput, args.outputDir),
      ),
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              description: args.description,
              outputDir: args.outputDir,
              notes: parsed.notes,
              sounds: results,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "sfx_game_pack",
  "Generate standard game SFX pack (jump, tiz blink, coin, hit, powerup) with category loudness + optional seed variants.",
  {
    outputDir: z.string().describe("Directory for .wav files"),
    variants: z
      .number()
      .int()
      .min(1)
      .max(8)
      .optional()
      .describe("Seed variants per sound (default 1). e.g. 4 → jump-s1..jump-s4"),
  },
  async (args) => {
    const variantCount = args.variants ?? 1;
    const tasks: Promise<Awaited<ReturnType<typeof createSound>>>[] = [];

    for (const d of GAME_PACK_DESIGNS) {
      if (variantCount === 1) {
        tasks.push(createSound({ ...d, name: d.name! } as CreateSoundInput, args.outputDir));
      } else {
        for (let s = 1; s <= variantCount; s++) {
          tasks.push(
            createSound(
              { ...d, name: d.name!, seed: s * 1000 + 42 } as CreateSoundInput,
              args.outputDir,
              { seed: s * 1000 + 42 },
            ),
          );
        }
      }
    }

    const results = await Promise.all(tasks);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { outputDir: args.outputDir, variants: variantCount, sounds: results },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "sfx_list_presets",
  "25 presets with optional tag filter.",
  { tag: z.string().optional() },
  async (args) => {
    const all = listPresets();
    const filtered = args.tag
      ? all.filter(
          (p) =>
            p.tags.some((t) => t.toLowerCase().includes(args.tag!.toLowerCase())) ||
            p.id.includes(args.tag!.toLowerCase()),
        )
      : all;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(filtered, null, 2) }],
    };
  },
);

server.tool(
  "sfx_design",
  "PRIMARY — 70+ params: preset + duration + 3 extra OSC + 4 LFO + texture + post-FX + engineer modifiers.",
  {
    name: z.string(),
    outputDir: z.string().optional(),
    ...extendedSoundSchema,
  },
  async (args) => {
    const result = await createSound(args as CreateSoundInput, args.outputDir);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "sfx_design_batch",
  "Batch full sound design with duration, oscillators, LFOs, texture per sound.",
  {
    outputDir: z.string(),
    sounds: z.array(designSoundInputSchema.omit({ outputDir: true })).min(1),
  },
  async (args) => {
    const results = await Promise.all(
      args.sounds.map((s) => createSound(s as CreateSoundInput, args.outputDir)),
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ outputDir: args.outputDir, sounds: results }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "sfx_create",
  "Quick preset + modifiers. Use sfx_design for full control.",
  {
    name: z.string(),
    outputDir: z.string().optional(),
    preset: presetIdSchema.describe("Required preset id"),
    ...soundDesignFields,
  },
  async (args) => {
    if (!args.preset) throw new Error("preset required");
    const result = await createSound(args as CreateSoundInput, args.outputDir);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  "sfx_batch_create",
  "Quick batch presets.",
  {
    outputDir: z.string(),
    sounds: z.array(
      z.object({
        name: z.string(),
        preset: presetIdSchema.describe("Required preset id"),
        ...soundDesignFields,
      }),
    ),
  },
  async (args) => {
    const results = await Promise.all(
      args.sounds.map((s) => createSound(s as Parameters<typeof createSound>[0], args.outputDir)),
    );
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ outputDir: args.outputDir, sounds: results }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "sfx_export",
  "Export full config to WAV path.",
  {
    outputPath: z.string(),
    ...extendedSoundSchema,
  },
  async (args) => {
    const config = buildSoundConfig({ ...args, name: "export" } as CreateSoundInput);
    const outputPath = resolve(args.outputPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, renderSound(config));
    const name = outputPath.replace(/\.wav$/i, "").split(/[/\\]/).pop() ?? "sound";
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { outputPath, config, zzfx: paramsToZzfxArray(config.params), code: toConfigSnippet(name, config) },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "sample_inspect",
  "Inspect any WAV file (yours, downloaded, or from sfx_*): length, sample rate, channels, peak, true peak, " +
    "loudness, silence at both ends, and detected hit onsets (seconds) — use them as cut points for sample_edit.",
  {
    path: z.string().describe("WAV file (PCM 8/16/24/32-bit or float, mono/stereo, 8–384 kHz)"),
    silence_db: z.number().min(-120).max(0).optional().describe("Level counted as silence, dBFS (default -60)"),
    onsets: onsetOptionsSchema.optional().describe("Onset detector tuning"),
  },
  async (args) => ({
    content: [{ type: "text" as const, text: JSON.stringify(await inspectSampleFile(args), null, 2) }],
  }),
);

server.tool(
  "sample_edit",
  "Cut and process a WAV: trim, trim_silence, slice (at times or detected hits → one file per piece), fade, gain, " +
    "normalize (game category / LUFS / true peak), reverse, pitch (semitones), speed, resample, mono. Ops run in " +
    "order; after slice they apply to every piece. Example: [{op:'slice',onsets:true},{op:'trim_silence'}," +
    "{op:'fade',out:0.02},{op:'normalize',category:'combat'}]. Returns each written file with its source range and levels.",
  {
    input: z.string().describe("WAV file to edit"),
    ops: z.array(editOpSchema).min(1).max(64),
    output: z
      .string()
      .optional()
      .describe("Output .wav path; several pieces become <name>-01.wav, <name>-02.wav ... (default <input>-edit.wav)"),
    format: z.enum(["pcm16", "pcm24", "f32"]).optional().describe("WAV encoding (default pcm16)"),
  },
  async (args) => {
    const result = await editSampleFile({ ...args, output: args.output ?? defaultOutput(args.input) });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});