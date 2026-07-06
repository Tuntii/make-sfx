import {
  DEFAULT_SOUND_PARAMS,
  MASTER_VOLUME,
  SAMPLE_RATE,
  type SoundParams,
} from "./types.js";

/** Vendored from ZzFX v1.3.2 — offline sample generation without AudioContext. */
export function buildSamples(params: SoundParams = {}): Float32Array {
  const p = { ...DEFAULT_SOUND_PARAMS, ...params };

  let volume = p.volume;
  let randomness = p.randomness;
  let frequency = p.frequency;
  let attack = p.attack;
  let sustain = p.sustain;
  let release = p.release;
  const shape = p.shape;
  const shapeCurve = p.shapeCurve;
  let slide = p.slide;
  let deltaSlide = p.deltaSlide;
  let pitchJump = p.pitchJump;
  let pitchJumpTime = p.pitchJumpTime;
  let repeatTime = p.repeatTime;
  const noise = p.noise;
  const modulation = p.modulation;
  const bitCrush = p.bitCrush;
  const delay = p.delay;
  const sustainVolume = p.sustainVolume;
  let decay = p.decay;
  const tremolo = p.tremolo;
  const filter = p.filter;

  const sampleRate = SAMPLE_RATE;
  const PI2 = Math.PI * 2;
  const abs = Math.abs;
  const sign = (v: number) => (v < 0 ? -1 : 1);

  let startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate);
  let startFrequency = (frequency *=
    (1 + randomness * 2 * Math.random() - randomness) * PI2) / sampleRate;

  let modOffset = 0;
  let repeat = 0;
  let crush = 0;
  let jump = 1;
  let length: number;
  let t = 0;
  let i = 0;
  let s = 0;
  let f: number;

  const quality = 2;
  const w = (PI2 * abs(filter) * 2) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x2 = 0;
  let x1 = 0;
  let y2 = 0;
  let y1 = 0;

  const minAttack = 9;
  attack = attack * sampleRate || minAttack;
  decay *= sampleRate;
  sustain *= sampleRate;
  release *= sampleRate;
  const delaySamples = delay * sampleRate;
  deltaSlide *= (500 * PI2) / sampleRate ** 3;
  const modStep = (modulation * PI2) / sampleRate;
  pitchJump = (pitchJump * PI2) / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = (repeatTime * sampleRate) | 0;
  volume *= MASTER_VOLUME;

  length = (attack + decay + sustain + release + delaySamples) | 0;
  const samples = new Float32Array(length);

  for (i = 0; i < length; i++) {
    const crushMod = (bitCrush * 100) | 0;
    if (!crushMod || !(++crush % crushMod)) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? (t / PI2) % 1 < shapeCurve / 2
                  ? 1
                  : -1
                : Math.sin(t ** 3)
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (((2 * t) / PI2) % 2 + 2) % 2
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);

      s =
        (repeatTime
          ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime)
          : 1) *
        (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delaySamples
                ? ((length - i - delaySamples) / release) * sustainVolume
                : 0);

      if (delaySamples) {
        s =
          s / 2 +
          (delaySamples > i
            ? 0
            : (i < length - delaySamples
                ? 1
                : (length - i) / delaySamples) *
              (samples[i - delaySamples | 0] / 2 / volume));
      }

      if (filter) {
        s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
      }
    }

    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * Math.sin(i ** 5);

    if (pitchJump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }

    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump ||= 1;
    }

    samples[i] = s * volume;
  }

  return samples;
}

export function synthesize(params: SoundParams): Float32Array {
  return buildSamples(params);
}