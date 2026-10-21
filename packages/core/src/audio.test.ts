import { describe, expect, it } from "vitest";
import {
  MakeSfxError,
  decodeWav,
  editAudio,
  encodeClip,
  inspectAudio,
  presets,
  renderMasteredBuffer,
  renderSound,
  type AudioClip,
} from "./index.js";

const SR = 44100;

/** Three presets in a row, separated by silence, as one mono clip. */
function hitsClip(): AudioClip {
  const parts = ["hit", "coin", "jump"].map(
    (p) => renderMasteredBuffer({ params: presets[p as keyof typeof presets] }, { seed: 1 }).mono,
  );
  const gap = Math.round(0.25 * SR);
  const total = parts.reduce((n, p) => n + p.length + gap, gap);
  const samples = new Float32Array(total);
  let at = gap;
  for (const p of parts) {
    samples.set(p, at);
    at += p.length + gap;
  }
  return { sampleRate: SR, channels: [samples] };
}

describe("sample editing", () => {
  it("decodes what it encodes, in every format", () => {
    const clip = hitsClip();
    for (const format of ["pcm16", "pcm24", "f32"] as const) {
      const back = decodeWav(encodeClip(clip, { format }));
      expect(back.sampleRate).toBe(SR);
      expect(back.channels[0]!.length).toBe(clip.channels[0]!.length);
      const tolerance = format === "f32" ? 0 : format === "pcm24" ? 1e-6 : 2e-5;
      let worst = 0;
      clip.channels[0]!.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - back.channels[0]![i]!))));
      expect(worst).toBeLessThanOrEqual(tolerance);
    }
  });

  it("finds the hits and slices a WAV into normalized pieces", () => {
    const wav = encodeClip(hitsClip(), { format: "pcm24" });
    const info = inspectAudio(wav);
    expect(info.onsets).toHaveLength(3);
    expect(info.leadSilence).toBeGreaterThan(0.2);

    const { clips, warnings } = editAudio(wav, [
      { op: "slice", onsets: true },
      { op: "trim_silence", threshold_db: -50 },
      { op: "fade", out: 0.01 },
      { op: "normalize", category: "pickup" },
    ]);
    expect(warnings).toEqual([]);
    expect(clips).toHaveLength(3);
    clips.forEach((c, i) => {
      expect(c.sourceStart).toBeCloseTo(info.onsets[i]!, 1);
      expect(c.stats.lufs!).toBeGreaterThan(-12.6);
      expect(c.stats.lufs!).toBeLessThan(-11.4);
      expect(c.stats.truePeakDbTp!).toBeLessThanOrEqual(-0.99);
    });
  });

  it("changes pitch, speed and sample rate on rendered sounds", () => {
    const wav = renderSound(presets.laser);
    const original = decodeWav(wav);
    const [up] = editAudio(wav, [{ op: "pitch", semitones: 12 }]).clips;
    expect(up!.channels[0]!.length).toBe(Math.floor(original.channels[0]!.length / 2));
    const [slow] = editAudio(original, [{ op: "speed", factor: 0.5 }, { op: "resample", sample_rate: 48000 }]).clips;
    expect(slow!.sampleRate).toBe(48000);
    expect(slow!.stats.duration).toBeCloseTo((original.channels[0]!.length / SR) * 2, 2);
  });

  it("is deterministic", () => {
    const ops = [{ op: "slice", onsets: true }, { op: "pitch", semitones: -5 }, { op: "reverse" }] as const;
    const a = editAudio(hitsClip(), [...ops]).clips.map((c) => encodeClip(c));
    const b = editAudio(hitsClip(), [...ops]).clips.map((c) => encodeClip(c));
    expect(a).toEqual(b);
  });

  it("reports bad programs and files with paths", () => {
    const clip = hitsClip();
    let error: unknown;
    try {
      editAudio(clip, [{ op: "pitch", semitones: 99 }, { op: "explode" } as never]);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(MakeSfxError);
    const paths = (error as MakeSfxError).diagnostics.map((d) => `${d.code} ${d.path}`);
    expect(paths).toContain("E_RANGE /ops/0/semitones");
    expect(paths).toContain("E_ENUM /ops/1/op");
    expect(() => decodeWav(new Uint8Array([1, 2, 3]))).toThrow(/E_WAV/);
  });
});
