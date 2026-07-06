import type { FxParams, SoundParams } from "./types.js";

export type ParamGroup =
  | "output"
  | "oscillator"
  | "envelope"
  | "pitch"
  | "modulation"
  | "filter"
  | "texture"
  | "master"
  | "layers"
  | "modulators"
  | "textureFx"
  | "postFx";

export interface ParamSpec {
  key: string;
  label: string;
  labelTr: string;
  group: ParamGroup;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  description: string;
  aiHint: string;
}

export const WAVE_SHAPES = [
  { value: 0, label: "Sine", desc: "Soft, pure tone — UI blips, notifications" },
  { value: 1, label: "Triangle", desc: "Buzzy, hollow — jumps, retro arcade" },
  { value: 2, label: "Saw", desc: "Bright, aggressive — lasers, alarms" },
  { value: 3, label: "Tan", desc: "Harsh, metallic — impacts, clangs" },
  { value: 4, label: "Noise", desc: "Random — explosions, wind, scratches" },
  { value: 5, label: "Square", desc: "Chiptune, 8-bit — coins, powerups" },
] as const;

export const PARAM_GROUPS: { id: ParamGroup; label: string; labelTr: string }[] = [
  { id: "output", label: "Output", labelTr: "Çıkış" },
  { id: "oscillator", label: "Oscillator", labelTr: "Osilatör" },
  { id: "envelope", label: "Envelope (ADSR)", labelTr: "Zarf (ADSR)" },
  { id: "pitch", label: "Pitch / Glide", labelTr: "Perde / Kayma" },
  { id: "modulation", label: "Modulation", labelTr: "Modülasyon" },
  { id: "filter", label: "Filter", labelTr: "Filtre" },
  { id: "texture", label: "Texture / FX", labelTr: "Doku / Efekt" },
  { id: "master", label: "Duration / Master", labelTr: "Süre / Master" },
  { id: "layers", label: "Extra Oscillators", labelTr: "Ek Osilatörler" },
  { id: "modulators", label: "LFO Modulators", labelTr: "LFO Modülasyon" },
  { id: "textureFx", label: "Texture Processing", labelTr: "Doku İşleme" },
  { id: "postFx", label: "Post-Processing", labelTr: "Post-İşleme" },
];

export const SYNTH_PARAMETERS: ParamSpec[] = [
  {
    key: "volume",
    label: "Volume",
    labelTr: "Ses Seviyesi",
    group: "output",
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    unit: "gain",
    description: "Master output level before post-processing.",
    aiHint: "Louder impacts: 0.8–1.0. Subtle UI: 0.3–0.5.",
  },
  {
    key: "randomness",
    label: "Randomness",
    labelTr: "Rastgelelik",
    group: "output",
    min: 0,
    max: 0.3,
    step: 0.01,
    default: 0.05,
    description: "Random pitch variation on each play — organic feel.",
    aiHint: "0 for consistent UI. 0.05–0.15 for natural game SFX.",
  },
  {
    key: "frequency",
    label: "Frequency",
    labelTr: "Frekans",
    group: "oscillator",
    min: 40,
    max: 4000,
    step: 5,
    default: 220,
    unit: "Hz",
    description: "Base pitch. 440 = A4 reference.",
    aiHint: "Bass/explosion: 60–150. Mid UI: 400–900. Bright tick: 1000–2000.",
  },
  {
    key: "shape",
    label: "Wave Shape",
    labelTr: "Dalga Formu",
    group: "oscillator",
    min: 0,
    max: 5,
    step: 1,
    default: 0,
    description: "Oscillator waveform: 0=sine, 1=triangle, 2=saw, 3=tan, 4=noise, 5=square.",
    aiHint: "Use sine for clean UI, triangle/saw for arcade, noise for impacts.",
  },
  {
    key: "shapeCurve",
    label: "Shape Curve",
    labelTr: "Dalga Eğrisi",
    group: "oscillator",
    min: 0.1,
    max: 4,
    step: 0.1,
    default: 1,
    description: "Wave shaping intensity — higher = harsher harmonics.",
    aiHint: "1 = neutral. 2–3 for punchy hits. 0.5 for softer tones.",
  },
  {
    key: "noise",
    label: "Noise Mix",
    labelTr: "Gürültü Karışımı",
    group: "oscillator",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Blend noise into the oscillator — airy, gritty texture.",
    aiHint: "0.2–0.6 for explosions, footsteps, mechanical sounds.",
  },
  {
    key: "attack",
    label: "Attack",
    labelTr: "Attack",
    group: "envelope",
    min: 0,
    max: 0.5,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "Fade-in time — 0 = instant transient (click).",
    aiHint: "0 for snappy UI. 0.02–0.08 for soft pads. Keep low for game responsiveness.",
  },
  {
    key: "decay",
    label: "Decay",
    labelTr: "Decay",
    group: "envelope",
    min: 0,
    max: 0.5,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "Time to fall from peak to sustain level.",
    aiHint: "Short decay (0.01–0.05) for punchy hits. Longer for swelling sounds.",
  },
  {
    key: "sustain",
    label: "Sustain",
    labelTr: "Sustain",
    group: "envelope",
    min: 0,
    max: 0.8,
    step: 0.01,
    default: 0,
    unit: "s",
    description: "Hold duration at sustain volume before release.",
    aiHint: "Near 0 for one-shot SFX. 0.05–0.2 for engine/hum loops.",
  },
  {
    key: "sustainVolume",
    label: "Sustain Level",
    labelTr: "Sustain Seviyesi",
    group: "envelope",
    min: 0,
    max: 1,
    step: 0.05,
    default: 1,
    description: "Volume held during sustain phase (0–1).",
    aiHint: "0.3–0.6 for plucky sounds. 1.0 for full-body tones.",
  },
  {
    key: "release",
    label: "Release",
    labelTr: "Release",
    group: "envelope",
    min: 0,
    max: 1.5,
    step: 0.01,
    default: 0.1,
    unit: "s",
    description: "Fade-out tail after sustain.",
    aiHint: "0.03–0.08 for tight UI. 0.2–0.5 for cinematic tails.",
  },
  {
    key: "slide",
    label: "Pitch Slide",
    labelTr: "Perde Kayması",
    group: "pitch",
    min: -1,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Initial pitch glide direction — positive = rising, negative = falling.",
    aiHint: "+0.2–0.5 for jump/powerup swoosh. -0.2–0.4 for fall/damage.",
  },
  {
    key: "deltaSlide",
    label: "Slide Acceleration",
    labelTr: "Kayma İvmesi",
    group: "pitch",
    min: -0.5,
    max: 0.5,
    step: 0.01,
    default: 0,
    description: "Acceleration of pitch slide — curved pitch envelope.",
    aiHint: "Negative deltaSlide with positive slide = arc that falls back.",
  },
  {
    key: "pitchJump",
    label: "Pitch Jump",
    labelTr: "Perde Sıçraması",
    group: "pitch",
    min: -2,
    max: 2,
    step: 0.05,
    default: 0,
    description: "Sudden pitch offset after pitchJumpTime.",
    aiHint: "Use for two-tone effects: coin pickup, alert double-beep.",
  },
  {
    key: "pitchJumpTime",
    label: "Pitch Jump Time",
    labelTr: "Sıçrama Zamanı",
    group: "pitch",
    min: 0,
    max: 0.3,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "When the pitch jump triggers.",
    aiHint: "0.02–0.06 for quick two-note chirps.",
  },
  {
    key: "modulation",
    label: "Frequency Mod",
    labelTr: "Frekans Modülasyonu",
    group: "modulation",
    min: 0,
    max: 20,
    step: 0.5,
    default: 0,
    description: "Vibrato/FM depth — wobble or metallic timbre.",
    aiHint: "1–5 for subtle vibrato. 8+ for sci-fi laser wobble.",
  },
  {
    key: "tremolo",
    label: "Tremolo",
    labelTr: "Tremolo",
    group: "modulation",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Amplitude pulsing depth.",
    aiHint: "0.2–0.5 with repeatTime for machine-gun or alarm pulse.",
  },
  {
    key: "repeatTime",
    label: "Repeat Cycle",
    labelTr: "Tekrar Döngüsü",
    group: "modulation",
    min: 0,
    max: 0.2,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "Reset pitch/slide every N seconds — rhythmic loops.",
    aiHint: "0.03–0.08 for rapid stutter effects.",
  },
  {
    key: "filter",
    label: "Filter",
    labelTr: "Filtre",
    group: "filter",
    min: -1,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Biquad filter. Negative = low-pass (warm/dark). Positive = high-pass (thin/bright).",
    aiHint: "-0.1 to -0.4 for muffled underwater. +0.1 to +0.3 for thin telephone UI.",
  },
  {
    key: "bitCrush",
    label: "Bit Crush",
    labelTr: "Bit Crush",
    group: "texture",
    min: 0,
    max: 0.2,
    step: 0.005,
    default: 0,
    description: "Lo-fi digital degradation — retro grit.",
    aiHint: "0.02–0.08 for 8-bit aesthetic. 0 for clean modern.",
  },
  {
    key: "delay",
    label: "Echo Delay",
    labelTr: "Yankı Gecikmesi",
    group: "texture",
    min: 0,
    max: 0.3,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "Built-in single echo — doubles the sound with offset.",
    aiHint: "0.05–0.15 for cave/room feel before post-FX reverb.",
  },
];

export const FX_PARAMETERS: ParamSpec[] = [
  {
    key: "reverbMix",
    label: "Reverb Mix",
    labelTr: "Reverb Karışımı",
    group: "postFx",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Room/hall reverb wet level.",
    aiHint: "0.1–0.3 for subtle space. 0.4+ for large hall/explosion tail.",
  },
  {
    key: "reverbDecay",
    label: "Reverb Decay",
    labelTr: "Reverb Süresi",
    group: "postFx",
    min: 0.1,
    max: 3,
    step: 0.1,
    default: 0.8,
    unit: "s",
    description: "Reverb tail length.",
    aiHint: "0.3 for small room. 1.5+ for cathedral/canyon.",
  },
  {
    key: "delayTime",
    label: "Delay Time",
    labelTr: "Delay Süresi",
    group: "postFx",
    min: 0,
    max: 0.5,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "Stereo delay tap time.",
    aiHint: "0.08–0.15 for slapback. 0.2+ for rhythmic echo.",
  },
  {
    key: "delayMix",
    label: "Delay Mix",
    labelTr: "Delay Karışımı",
    group: "postFx",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Delayed signal blend.",
    aiHint: "Pair with delayTime. 0.2–0.4 for sci-fi laser trails.",
  },
  {
    key: "delayFeedback",
    label: "Delay Feedback",
    labelTr: "Delay Geri Besleme",
    group: "postFx",
    min: 0,
    max: 0.85,
    step: 0.05,
    default: 0.3,
    description: "Echo repeats decay — higher = more echoes.",
    aiHint: "0.2–0.5 for natural echo. 0.6+ for dub-style trails.",
  },
  {
    key: "eqLow",
    label: "EQ Low",
    labelTr: "EQ Bas",
    group: "postFx",
    min: -12,
    max: 12,
    step: 0.5,
    default: 0,
    unit: "dB",
    description: "Low shelf boost/cut (~200 Hz).",
    aiHint: "+3–6 dB for punchy explosions. -6 for thin UI ticks.",
  },
  {
    key: "eqMid",
    label: "EQ Mid",
    labelTr: "EQ Orta",
    group: "postFx",
    min: -12,
    max: 12,
    step: 0.5,
    default: 0,
    unit: "dB",
    description: "Mid band boost/cut (~1 kHz).",
    aiHint: "Cut mids for hollow retro. Boost for presence in mix.",
  },
  {
    key: "eqHigh",
    label: "EQ High",
    labelTr: "EQ Tiz",
    group: "postFx",
    min: -12,
    max: 12,
    step: 0.5,
    default: 0,
    unit: "dB",
    description: "High shelf boost/cut (~4 kHz).",
    aiHint: "+4–8 for bright sparkle UI. -6 for muffled/distant.",
  },
  {
    key: "compression",
    label: "Compression",
    labelTr: "Kompresyon",
    group: "postFx",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Dynamic range compression — louder perceived body.",
    aiHint: "0.3–0.6 to glue SFX in busy game mix.",
  },
  {
    key: "saturation",
    label: "Saturation",
    labelTr: "Saturasyon",
    group: "postFx",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Harmonic warmth / soft clipping.",
    aiHint: "0.1–0.3 for analog warmth. 0.5+ for aggressive distortion.",
  },
  {
    key: "stereoWidth",
    label: "Stereo Width",
    labelTr: "Stereo Genişlik",
    group: "postFx",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0,
    description: "Haas-effect width — 0 = mono, 1 = wide.",
    aiHint: "0.3–0.6 for whooshes. Keep 0 for centered UI clicks.",
  },
  {
    key: "limiter",
    label: "Limiter",
    labelTr: "Limiter",
    group: "postFx",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.8,
    description: "Output ceiling protection.",
    aiHint: "0.7–0.9 default. Lower if clipping on loud presets.",
  },
];

export const MASTER_PARAMETERS: ParamSpec[] = [
  {
    key: "duration",
    label: "Duration",
    labelTr: "Süre",
    group: "master",
    min: 0.01,
    max: 3,
    step: 0.01,
    default: 0,
    unit: "s",
    description: "Target total SFX length — scales ADSR to fit.",
    aiHint: "0.05 UI tick, 0.15 jump, 0.5 explosion, 1.0+ cinematic.",
  },
  {
    key: "durationScale",
    label: "Duration Scale",
    labelTr: "Süre Çarpanı",
    group: "master",
    min: 0.1,
    max: 5,
    step: 0.05,
    default: 1,
    description: "Manual ADSR multiplier when duration not set.",
    aiHint: "2 = double length. 0.5 = snappier.",
  },
  {
    key: "tail",
    label: "Tail Padding",
    labelTr: "Kuyruk",
    group: "master",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    unit: "s",
    description: "Silence padding after sound.",
    aiHint: "Use with reverb for tail room.",
  },
  {
    key: "fadeIn",
    label: "Fade In",
    labelTr: "Fade In",
    group: "master",
    min: 0,
    max: 0.5,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "Master fade-in on final mix.",
    aiHint: "0.01–0.03 for soft entrances.",
  },
  {
    key: "fadeOut",
    label: "Fade Out",
    labelTr: "Fade Out",
    group: "master",
    min: 0,
    max: 0.5,
    step: 0.005,
    default: 0,
    unit: "s",
    description: "Master fade-out on final mix.",
    aiHint: "0.05–0.2 for smooth endings.",
  },
];

export const TEXTURE_FX_PARAMETERS: ParamSpec[] = [
  { key: "chorus", label: "Chorus", labelTr: "Chorus", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Detuned doubling — thick, wide.", aiHint: "0.2–0.5 for lush pads." },
  { key: "phaser", label: "Phaser", labelTr: "Phaser", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Sweeping phase notch.", aiHint: "0.3–0.6 sci-fi, jet sounds." },
  { key: "crackle", label: "Crackle", labelTr: "Cızırtı", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Vinyl/static crackle.", aiHint: "0.1–0.3 lo-fi, radio." },
  { key: "subMix", label: "Sub Layer", labelTr: "Sub Katman", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Sub-harmonic oscillator blend.", aiHint: "0.3–0.6 for heavy impacts." },
  { key: "subOctave", label: "Sub Octave", labelTr: "Sub Oktav", group: "textureFx", min: 0.25, max: 1, step: 0.05, default: 0.5, description: "Sub oscillator pitch (0.5 = -1 octave).", aiHint: "0.5 default bass boost." },
  { key: "transient", label: "Transient", labelTr: "Transient", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Attack transient emphasis.", aiHint: "0.4–0.8 punchy drums/hits." },
  { key: "flutter", label: "Flutter", labelTr: "Flutter", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Fast pitch flutter/warble.", aiHint: "0.2–0.4 broken machine." },
  { key: "gate", label: "Noise Gate", labelTr: "Gate", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Cut quiet tail noise.", aiHint: "0.2–0.4 clean tight SFX." },
  { key: "grain", label: "Grain", labelTr: "Grain", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Granular amplitude scatter.", aiHint: "0.3–0.6 glitch texture." },
  { key: "ringMod", label: "Ring Mod", labelTr: "Ring Mod", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Ring modulation — metallic.", aiHint: "0.3–0.7 robot, bell sounds." },
  { key: "wow", label: "Tape Wow", labelTr: "Tape Wow", group: "textureFx", min: 0, max: 1, step: 0.05, default: 0, description: "Slow tape pitch wobble.", aiHint: "0.2–0.4 vintage, underwater." },
];

export interface LayerParamSpecs {
  /** Layer root fields — map to oscillators[i].mix / .detune / .delay */
  root: ParamSpec[];
  /** Synth overrides — map to oscillators[i].params.{key} */
  params: ParamSpec[];
}

/** Per-layer oscillator controls (OSC 2–4). Root vs params matches OscillatorLayer type. */
export function getLayerParamSpecs(index: number): LayerParamSpecs {
  const n = index + 2;
  return {
    root: [
      { key: "mix", label: `OSC${n} Mix`, labelTr: `OSC${n} Mix`, group: "layers", min: 0, max: 1, step: 0.05, default: 0.5, description: `Layer ${n} blend.`, aiHint: "0.3–0.7 for detuned richness." },
      { key: "detune", label: `OSC${n} Detune`, labelTr: `OSC${n} Detune`, group: "layers", min: -24, max: 24, step: 1, default: 0, unit: "st", description: `Layer ${n} semitone offset.`, aiHint: "+7/+12 harmonics. -12 sub." },
      { key: "delay", label: `OSC${n} Delay`, labelTr: `OSC${n} Gecikme`, group: "layers", min: 0, max: 0.2, step: 0.005, default: 0, unit: "s", description: `Layer ${n} start offset.`, aiHint: "0.01–0.05 flam/double-hit." },
    ],
    params: [
      { key: "frequency", label: `OSC${n} Freq`, labelTr: `OSC${n} Frekans`, group: "layers", min: 40, max: 4000, step: 10, default: 220, unit: "Hz", description: `Layer ${n} frequency override (oscillators[].params.frequency).`, aiHint: "Set in params subobject. Or use detune for semitone shift." },
      { key: "shape", label: `OSC${n} Shape`, labelTr: `OSC${n} Dalga`, group: "layers", min: 0, max: 5, step: 1, default: 0, description: `Layer ${n} wave shape (oscillators[].params.shape).`, aiHint: "e.g. { params: { shape: 2 } } for saw layer." },
      { key: "noise", label: `OSC${n} Noise`, labelTr: `OSC${n} Noise`, group: "layers", min: 0, max: 1, step: 0.05, default: 0, description: `Layer ${n} noise mix (oscillators[].params.noise).`, aiHint: "0.2–0.4 adds grit to layer." },
    ],
  };
}

export function getModulatorParamSpecs(index: number): ParamSpec[] {
  const n = index + 1;
  return [
    { key: "rate", label: `LFO${n} Rate`, labelTr: `LFO${n} Hız`, group: "modulators", min: 0.1, max: 30, step: 0.1, default: 4, unit: "Hz", description: `LFO ${n} speed.`, aiHint: "0.5–2 slow sweep. 8–20 vibrato." },
    { key: "depth", label: `LFO${n} Depth`, labelTr: `LFO${n} Derinlik`, group: "modulators", min: 0, max: 1, step: 0.05, default: 0, description: `LFO ${n} intensity.`, aiHint: "0.2–0.5 subtle. 0.7+ extreme." },
    { key: "shape", label: `LFO${n} Shape`, labelTr: `LFO${n} Form`, group: "modulators", min: 0, max: 2, step: 1, default: 0, description: "0=sine, 1=triangle, 2=square.", aiHint: "Sine=smooth, square=choppy." },
    { key: "phase", label: `LFO${n} Phase`, labelTr: `LFO${n} Faz`, group: "modulators", min: 0, max: 1, step: 0.05, default: 0, description: "LFO start phase.", aiHint: "Offset for layered LFOs." },
  ];
}

export const MODULATOR_TARGETS = [
  { value: "amplitude", label: "Amplitude", labelTr: "Genlik" },
  { value: "pitch", label: "Pitch", labelTr: "Perde" },
  { value: "filter", label: "Filter", labelTr: "Filtre" },
] as const;

export const ALL_PARAMETERS = [
  ...SYNTH_PARAMETERS,
  ...MASTER_PARAMETERS,
  ...TEXTURE_FX_PARAMETERS,
  ...FX_PARAMETERS,
];

export function getParameterSchema(): {
  groups: typeof PARAM_GROUPS;
  waveShapes: typeof WAVE_SHAPES;
  modulatorTargets: typeof MODULATOR_TARGETS;
  synth: ParamSpec[];
  master: ParamSpec[];
  textureFx: ParamSpec[];
  postFx: ParamSpec[];
  oscillatorLayers: {
    osc2: LayerParamSpecs;
    osc3: LayerParamSpecs;
    osc4: LayerParamSpecs;
    structure: string;
  };
  modulators: { lfo1: ParamSpec[]; lfo2: ParamSpec[]; lfo3: ParamSpec[]; lfo4: ParamSpec[] };
  totalParams: number;
} {
  return {
    groups: PARAM_GROUPS,
    waveShapes: WAVE_SHAPES,
    modulatorTargets: MODULATOR_TARGETS,
    synth: SYNTH_PARAMETERS,
    master: MASTER_PARAMETERS,
    textureFx: TEXTURE_FX_PARAMETERS,
    postFx: FX_PARAMETERS,
    oscillatorLayers: {
      osc2: getLayerParamSpecs(0),
      osc3: getLayerParamSpecs(1),
      osc4: getLayerParamSpecs(2),
      structure:
        "oscillators[{ enabled, mix, detune, delay, params: { frequency, shape, noise, ... } }]",
    },
    modulators: {
      lfo1: getModulatorParamSpecs(0),
      lfo2: getModulatorParamSpecs(1),
      lfo3: getModulatorParamSpecs(2),
      lfo4: getModulatorParamSpecs(3),
    },
    totalParams: ALL_PARAMETERS.length + 9 + 9 + 16,
  };
}

export function listParametersByGroup(group: ParamGroup): ParamSpec[] {
  return ALL_PARAMETERS.filter((p) => p.group === group);
}

/** AI-facing design profiles — starting points for common sound design goals. */
export const DESIGN_PROFILES = [
  {
    id: "bright-ui-tick",
    name: "Bright UI Tick",
    nameTr: "Parlak UI Tık",
    tags: ["ui", "click", "bright", "tiz"],
    params: { frequency: 1200, shape: 0, release: 0.025, volume: 0.4, filter: 0.15 } satisfies SoundParams,
    fx: { eqHigh: 4, reverbMix: 0.05 } satisfies FxParams,
  },
  {
    id: "muffled-distant",
    name: "Muffled Distant",
    nameTr: "Uzak/Soluk",
    tags: ["distant", "underwater", "muffled", "uzak"],
    params: { filter: -0.35, frequency: 200, release: 0.3, noise: 0.1 } satisfies SoundParams,
    fx: { eqLow: 3, eqHigh: -8, reverbMix: 0.45, reverbDecay: 1.2 } satisfies FxParams,
  },
  {
    id: "punchy-impact",
    name: "Punchy Impact",
    nameTr: "Güçlü Darbe",
    tags: ["hit", "punch", "impact", "darbe"],
    params: { frequency: 90, shape: 3, attack: 0, decay: 0.02, release: 0.08, sustainVolume: 0.5, noise: 0.25 } satisfies SoundParams,
    fx: { compression: 0.5, eqLow: 5, saturation: 0.2 } satisfies FxParams,
  },
  {
    id: "retro-8bit",
    name: "Retro 8-bit",
    nameTr: "Retro 8-bit",
    tags: ["8bit", "chiptune", "retro", "arcade"],
    params: { shape: 5, frequency: 440, bitCrush: 0.05, release: 0.06 } satisfies SoundParams,
    fx: { saturation: 0.15, eqMid: -3 } satisfies FxParams,
  },
  {
    id: "sci-fi-laser",
    name: "Sci-fi Laser",
    nameTr: "Bilim Kurgu Lazer",
    tags: ["laser", "sci-fi", "lazer", "beam"],
    params: { frequency: 600, shape: 2, slide: -0.4, modulation: 12, release: 0.15 } satisfies SoundParams,
    fx: { delayTime: 0.12, delayMix: 0.35, delayFeedback: 0.4, stereoWidth: 0.5 } satisfies FxParams,
  },
  {
    id: "cinematic-boom",
    name: "Cinematic Boom",
    nameTr: "Sinematik Patlama",
    tags: ["boom", "cinematic", "explosion", "patlama"],
    params: { frequency: 55, shape: 4, noise: 0.7, release: 0.6, slide: -0.3, sustain: 0.05 } satisfies SoundParams,
    fx: { reverbMix: 0.5, reverbDecay: 2, eqLow: 8, compression: 0.6, saturation: 0.25 } satisfies FxParams,
  },
  {
    id: "soft-notification",
    name: "Soft Notification",
    nameTr: "Yumuşak Bildirim",
    tags: ["notification", "soft", "gentle", "bildirim"],
    params: { frequency: 660, shape: 0, attack: 0.01, release: 0.12, volume: 0.45 } satisfies SoundParams,
    fx: { reverbMix: 0.15, eqHigh: 2 } satisfies FxParams,
  },
  {
    id: "mechanical-click",
    name: "Mechanical Click",
    nameTr: "Mekanik Tık",
    tags: ["mechanical", "switch", "keyboard", "mekanik"],
    params: { frequency: 800, shape: 1, release: 0.02, noise: 0.08, bitCrush: 0.02 } satisfies SoundParams,
    fx: { compression: 0.4, eqMid: 2 } satisfies FxParams,
  },
] as const;