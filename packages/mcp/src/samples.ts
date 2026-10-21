import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { z } from "zod";
import {
  SFX_CATEGORIES,
  editAudio,
  encodeClip,
  inspectAudio,
  type EditOp,
  type EngineDiagnostic,
} from "make-sfx-core";

// sample_inspect / sample_edit: cut, slice and master any WAV file.

/** Larger inputs are refused before reading (the engine caps decoding at 600 s). */
const MAX_INPUT_BYTES = 256 * 1024 * 1024;

const categoryIds = SFX_CATEGORIES.map((c) => c.id) as [string, ...string[]];
const seconds = (what: string) => z.number().min(0).describe(`${what}, seconds`);

export const onsetOptionsSchema = z
  .object({
    threshold_db: z.number().min(-120).max(0).optional().describe("Quietest hit, dBFS (default -40)"),
    rise_db: z.number().min(1).max(60).optional().describe("Level jump that counts as a hit, dB (default 10)"),
    min_gap: z.number().min(0.01).max(10).optional().describe("Minimum seconds between hits (default 0.05)"),
    pre_roll: z.number().min(0).max(0.1).optional().describe("Seconds kept before each hit (default 0.003)"),
  })
  .strict();

export const editOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("trim"), start: seconds("Start").optional(), end: seconds("End").optional() }).strict(),
  z
    .object({
      op: z.literal("trim_silence"),
      threshold_db: z.number().min(-120).max(0).optional().describe("Silence level, dBFS (default -60)"),
      pad: z.number().min(0).max(1).optional().describe("Seconds kept around the sound (default 0.005)"),
    })
    .strict(),
  z
    .object({
      op: z.literal("slice"),
      at: z.array(seconds("Cut time")).max(511).optional().describe("Cut at these times"),
      onsets: z.union([z.literal(true), onsetOptionsSchema]).optional().describe("Cut at detected hits"),
    })
    .strict()
    .describe("Split into pieces; give `at` or `onsets`. Later ops apply to every piece."),
  z
    .object({
      op: z.literal("fade"),
      in: seconds("Fade-in").optional(),
      out: seconds("Fade-out").optional(),
      curve: z.enum(["linear", "cosine"]).optional(),
    })
    .strict(),
  z.object({ op: z.literal("gain"), db: z.number().min(-60).max(60) }).strict(),
  z
    .object({
      op: z.literal("normalize"),
      category: z.enum(categoryIds).optional().describe("Game SFX loudness target (ui -14, combat -9, ... LUFS)"),
      lufs: z.number().min(-60).max(0).optional().describe("Loudness target, LUFS (momentary max)"),
      peak_db: z.number().min(-60).max(0).optional().describe("True-peak target, dBTP"),
    })
    .strict()
    .describe("Give exactly one of category, lufs, peak_db. Loudness modes limit true peak to -1 dBTP."),
  z.object({ op: z.literal("reverse") }).strict(),
  z
    .object({ op: z.literal("pitch"), semitones: z.number().min(-48).max(48) })
    .strict()
    .describe("Varispeed: +12 = octave up and half as long"),
  z
    .object({ op: z.literal("speed"), factor: z.number().min(0.25).max(4) })
    .strict()
    .describe("Varispeed: 2 = twice as fast and an octave up"),
  z.object({ op: z.literal("resample"), sample_rate: z.number().int().min(8000).max(192000) }).strict(),
  z.object({ op: z.literal("mono") }).strict(),
]);

async function readWav(path: string): Promise<Uint8Array> {
  const file = resolve(path);
  const info = await stat(file);
  if (info.size > MAX_INPUT_BYTES) {
    throw new Error(`${file}: ${(info.size / 2 ** 20).toFixed(0)} MB is over the ${MAX_INPUT_BYTES / 2 ** 20} MB limit`);
  }
  return new Uint8Array(await readFile(file));
}

export interface SampleInspectInput {
  path: string;
  silence_db?: number;
  onsets?: z.infer<typeof onsetOptionsSchema>;
}

export async function inspectSampleFile(input: SampleInspectInput) {
  const wav = await readWav(input.path);
  const info = inspectAudio(wav, { silence_db: input.silence_db, onsets: input.onsets });
  return { path: resolve(input.path), bytes: wav.length, ...info };
}

export interface SampleEditInput {
  input: string;
  ops: z.infer<typeof editOpSchema>[];
  output: string;
  format?: "pcm16" | "pcm24" | "f32";
}

export interface SampleEditResult {
  input: string;
  files: {
    path: string;
    sourceStart: number;
    sourceEnd: number;
    duration: number;
    sampleRate: number;
    channels: number;
    lufs: number | null;
    truePeakDbTp: number | null;
    peakDbfs: number | null;
  }[];
  warnings: EngineDiagnostic[];
}

/** One clip → `output`; several → `<output>-01.wav`, `<output>-02.wav`, ... */
export async function editSampleFile(input: SampleEditInput): Promise<SampleEditResult> {
  const wav = await readWav(input.input);
  const { clips, warnings } = editAudio(wav, input.ops as EditOp[]);
  const out = resolve(input.output);
  const stem = extname(out).toLowerCase() === ".wav" ? out.slice(0, -4) : out;
  await mkdir(dirname(out), { recursive: true });

  const files: SampleEditResult["files"] = [];
  for (const clip of clips) {
    const path = clips.length === 1 ? `${stem}.wav` : `${stem}-${String(clip.index + 1).padStart(2, "0")}.wav`;
    await writeFile(path, encodeClip(clip, { format: input.format ?? "pcm16" }));
    files.push({
      path,
      sourceStart: clip.sourceStart,
      sourceEnd: clip.sourceEnd,
      duration: clip.stats.duration,
      sampleRate: clip.sampleRate,
      channels: clip.stats.channels,
      lufs: clip.stats.lufs,
      truePeakDbTp: clip.stats.truePeakDbTp,
      peakDbfs: clip.stats.peakDbfs,
    });
  }
  return { input: resolve(input.input), files, warnings };
}

/** Default output next to the input: `<dir>/<name>-edit.wav`. */
export function defaultOutput(inputPath: string): string {
  const file = resolve(inputPath);
  return join(dirname(file), `${basename(file, extname(file))}-edit.wav`);
}
