import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeWav, encodeClip, presets, renderMasteredBuffer } from "make-sfx-core";
import { editOpSchema, editSampleFile, inspectSampleFile } from "./samples.js";

let dir: string;
let kit: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "make-sfx-samples-"));
  // Three one-shots with silence between them, as a "recorded" kit.
  const hits = ["hit", "coin", "footstep"].map(
    (p) => renderMasteredBuffer({ params: presets[p as keyof typeof presets] }, { seed: 7 }).mono,
  );
  const gap = 11025;
  const samples = new Float32Array(hits.reduce((n, h) => n + h.length + gap, gap));
  let at = gap;
  for (const h of hits) {
    samples.set(h, at);
    at += h.length + gap;
  }
  kit = join(dir, "kit.wav");
  await writeFile(kit, encodeClip({ sampleRate: 44100, channels: [samples] }, { format: "pcm24" }));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sample tools", () => {
  it("sample_inspect finds the hits", async () => {
    const info = await inspectSampleFile({ path: kit });
    expect(info.sampleRate).toBe(44100);
    expect(info.onsets).toHaveLength(3);
  });

  it("sample_edit slices into numbered, normalized files", async () => {
    const result = await editSampleFile({
      input: kit,
      output: join(dir, "out", "kit.wav"),
      ops: [
        { op: "slice", onsets: true },
        { op: "trim_silence", threshold_db: -50 },
        { op: "normalize", category: "combat" },
      ],
    });
    expect(result.files.map((f) => f.path.split(/[/\\]/).pop())).toEqual(["kit-01.wav", "kit-02.wav", "kit-03.wav"]);
    for (const f of result.files) {
      expect(Math.abs(f.lufs! + 9)).toBeLessThanOrEqual(0.6);
      expect(f.truePeakDbTp!).toBeLessThanOrEqual(-0.99);
      const wav = decodeWav(new Uint8Array(await readFile(f.path)));
      expect(wav.channels[0]!.length / wav.sampleRate).toBeCloseTo(f.duration, 3);
    }
  });

  it("sample_edit writes a single clip to the given path", async () => {
    const out = join(dir, "short.wav");
    const result = await editSampleFile({
      input: kit,
      output: out,
      ops: [{ op: "trim", start: 0.2, end: 0.6 }, { op: "pitch", semitones: 7 }, { op: "reverse" }],
      format: "f32",
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe(out);
    expect(result.files[0]!.sourceStart).toBeCloseTo(0.2, 5);
  });

  it("the op schema rejects what the engine would reject", () => {
    expect(editOpSchema.safeParse({ op: "pitch", semitones: 100 }).success).toBe(false);
    expect(editOpSchema.safeParse({ op: "trim", start: 1, wrong: true }).success).toBe(false);
    expect(editOpSchema.safeParse({ op: "slice", onsets: true }).success).toBe(true);
  });
});
