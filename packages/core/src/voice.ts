import { random } from "./rng.js";
import {
  SAMPLE_RATE,
  type MasterParams,
  type VoiceAdsr,
  type VoiceNote,
  type VoiceOsc,
  type VoicePatch,
  type VoiceWave,
} from "./types.js";

const NYQUIST = SAMPLE_RATE * 0.45;

interface Adsr {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

function adsrOf(src: VoiceAdsr | undefined, fallbackRelease = 0.05): Adsr {
  return {
    attack: Math.max(0, src?.attack ?? 0),
    decay: Math.max(0, src?.decay ?? 0),
    sustain: Math.min(1, Math.max(0, src?.sustain ?? 1)),
    release: Math.max(0.001, src?.release ?? fallbackRelease),
  };
}

function envAt(time: number, gate: number, env: Adsr): number {
  const levelAt = (t: number): number => {
    if (t <= env.attack) return env.attack === 0 ? 1 : t / env.attack;
    if (t <= env.attack + env.decay) {
      const u = env.decay === 0 ? 1 : (t - env.attack) / env.decay;
      return 1 + (env.sustain - 1) * u;
    }
    return env.sustain;
  };
  if (time < gate) return levelAt(time);
  const rel = time - gate;
  if (rel >= env.release) return 0;
  return levelAt(gate) * (1 - rel / env.release);
}

function polyBlep(phase: number, dt: number): number {
  if (dt <= 0 || dt >= 1) return 0;
  if (phase < dt) {
    const x = phase / dt;
    return x + x - x * x - 1;
  }
  if (phase > 1 - dt) {
    const x = (phase - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function oscSample(wave: VoiceWave, phase: number, dt: number, pulseWidth: number): number {
  if (wave === "noise") return random() * 2 - 1;
  if (wave === "sine") return Math.sin(phase * Math.PI * 2);
  if (wave === "triangle") return 4 * Math.abs(phase - 0.5) - 1;
  if (wave === "saw") return 2 * phase - 1 - polyBlep(phase, dt);
  const pw = Math.min(0.95, Math.max(0.05, pulseWidth));
  let sample = phase < pw ? 1 : -1;
  sample += polyBlep(phase, dt);
  sample -= polyBlep((phase - pw + 1) % 1, dt);
  return sample;
}

interface SvfState {
  ic1eq: number;
  ic2eq: number;
}

function svf(
  state: SvfState,
  input: number,
  cutoff: number,
  resonance: number,
): { low: number; band: number; high: number } {
  const fc = Math.min(NYQUIST, Math.max(20, cutoff));
  const g = Math.tan((Math.PI * fc) / SAMPLE_RATE);
  const q = 0.707 + Math.min(1, Math.max(0, resonance)) * 17;
  const k = 1 / q;
  const a1 = 1 / (1 + g * (g + k));
  const a2 = g * a1;
  const a3 = g * a2;
  const v3 = input - state.ic2eq;
  const v1 = a1 * state.ic1eq + a2 * v3;
  const v2 = state.ic2eq + a2 * state.ic1eq + a3 * v3;
  state.ic1eq = 2 * v1 - state.ic1eq;
  state.ic2eq = 2 * v2 - state.ic2eq;
  return { low: v2, band: v1, high: input - k * v1 - v2 };
}

function activeOscs(patch: VoicePatch): VoiceOsc[] {
  return [patch.osc1, patch.osc2, patch.osc3].filter(
    (osc): osc is VoiceOsc => !!osc && osc.enabled !== false && (osc.level ?? 1) > 0,
  );
}

export function resolveVoiceNotes(patch: VoicePatch): VoiceNote[] {
  if (patch.notes && patch.notes.length > 0) return patch.notes;
  return [{ time: 0, gate: patch.gate ?? 0.1 }];
}

export function voiceLength(patch: VoicePatch): number {
  const amp = adsrOf(patch.amp);
  const filterRelease = patch.filter ? adsrOf(patch.filter.adsr, amp.release).release : 0;
  const tail = Math.max(amp.release, filterRelease);
  let end = 0;
  for (const note of resolveVoiceNotes(patch)) {
    end = Math.max(end, note.time + note.gate + tail);
  }
  return end;
}

function scaleAdsr(env: VoiceAdsr | undefined, scale: number): VoiceAdsr | undefined {
  if (!env) return env;
  return {
    ...env,
    attack: (env.attack ?? 0) * scale,
    decay: (env.decay ?? 0) * scale,
    release: (env.release ?? 0) * scale,
  };
}

/** Fit note times and envelopes so the patch lasts `master.duration` seconds. */
export function fitVoiceDuration(patch: VoicePatch, master?: MasterParams): VoicePatch {
  if (!master?.duration || master.duration <= 0) return patch;
  const natural = voiceLength(patch);
  if (natural <= 0) return patch;
  const scale = master.duration / natural;
  return {
    ...patch,
    gate: patch.gate !== undefined ? patch.gate * scale : patch.gate,
    amp: scaleAdsr(patch.amp, scale) ?? patch.amp,
    filter: patch.filter
      ? { ...patch.filter, adsr: scaleAdsr(patch.filter.adsr, scale) }
      : patch.filter,
    notes: patch.notes?.map((note) => ({
      ...note,
      time: note.time * scale,
      gate: note.gate * scale,
    })),
  };
}

export function shiftVoicePitch(patch: VoicePatch, factor: number): VoicePatch {
  if (factor === 1) return patch;
  return {
    ...patch,
    frequency: patch.frequency * factor,
    notes: patch.notes?.map((note) =>
      note.frequency !== undefined ? { ...note, frequency: note.frequency * factor } : note,
    ),
  };
}

export function cloneVoice(patch: VoicePatch): VoicePatch {
  return structuredClone(patch);
}

function noteHz(patch: VoicePatch, note: VoiceNote): number {
  if (note.frequency !== undefined) return note.frequency;
  return patch.frequency * 2 ** ((note.transpose ?? 0) / 12);
}

function renderNote(patch: VoicePatch, note: VoiceNote, out: Float32Array): void {
  const oscs = activeOscs(patch);
  if (oscs.length === 0) return;
  const levelSum = oscs.reduce((sum, osc) => sum + (osc.level ?? 1), 0) || 1;
  const amp = adsrOf(patch.amp);
  const filterEnv = patch.filter ? adsrOf(patch.filter.adsr, amp.release) : amp;
  const tail = Math.max(amp.release, filterEnv.release);
  const start = Math.floor(note.time * SAMPLE_RATE);
  const length = Math.floor((note.gate + tail) * SAMPLE_RATE);
  const baseHz = Math.max(1, noteHz(patch, note));
  const unisonCount = Math.min(7, Math.max(1, Math.round(patch.unison?.voices ?? 1)));
  const spread = patch.unison?.detune ?? 0;
  const blend = Math.min(1, Math.max(0, patch.unison?.blend ?? 1));
  const states: SvfState[] = Array.from({ length: unisonCount }, () => ({ ic1eq: 0, ic2eq: 0 }));
  const phases = oscs.map((_, oscIndex) =>
    Array.from({ length: unisonCount }, (__, voice) => (oscIndex * 0.17 + voice * 0.137) % 1),
  );
  const cutoffBase = patch.filter?.cutoff ?? 8000;
  const resonance = patch.filter?.resonance ?? 0;
  const envAmount = patch.filter?.envAmount ?? 0;
  const filterType = patch.filter?.type ?? "lowpass";
  const volume = patch.volume ?? 0.8;

  for (let i = 0; i < length; i++) {
    const at = start + i;
    if (at < 0 || at >= out.length) continue;
    const t = i / SAMPLE_RATE;
    const ampGain = envAt(t, note.gate, amp);
    if (ampGain <= 0) continue;
    const fEnv = envAt(t, note.gate, filterEnv);
    const cutoff = cutoffBase * 2 ** (envAmount * fEnv);

    let mixed = 0;
    for (let voice = 0; voice < unisonCount; voice++) {
      const pos = unisonCount === 1 ? 0 : (voice / (unisonCount - 1)) * 2 - 1;
      const cents = pos * (spread / 2);
      let stacked = 0;
      for (let o = 0; o < oscs.length; o++) {
        const osc = oscs[o]!;
        const hz = Math.min(
          NYQUIST,
          baseHz * 2 ** ((osc.coarse ?? 0) / 12 + ((osc.fine ?? 0) + cents) / 1200),
        );
        const dt = hz / SAMPLE_RATE;
        const phase = phases[o]![voice]!;
        stacked += oscSample(osc.wave ?? "saw", phase, dt, osc.pulseWidth ?? 0.5) * ((osc.level ?? 1) / levelSum);
        phases[o]![voice] = (phase + dt) % 1;
      }
      stacked /= Math.sqrt(unisonCount);
      if (patch.filter) {
        const filtered = svf(states[voice]!, stacked, cutoff, resonance);
        stacked = filterType === "highpass" ? filtered.high : filterType === "bandpass" ? filtered.band : filtered.low;
      }
      const voiceBlend = unisonCount === 1 ? 1 : voice === (unisonCount - 1) / 2 ? 1 - blend * 0.5 : blend;
      mixed += stacked * (unisonCount === 1 ? 1 : voiceBlend);
    }
    out[at] += Math.tanh(mixed * ampGain * volume);
  }
}

/** Render a channel-synth patch to mono PCM at the engine sample rate. */
export function synthesizeVoice(patch: VoicePatch): Float32Array {
  const notes = resolveVoiceNotes(patch);
  const total = Math.max(1, Math.ceil(voiceLength(patch) * SAMPLE_RATE) + 8);
  const out = new Float32Array(total);
  for (const note of notes) renderNote(patch, note, out);

  let x1 = 0;
  let y1 = 0;
  const r = 0.995;
  for (let i = 0; i < out.length; i++) {
    const x = out[i]!;
    const y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    out[i] = y;
  }
  return out;
}
