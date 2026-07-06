/** ZzFX synthesis parameters with human-readable names. */
export interface SoundParams {
  volume?: number;
  randomness?: number;
  frequency?: number;
  attack?: number;
  sustain?: number;
  release?: number;
  shape?: number;
  shapeCurve?: number;
  slide?: number;
  deltaSlide?: number;
  pitchJump?: number;
  pitchJumpTime?: number;
  repeatTime?: number;
  noise?: number;
  modulation?: number;
  bitCrush?: number;
  delay?: number;
  sustainVolume?: number;
  decay?: number;
  tremolo?: number;
  filter?: number;
}

export interface FxParams {
  reverbMix?: number;
  reverbDecay?: number;
  delayTime?: number;
  delayMix?: number;
  delayFeedback?: number;
  eqLow?: number;
  eqMid?: number;
  eqHigh?: number;
  compression?: number;
  saturation?: number;
  stereoWidth?: number;
  limiter?: number;
}

/** Master timing — control total SFX length. */
export interface MasterParams {
  /** Target total envelope length in seconds (scales ADSR). */
  duration?: number;
  /** Manual ADSR scale multiplier (used if duration not set). */
  durationScale?: number;
  /** Extra tail padding after sound in seconds. */
  tail?: number;
  /** Fade-in applied to final mix (seconds). */
  fadeIn?: number;
  /** Fade-out applied to final mix (seconds). */
  fadeOut?: number;
}

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

/** Post-synth texture processing. */
export interface TextureParams {
  chorus?: number;
  phaser?: number;
  crackle?: number;
  subMix?: number;
  /** Sub oscillator octave offset (0.5 = 1 octave down). */
  subOctave?: number;
  transient?: number;
  flutter?: number;
  gate?: number;
  grain?: number;
  ringMod?: number;
  wow?: number;
}

export interface SoundConfig {
  params: SoundParams;
  fx?: FxParams;
  master?: MasterParams;
  /** Extra oscillator layers (OSC 2–4). Main params = OSC 1. */
  oscillators?: OscillatorLayer[];
  /** Up to 4 LFO modulators. */
  modulators?: ModulatorConfig[];
  texture?: TextureParams;
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
  params: SoundParams;
  fx?: FxParams;
  master?: MasterParams;
  oscillators?: OscillatorLayer[];
  modulators?: ModulatorConfig[];
  texture?: TextureParams;
}

export const DEFAULT_SOUND_PARAMS: Required<SoundParams> = {
  volume: 1,
  randomness: 0.05,
  frequency: 220,
  attack: 0,
  sustain: 0,
  release: 0.1,
  shape: 0,
  shapeCurve: 1,
  slide: 0,
  deltaSlide: 0,
  pitchJump: 0,
  pitchJumpTime: 0,
  repeatTime: 0,
  noise: 0,
  modulation: 0,
  bitCrush: 0,
  delay: 0,
  sustainVolume: 1,
  decay: 0,
  tremolo: 0,
  filter: 0,
};

export const DEFAULT_FX_PARAMS: Required<FxParams> = {
  reverbMix: 0,
  reverbDecay: 0.8,
  delayTime: 0,
  delayMix: 0,
  delayFeedback: 0.3,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  compression: 0,
  saturation: 0,
  stereoWidth: 0,
  limiter: 0.8,
};

export const DEFAULT_MASTER_PARAMS: Required<MasterParams> = {
  duration: 0,
  durationScale: 1,
  tail: 0,
  fadeIn: 0,
  fadeOut: 0,
};

export const DEFAULT_TEXTURE_PARAMS: Required<TextureParams> = {
  chorus: 0,
  phaser: 0,
  crackle: 0,
  subMix: 0,
  subOctave: 0.5,
  transient: 0,
  flutter: 0,
  gate: 0,
  grain: 0,
  ringMod: 0,
  wow: 0,
};

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