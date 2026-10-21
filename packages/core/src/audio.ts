import type { SfxCategory } from "./categories.js";
import { callEngine, type EngineDiagnostic, type EngineOptions } from "./wasm.js";

// Sample editing on any WAV (yours, downloaded, or rendered by make-sfx), run
// by the C++ engine (engine/src/edit/). Deterministic like rendering.

/** Decoded audio: one Float32Array per channel (1 or 2), samples in [-1, 1]. */
export interface AudioClip {
  sampleRate: number;
  channels: Float32Array[];
}

/** Level measurements; `null` where a value is -∞ (silence). */
export interface AudioStats {
  sampleRate: number;
  channels: number;
  frames: number;
  /** Seconds. */
  duration: number;
  peakDbfs: number | null;
  truePeakDbTp: number | null;
  /** Category loudness: maximum momentary (400 ms) loudness, LUFS. */
  lufs: number | null;
  integratedLufs: number | null;
}

export interface AudioInfo extends AudioStats {
  /** Seconds before the first sample above `silenceDb`. */
  leadSilence: number;
  /** Seconds after the last sample above `silenceDb`. */
  tailSilence: number;
  /** Detected hits, in seconds; good cut points for `slice`. */
  onsets: number[];
}

export interface OnsetOptions {
  /** Quietest onset level, dBFS (10 ms RMS). Default -40. */
  threshold_db?: number;
  /** Level jump over the previous 20 ms that counts as a hit, dB. Default 10. */
  rise_db?: number;
  /** Minimum seconds between onsets. Default 0.05. */
  min_gap?: number;
  /** Seconds kept before each onset. Default 0.003. */
  pre_roll?: number;
}

/**
 * One step of an edit program. Steps run in order on every clip; `slice`
 * splits each clip, and later steps apply to every piece. Times are seconds
 * of the clip at that point.
 */
export type EditOp =
  | { op: "trim"; start?: number; end?: number }
  /** Cuts leading/trailing audio below `threshold_db` (default -60 dBFS), keeping `pad` s (default 0.005). */
  | { op: "trim_silence"; threshold_db?: number; pad?: number }
  /** Splits at the given times, or at detected onsets (material before the first onset is dropped). */
  | { op: "slice"; at: number[] }
  | { op: "slice"; onsets: true | OnsetOptions }
  | { op: "fade"; in?: number; out?: number; curve?: "linear" | "cosine" }
  | { op: "gain"; db: number }
  /** Loudness to a category target or LUFS (momentary max, -1 dBTP limit), or true peak to `peak_db`. */
  | { op: "normalize"; category: SfxCategory }
  | { op: "normalize"; lufs: number }
  | { op: "normalize"; peak_db: number }
  | { op: "reverse" }
  /** Varispeed: +12 is an octave up and half the length. */
  | { op: "pitch"; semitones: number }
  /** Varispeed: 2 is twice as fast (and an octave up). */
  | { op: "speed"; factor: number }
  | { op: "resample"; sample_rate: number }
  /** Stereo to mono ((L + R) / 2). */
  | { op: "mono" };

export interface EditedClip extends AudioClip {
  index: number;
  /** Where the clip's material sits in the input, in input seconds. */
  sourceStart: number;
  sourceEnd: number;
  stats: AudioStats;
}

export interface EditResult {
  clips: EditedClip[];
  /** E.g. W_NO_ONSETS, W_SILENT, W_TRUNCATED. */
  warnings: EngineDiagnostic[];
}

export type WavFormat = "pcm16" | "pcm24" | "f32";

type Input = Uint8Array | AudioClip;

interface StatsJson {
  sample_rate: number;
  channels: number;
  frames: number;
  duration_s: number;
  peak_dbfs: number | null;
  true_peak_dbtp: number | null;
  lufs: number | null;
  integrated_lufs: number | null;
}

const toStats = (j: StatsJson): AudioStats => ({
  sampleRate: j.sample_rate,
  channels: j.channels,
  frames: j.frames,
  duration: j.duration_s,
  peakDbfs: j.peak_dbfs,
  truePeakDbTp: j.true_peak_dbtp,
  lufs: j.lufs,
  integratedLufs: j.integrated_lufs,
});

function call(op: string, input: Input, config?: object) {
  if (input instanceof Uint8Array) return callEngine(op, config, undefined, undefined, undefined, input);
  const [left, right] = input.channels;
  if (!left || input.channels.length > 2) throw new RangeError("make-sfx: a clip has 1 or 2 channels");
  const options: EngineOptions = { sample_rate: input.sampleRate };
  return callEngine(op, config, options, left, right);
}

/** Decodes a WAV file (PCM 8/16/24/32-bit or float 32/64-bit, mono or stereo). */
export function decodeWav(file: Uint8Array): AudioClip {
  const result = callEngine("decodeWav", undefined, undefined, undefined, undefined, file);
  const info = JSON.parse(result.json!) as { sample_rate: number };
  return { sampleRate: info.sample_rate, channels: result.buffers };
}

/** Length, levels, silence at both ends and detected onsets. */
export function inspectAudio(input: Input, options: { silence_db?: number; onsets?: OnsetOptions } = {}): AudioInfo {
  const j = JSON.parse(call("inspectAudio", input, options).json!) as StatsJson & {
    lead_silence_s: number;
    tail_silence_s: number;
    onsets_s: number[];
  };
  return { ...toStats(j), leadSilence: j.lead_silence_s, tailSilence: j.tail_silence_s, onsets: j.onsets_s };
}

/** Runs an edit program; one clip in, one or more clips out (after `slice`). */
export function editAudio(input: Input, ops: EditOp[]): EditResult {
  const result = call("editAudio", input, { ops });
  const { clips } = JSON.parse(result.json!) as {
    clips: (StatsJson & { index: number; source_start_s: number; source_end_s: number })[];
  };
  let buffer = 0;
  return {
    clips: clips.map((c) => {
      const channels = result.buffers.slice(buffer, buffer + c.channels);
      buffer += c.channels;
      return {
        index: c.index,
        sampleRate: c.sample_rate,
        channels,
        sourceStart: c.source_start_s,
        sourceEnd: c.source_end_s,
        stats: toStats(c),
      };
    }),
    warnings: result.warnings,
  };
}

/** Writes a clip as a WAV file (default 16-bit PCM, no dither). */
export function encodeClip(clip: AudioClip, options: { format?: WavFormat } = {}): Uint8Array {
  const [left, right] = clip.channels;
  if (!left || clip.channels.length > 2) throw new RangeError("make-sfx: a clip has 1 or 2 channels");
  const engineOptions: EngineOptions = { sample_rate: clip.sampleRate, format: options.format ?? "pcm16" };
  return callEngine(right ? "encodeWavStereo" : "encodeWav", undefined, engineOptions, left, right).bytes!;
}
