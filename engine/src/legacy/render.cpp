#include "legacy/js.hpp"
#include "legacy/legacy.hpp"

// Port of render.ts: config normalization, seed variation, dry synthesis,
// post-FX and category loudness mastering.

namespace makesfx::legacy {
namespace {

// normalizeConfig(): fills defaults into the fx/master/texture blocks that are present.
SoundConfig normalizeConfig(const SoundConfig& in) {
  SoundConfig c = in;
  if (c.fx) c.fx = withDefaults(*c.fx);
  if (c.master) c.master = withDefaults(*c.master);
  if (c.texture) c.texture = withDefaults(*c.texture);
  return c;
}

std::vector<float> synthesizeDry(const SoundConfig& cfgIn, Mulberry32& random, double sr) {
  const SoundConfig cfg = normalizeConfig(cfgIn);
  std::vector<float> dry =
      cfg.voice ? synthesizeVoice(fitVoiceDuration(*cfg.voice, cfg.master), random, sr)
                : synthesizeLayers(cfg.params, cfg.oscillators.value_or(std::vector<OscillatorLayer>{}), cfg.master,
                                   random, sr);
  dry = applyModulators(std::move(dry), cfg.modulators.value_or(std::vector<ModulatorConfig>{}), sr);
  dry = applyTexture(std::move(dry), cfg.texture, random, sr);
  return applyMasterEnvelope(std::move(dry), cfg.master, sr);
}

}  // namespace

MasteredBuffer renderMasteredBuffer(const SoundConfig& config, const RenderOptions& options) {
  const double sr = options.sampleRate;
  SoundConfig cfg = normalizeConfig(config);
  const Opt seed = options.seed ? options.seed : cfg.seed;
  if (seed) cfg = applyVariation(cfg, js::toUint32(*seed));

  std::optional<Category> category = options.category ? options.category : cfg.category;
  if (!category && options.presetId) category = presetCategory(*options.presetId);
  const bool normalize = options.normalize.value_or(category.has_value());
  const FxParams f = withDefaults(cfg.fx.value_or(FxParams{}));

  // `seed ^ 0x9e3779b9` in TS; unseeded renders use seed 0 (see rng.hpp).
  Mulberry32 random = drySynthRng(seed ? js::toUint32(*seed) : 0u);

  MasteredBuffer out;
  out.category = category;
  if (*f.stereoWidth > 0.0) {
    applyFxStereo(synthesizeDry(cfg, random, sr), f, sr, out.left, out.right);
    if (normalize && category) normalizeLoudnessStereo(out.left, out.right, *category, sr);
    out.mono = mixDownMono(out.left, out.right);
    out.stereo = true;
    return out;
  }

  std::vector<float> dry = synthesizeDry(cfg, random, sr);
  out.mono = cfg.fx ? applyFx(dry, f, sr) : std::move(dry);
  if (normalize && category) out.mono = normalizeLoudness(out.mono, *category, sr);
  return out;
}

}  // namespace makesfx::legacy
