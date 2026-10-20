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
  designSoundInputSchema,
  extendedSoundSchema,
  presetIdSchema,
  soundDesignFields,
} from "./schema.js";

const server = new McpServer({
  name: "make-sfx",
  version: "0.5.0",
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

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});