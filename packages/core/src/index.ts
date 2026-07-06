export {
  defineSound,
  toCodeSnippet,
  toConfigSnippet,
  paramsToZzfxArray,
} from "./define.js";
export { envelopeLength, resolveDurationScale, scaleParamsDuration } from "./duration.js";
export { synthesizeLayers } from "./layers.js";
export { applyModulators } from "./modulation.js";
export { applyTexture } from "./texture.js";
export { modify, modifyFx, applyModifiers } from "./modify.js";
export {
  buildSoundConfig,
  GAME_PACK_DESIGNS,
  resolveDesignProfile,
  resolveModifiers,
  type SoundDesignInput,
} from "./config-builder.js";
export {
  presets,
  presetCatalog,
  getPreset,
  listPresets,
  findPresetsByTag,
  type PresetId,
} from "./presets.js";
export {
  ALL_PARAMETERS,
  DESIGN_PROFILES,
  FX_PARAMETERS,
  MASTER_PARAMETERS,
  MODULATOR_TARGETS,
  PARAM_GROUPS,
  SYNTH_PARAMETERS,
  TEXTURE_FX_PARAMETERS,
  WAVE_SHAPES,
  getLayerParamSpecs,
  getModulatorParamSpecs,
  getParameterSchema,
  listParametersByGroup,
  type LayerParamSpecs,
  type ParamGroup,
  type ParamSpec,
} from "./parameters.js";
export { applyFx, applyFxStereo, computeFxTailSamples } from "./fx.js";
export { buildSamples, synthesize } from "./synth.js";
export {
  SFX_CATEGORIES,
  PRESET_CATEGORY_MAP,
  getCategorySpec,
  getPresetCategory,
  getTargetLufs,
  type CategorySpec,
  type SfxCategory,
} from "./categories.js";
export {
  createSeededRng,
  applyVariation,
} from "./variation.js";
export {
  measureLufs,
  measureTruePeak,
  computeLoudnessGain,
  applyLoudnessGain,
  applyTruePeakLimit,
  normalizeLoudness,
  normalizeLoudnessStereo,
  mixDownMono,
  isWithinLoudnessTarget,
  LOUDNESS_TOLERANCE_LUFS,
  MAX_LOUDNESS_PASSES,
} from "./loudness.js";
export {
  isSoundConfig,
  normalizeConfig,
  synthesizeDry,
  synthesizeFull,
  renderSound,
  renderVariant,
  renderSamples,
  renderMasteredBuffer,
  LOUDNESS_TOLERANCE_LUFS as RENDER_LOUDNESS_TOLERANCE,
  type RenderOptions,
  type MasteredBuffer,
} from "./render.js";
export {
  DEFAULT_FX_PARAMS,
  DEFAULT_MASTER_PARAMS,
  DEFAULT_MODULATOR,
  DEFAULT_SOUND_PARAMS,
  DEFAULT_TEXTURE_PARAMS,
  MASTER_VOLUME,
  SAMPLE_RATE,
  type FxParams,
  type MasterParams,
  type ModulatorConfig,
  type ModulatorShape,
  type ModulatorTarget,
  type OscillatorLayer,
  type SoundConfig,
  type SoundDefinition,
  type SoundModifiers,
  type SoundParams,
  type TextureParams,
  type PresetMeta,
} from "./types.js";
export type { SfxCategory as SoundCategory } from "./types.js";
export { encodeWav, encodeWavStereo } from "./wav.js";

/** @deprecated Use renderSound */
export { renderSound as renderWav } from "./render.js";