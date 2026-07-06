import { applyMasterEnvelope } from "./duration.js";
import { applyFx, applyFxStereo } from "./fx.js";
import { synthesizeLayers } from "./layers.js";
import { applyModulators } from "./modulation.js";
import { applyTexture } from "./texture.js";
import {
  DEFAULT_FX_PARAMS,
  DEFAULT_MASTER_PARAMS,
  DEFAULT_TEXTURE_PARAMS,
  type SoundConfig,
  type SoundParams,
} from "./types.js";
import { encodeWav, encodeWavStereo } from "./wav.js";

export function isSoundConfig(
  input: SoundParams | SoundConfig,
): input is SoundConfig {
  return "params" in input && typeof input.params === "object";
}

export function normalizeConfig(
  input: SoundParams | SoundConfig,
): Required<Pick<SoundConfig, "params">> & SoundConfig {
  if (isSoundConfig(input)) {
    return {
      params: input.params,
      fx: input.fx ? { ...DEFAULT_FX_PARAMS, ...input.fx } : undefined,
      master: input.master
        ? { ...DEFAULT_MASTER_PARAMS, ...input.master }
        : undefined,
      oscillators: input.oscillators,
      modulators: input.modulators,
      texture: input.texture
        ? { ...DEFAULT_TEXTURE_PARAMS, ...input.texture }
        : undefined,
    };
  }
  return { params: input };
}

export function synthesizeDry(config: SoundParams | SoundConfig): Float32Array {
  const cfg = normalizeConfig(config);

  let dry = synthesizeLayers(cfg.params, cfg.oscillators, cfg.master);
  dry = applyModulators(dry, cfg.modulators);
  dry = applyTexture(dry, cfg.texture);
  return applyMasterEnvelope(dry, cfg.master);
}

export function synthesizeFull(config: SoundParams | SoundConfig): Float32Array {
  const cfg = normalizeConfig(config);
  const dry = synthesizeDry(cfg);
  return cfg.fx ? applyFx(dry, cfg.fx) : dry;
}

export function renderSound(config: SoundParams | SoundConfig): Uint8Array {
  const cfg = normalizeConfig(config);
  const f = { ...DEFAULT_FX_PARAMS, ...cfg.fx };

  if (f.stereoWidth > 0) {
    const { left, right } = applyFxStereo(synthesizeDry(cfg), f);
    return encodeWavStereo(left, right);
  }

  return encodeWav(synthesizeFull(cfg));
}