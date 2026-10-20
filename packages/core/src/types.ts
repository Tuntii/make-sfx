import type { SfxCategory } from "./categories.js";
import type { FxParams, MasterParams, SoundParams, TextureParams } from "./generated/registry.js";

export type { SfxCategory };

// The four parameter blocks and their defaults come from the engine registry.
export type { FxParams, MasterParams, SoundParams, TextureParams } from "./generated/registry.js";
export {
  DEFAULT_FX_PARAMS,
  DEFAULT_MASTER_PARAMS,
  DEFAULT_SOUND_PARAMS,
  DEFAULT_TEXTURE_PARAMS,
} from "./generated/registry.js";

/** Additional oscillator voice layered on top of main params. */
export interface OscillatorLayer {
  enabled?: boolean;
  /** Mix level 0–1. */
  mix?: number;
  /** Detune in semitones (+12 = octave up). */
  detune?: number;
  /** Start offset in seconds. */
  delay?: number;
  /** Per-layer partial overrides. */
  params?: Partial<SoundParams>;
}

export type ModulatorTarget = "amplitude" | "pitch" | "filter" | "pan";
export type ModulatorShape = 0 | 1 | 2; // sine, triangle, square

/** LFO modulator — up to 4 can run in parallel. */
export interface ModulatorConfig {
  enabled?: boolean;
  target?: ModulatorTarget;
  /** LFO speed in Hz. */
  rate?: number;
  /** Modulation depth 0–1. */
  depth?: number;
  shape?: ModulatorShape;
  /** Start phase 0–1. */
  phase?: number;
}

export type VoiceWave = "sine" | "triangle" | "saw" | "square" | "noise";

/** One oscillator in the channel synth (up to three). */
export interface VoiceOsc {
  enabled?: boolean;
  wave?: VoiceWave;
  /** Semitone offset from the note. */
  coarse?: number;
  /** Detune in cents. */
  fine?: number;
  /** Linear mix 0–1. */
  level?: number;
  /** Square duty cycle, 0.05–0.95. */
  pulseWidth?: number;
}

/** Seconds, except sustain which is a 0–1 level. */
export interface VoiceAdsr {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

export interface VoiceFilter {
  type?: "lowpass" | "highpass" | "bandpass";
  /** Hz at envelope zero. */
  cutoff?: number;
  /** 0–1. */
  resonance?: number;
  /** Octaves added to cutoff at envelope peak. Negative closes the filter. */
  envAmount?: number;
  adsr?: VoiceAdsr;
}

export interface VoiceUnison {
  /** 1–7. */
  voices?: number;
  /** Full spread in cents, split evenly around the note. */
  detune?: number;
  /** 0 keeps the center voice, 1 is the full detuned stack. */
  blend?: number;
}

export interface VoiceNote {
  /** Start time in seconds. */
  time: number;
  /** Held length in seconds. Release follows the gate. */
  gate: number;
  frequency?: number;
  /** Semitone transpose from the patch frequency. */
  transpose?: number;
}

/**
 * Channel synth patch — three oscillators, amplitude ADSR, resonant filter, unison.
 * When set on a config, it replaces ZzFX for that sound.
 */
export interface VoicePatch {
  /** Note frequency in Hz. */
  frequency: number;
  volume?: number;
  osc1: VoiceOsc;
  osc2?: VoiceOsc;
  osc3?: VoiceOsc;
  amp: VoiceAdsr;
  filter?: VoiceFilter;
  unison?: VoiceUnison;
  /** Single note at t=0 when omitted. */
  notes?: VoiceNote[];
  /** Gate length of the default note, in seconds. */
  gate?: number;
}

export interface SoundConfig {
  params: SoundParams;
  fx?: FxParams;
  master?: MasterParams;
  /** Extra oscillator layers (OSC 2–4). Main params = OSC 1. Ignored when `voice` is set. */
  oscillators?: OscillatorLayer[];
  /** Up to 4 LFO modulators. */
  modulators?: ModulatorConfig[];
  texture?: TextureParams;
  /** Subtractive channel synth. Replaces ZzFX layers when present. */
  voice?: VoicePatch;
  /** Loudness mastering category. */
  category?: SfxCategory;
  /** Variation seed (applied at render time). */
  seed?: number;
}

export interface SoundModifiers {
  pitchShift?: number;
  durationScale?: number;
  volume?: number;
  randomness?: number;
  brightness?: number;
  warmth?: number;
  punch?: number;
  grit?: number;
  space?: number;
}

export interface SoundDefinition extends SoundParams {
  id: string;
  preset?: string;
}

export interface PresetMeta {
  id: string;
  name: string;
  description: string;
  tags: string[];
  category: SfxCategory;
  params: SoundParams;
  fx?: FxParams;
  master?: MasterParams;
  oscillators?: OscillatorLayer[];
  modulators?: ModulatorConfig[];
  texture?: TextureParams;
  /** Channel synth. When set, render uses this instead of ZzFX params. */
  voice?: VoicePatch;
}

export const DEFAULT_MODULATOR: Required<ModulatorConfig> = {
  enabled: false,
  target: "amplitude",
  rate: 4,
  depth: 0,
  shape: 0,
  phase: 0,
};

export const SAMPLE_RATE = 44100;
export const MASTER_VOLUME = 0.3;