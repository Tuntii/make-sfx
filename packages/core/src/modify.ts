import { type FxParams, type SoundModifiers, type SoundParams } from "./types.js";

export function modify(
  params: SoundParams,
  modifiers: SoundModifiers = {},
): SoundParams {
  const result: SoundParams = { ...params };
  const scale = modifiers.durationScale ?? 1;

  if (modifiers.pitchShift !== undefined) {
    const base = params.frequency ?? 220;
    result.frequency = base * modifiers.pitchShift;
  }

  if (modifiers.volume !== undefined) {
    result.volume = modifiers.volume;
  }

  if (modifiers.randomness !== undefined) {
    result.randomness = modifiers.randomness;
  }

  if (modifiers.brightness !== undefined) {
    const b = modifiers.brightness;
    result.frequency = (result.frequency ?? 220) * (1 + b * 0.5);
    result.filter = (result.filter ?? 0) + b * 0.2;
    result.shapeCurve = (result.shapeCurve ?? 1) * (1 + b * 0.15);
  }

  if (modifiers.warmth !== undefined) {
    const w = modifiers.warmth;
    result.filter = (result.filter ?? 0) - w * 0.35;
    result.frequency = (result.frequency ?? 220) * (1 - w * 0.15);
    result.noise = Math.max(0, (result.noise ?? 0) - w * 0.1);
  }

  if (modifiers.punch !== undefined) {
    const p = modifiers.punch;
    result.attack = Math.max(0, (result.attack ?? 0) * (1 - p * 0.8));
    result.decay = (result.decay ?? 0) + p * 0.03;
    result.sustainVolume = Math.min(1, (result.sustainVolume ?? 1) * (1 + p * 0.2));
    result.shapeCurve = (result.shapeCurve ?? 1) * (1 + p * 0.25);
  }

  if (modifiers.grit !== undefined) {
    const g = modifiers.grit;
    result.noise = Math.min(1, (result.noise ?? 0) + g * 0.4);
    result.bitCrush = Math.min(0.2, (result.bitCrush ?? 0) + g * 0.06);
    result.shape = result.shape === 0 ? 3 : result.shape;
  }

  if (scale !== 1) {
    if (params.attack !== undefined) result.attack = params.attack * scale;
    if (params.sustain !== undefined) result.sustain = params.sustain * scale;
    if (params.release !== undefined) result.release = params.release * scale;
    if (params.decay !== undefined) result.decay = params.decay * scale;
  }

  return result;
}

export function modifyFx(
  fx: FxParams,
  modifiers: Pick<SoundModifiers, "space" | "brightness" | "warmth" | "punch" | "grit"> = {},
): FxParams {
  const result: FxParams = { ...fx };

  if (modifiers.space !== undefined) {
    const s = modifiers.space;
    result.reverbMix = Math.min(1, (result.reverbMix ?? 0) + s * 0.4);
    result.delayMix = Math.min(1, (result.delayMix ?? 0) + s * 0.25);
    result.delayTime = (result.delayTime ?? 0) + s * 0.08;
    result.reverbDecay = (result.reverbDecay ?? 0.8) + s * 0.5;
  }

  if (modifiers.brightness !== undefined) {
    result.eqHigh = (result.eqHigh ?? 0) + modifiers.brightness * 6;
    result.eqLow = (result.eqLow ?? 0) - modifiers.brightness * 2;
  }

  if (modifiers.warmth !== undefined) {
    result.eqLow = (result.eqLow ?? 0) + modifiers.warmth * 4;
    result.eqHigh = (result.eqHigh ?? 0) - modifiers.warmth * 4;
    result.saturation = Math.min(1, (result.saturation ?? 0) + modifiers.warmth * 0.15);
  }

  if (modifiers.punch !== undefined) {
    result.compression = Math.min(1, (result.compression ?? 0) + modifiers.punch * 0.45);
    result.eqLow = (result.eqLow ?? 0) + modifiers.punch * 3;
  }

  if (modifiers.grit !== undefined) {
    result.saturation = Math.min(1, (result.saturation ?? 0) + modifiers.grit * 0.35);
    result.eqMid = (result.eqMid ?? 0) + modifiers.grit * 2;
  }

  return result;
}

const FX_MODIFIER_KEYS = ["space", "brightness", "warmth", "punch", "grit"] as const;

function hasFxModifiers(modifiers: SoundModifiers): boolean {
  return FX_MODIFIER_KEYS.some((k) => modifiers[k] !== undefined);
}

function mergeFxParams(base?: FxParams, patch?: FxParams): FxParams | undefined {
  const merged = { ...base, ...patch };
  const keys = Object.keys(merged) as (keyof FxParams)[];
  if (keys.length === 0) return undefined;
  const out: FxParams = {};
  for (const k of keys) {
    const v = merged[k];
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function applyModifiers(
  config: { params: SoundParams; fx?: FxParams },
  modifiers: SoundModifiers = {},
): { params: SoundParams; fx?: FxParams } {
  const params = modify(config.params, modifiers);

  if (!hasFxModifiers(modifiers)) {
    return config.fx ? { params, fx: config.fx } : { params };
  }

  const fx = modifyFx(config.fx ?? {}, modifiers);
  return mergeFxParams(undefined, fx) ? { params, fx } : { params };
}