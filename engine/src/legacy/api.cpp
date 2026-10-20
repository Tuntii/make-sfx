#include "legacy/api.hpp"

#include <algorithm>
#include <cmath>
#include <string>

namespace makesfx::legacy {
namespace {

// Longest render accepted. 1.x sounds are short one-shots; the bound keeps
// generated input (an AI typo like "sustain": 100000) from allocating gigabytes.
constexpr double kMaxRenderSeconds = 120.0;

double orDefault(const Opt& v, double fallback) { return v ? *v : fallback; }

// buildSamples() length in seconds for already-scaled params.
double zzfxSeconds(const SoundParams& scaled) {
  const SoundParams p = withDefaults(scaled);
  return std::max(0.0, *p.attack) + std::max(0.0, *p.decay) + std::max(0.0, *p.sustain) +
         std::max(0.0, *p.release) + std::max(0.0, *p.delay);
}

// Upper bound of the rendered length in seconds, before seed variation (which
// changes durations by at most 12%; the caller leaves room for that).
double predictSeconds(const SoundConfig& cfg) {
  double seconds = 0.0;
  if (cfg.voice) {
    seconds = voiceLength(fitVoiceDuration(*cfg.voice, cfg.master));
  } else {
    // Same scaling as synthesizeLayers(): the base once, each layer again on top.
    const SoundParams base = scaleParamsDuration(cfg.params, cfg.master);
    seconds = zzfxSeconds(base);
    for (const OscillatorLayer& layer : cfg.oscillators.value_or(std::vector<OscillatorLayer>{})) {
      const SoundParams merged = layer.params ? merge(base, *layer.params) : base;
      seconds = std::max(seconds, std::max(0.0, orDefault(layer.delay, 0.0)) +
                                      zzfxSeconds(scaleParamsDuration(merged, cfg.master)));
    }
  }
  if (cfg.master) seconds += std::max(0.0, orDefault(cfg.master->tail, 0.0));
  if (cfg.fx) {
    const FxParams f = withDefaults(*cfg.fx);
    if (*f.delayMix > 0.0 && *f.delayTime > 0.0) seconds += 4.0 * *f.delayTime;
    if (*f.reverbMix > 0.0) seconds += std::min(std::max(0.0, *f.reverbDecay), seconds * 3.0);
  }
  return seconds;
}

}  // namespace

Diagnostics checkRenderLength(const SoundConfig& config) {
  const double predicted = predictSeconds(config);
  if (std::isfinite(predicted) && predicted * 1.15 <= kMaxRenderSeconds) return {};
  return {Diagnostic{Severity::Error, "E_TOO_LONG", "",
                     "sound would render for about " + std::to_string(static_cast<long long>(predicted)) + " s",
                     "keep envelope, delay and tail times under " +
                         std::to_string(static_cast<int>(kMaxRenderSeconds / 1.15)) + " s in total"}};
}

Result<RenderedAudio> renderJson(std::string_view configJson, std::string_view optionsJson) {
  auto config = parseSoundConfig(configJson);
  auto options = parseRenderOptions(optionsJson);
  if (!config || !options) {
    Diagnostics all = config.diagnostics();
    for (Diagnostic d : options.diagnostics()) {
      d.path = "options:" + d.path;
      all.push_back(std::move(d));
    }
    return Result<RenderedAudio>::failure(std::move(all));
  }

  if (Diagnostics tooLong = checkRenderLength(config.value()); !tooLong.empty()) {
    return Result<RenderedAudio>::failure(std::move(tooLong));
  }

  MasteredBuffer mastered = renderMasteredBuffer(config.value(), options.value());
  RenderedAudio audio;
  audio.sampleRate = options.value().sampleRate;
  if (mastered.category) audio.category = toString(*mastered.category);
  if (mastered.stereo) {
    audio.channels.push_back(std::move(mastered.left));
    audio.channels.push_back(std::move(mastered.right));
  } else {
    audio.channels.push_back(std::move(mastered.mono));
  }
  return Result<RenderedAudio>::success(std::move(audio), config.diagnostics());
}

}  // namespace makesfx::legacy
