#include <algorithm>
#include <cmath>

#include "legacy/js.hpp"
#include "legacy/legacy.hpp"
#include "math/dmath.hpp"

// Ports of duration.ts, layers.ts, modulation.ts and texture.ts.

namespace makesfx::legacy {
namespace {

using js::rd;
using js::wr;

double orDefault(const Opt& v, double fallback) { return v ? *v : fallback; }

}  // namespace

// ── duration.ts ─────────────────────────────────────────────────────────────

double envelopeLength(const SoundParams& p) {
  return orDefault(p.attack, 0.0) + orDefault(p.decay, 0.0) + orDefault(p.sustain, 0.0) +
         orDefault(p.release, 0.1);
}

double resolveDurationScale(const SoundParams& p, const std::optional<MasterParams>& master) {
  if (!master) return 1.0;
  if (master->duration && js::truthy(*master->duration) && *master->duration > 0.0) {
    const double natural = envelopeLength(p);
    return natural > 0.0 ? *master->duration / natural : 1.0;
  }
  return orDefault(master->durationScale, 1.0);
}

SoundParams scaleParamsDuration(const SoundParams& p, const std::optional<MasterParams>& master) {
  const double scale = resolveDurationScale(p, master);
  if (scale == 1.0) return p;
  SoundParams r = p;
  r.attack = orDefault(p.attack, 0.0) * scale;
  r.decay = orDefault(p.decay, 0.0) * scale;
  r.sustain = orDefault(p.sustain, 0.0) * scale;
  r.release = orDefault(p.release, 0.0) * scale;
  r.pitchJumpTime = orDefault(p.pitchJumpTime, 0.0) * scale;
  r.repeatTime = orDefault(p.repeatTime, 0.0) * scale;
  r.delay = orDefault(p.delay, 0.0) * scale;
  return r;
}

std::vector<float> applyMasterEnvelope(std::vector<float> samples, const std::optional<MasterParams>& master,
                                       double sr) {
  if (!master) return samples;
  const auto tail = static_cast<std::size_t>(std::max(0.0, std::floor(orDefault(master->tail, 0.0) * sr)));
  const double fadeIn = std::floor(orDefault(master->fadeIn, 0.0) * sr);
  const double fadeOut = std::floor(orDefault(master->fadeOut, 0.0) * sr);
  if (tail == 0 && !(fadeIn > 0.0) && !(fadeOut > 0.0)) return samples;

  samples.resize(samples.size() + tail, 0.0f);
  const double len = static_cast<double>(samples.size());
  if (fadeIn > 0.0) {
    const double end = std::min(fadeIn, len);
    for (std::size_t i = 0; static_cast<double>(i) < end; ++i) {
      samples[i] = wr(rd(samples[i]) * (static_cast<double>(i) / fadeIn));
    }
  }
  if (fadeOut > 0.0) {
    const double start = std::max(0.0, len - fadeOut);
    for (auto i = static_cast<std::size_t>(start); i < samples.size(); ++i) {
      samples[i] = wr(rd(samples[i]) * ((len - static_cast<double>(i)) / fadeOut));
    }
  }
  return samples;
}

// ── layers.ts ───────────────────────────────────────────────────────────────

std::vector<float> synthesizeLayers(const SoundParams& baseParams, const std::vector<OscillatorLayer>& layers,
                                    const std::optional<MasterParams>& master, Mulberry32& random, double sr) {
  const SoundParams scaledBase = scaleParamsDuration(baseParams, master);
  std::vector<const OscillatorLayer*> active;
  for (const OscillatorLayer& l : layers) {
    if (!(l.enabled && !*l.enabled)) active.push_back(&l);
  }
  if (active.empty()) return buildSamples(scaledBase, random, sr);

  struct Voice {
    std::vector<float> samples;
    double mix;
    std::size_t offset;
  };
  std::vector<Voice> voices;
  voices.push_back({buildSamples(scaledBase, random, sr), 1.0, 0});

  for (const OscillatorLayer* layer : active) {
    SoundParams merged = layer->params ? merge(scaledBase, *layer->params) : scaledBase;
    if (layer->detune && js::truthy(*layer->detune)) {
      merged.frequency = orDefault(merged.frequency, 220.0) * dmath::pow(2.0, *layer->detune / 12.0);
    }
    const SoundParams p = scaleParamsDuration(merged, master);
    const double offset = std::floor(orDefault(layer->delay, 0.0) * sr);
    voices.push_back({buildSamples(p, random, sr), orDefault(layer->mix, 0.5),
                      offset > 0.0 ? static_cast<std::size_t>(offset) : 0});
  }

  double totalMix = 0.0;
  for (const Voice& v : voices) totalMix += v.mix;
  totalMix = js::orElse(totalMix, 1.0);
  std::size_t maxLen = 0;
  for (const Voice& v : voices) maxLen = std::max(maxLen, v.offset + v.samples.size());

  std::vector<float> out(maxLen, 0.0f);
  for (const Voice& v : voices) {
    for (std::size_t i = 0; i < v.samples.size(); ++i) {
      float& o = out[i + v.offset];
      o = wr(rd(o) + (rd(v.samples[i]) * v.mix) / totalMix);
    }
  }
  return out;
}

// ── modulation.ts ───────────────────────────────────────────────────────────

namespace {

double lfoValue(double shape, double phase) {
  const double t = js::mod(phase, 1.0);
  if (shape == 1.0) return t < 0.5 ? 4.0 * t - 1.0 : 3.0 - 4.0 * t;
  if (shape == 2.0) return t < 0.5 ? 1.0 : -1.0;
  return dmath::sin(phase * dmath::kPi * 2.0);
}

}  // namespace

std::vector<float> applyModulators(std::vector<float> samples, const std::vector<ModulatorConfig>& modulators,
                                   double sr) {
  std::vector<const ModulatorConfig*> active;
  for (const ModulatorConfig& m : modulators) {
    if (m.enabled && *m.enabled && orDefault(m.depth, 0.0) > 0.0) active.push_back(&m);
  }
  if (active.empty()) return samples;

  std::vector<float> out = std::move(samples);
  const std::size_t n = out.size();
  for (const ModulatorConfig* mod : active) {
    const double rate = orDefault(mod->rate, 4.0);
    const double depth = orDefault(mod->depth, 0.0);
    const double shape = orDefault(mod->shape, 0.0);
    const double startPhase = orDefault(mod->phase, 0.0);
    const ModTarget target = mod->target.value_or(ModTarget::Amplitude);
    std::vector<float> next(n, 0.0f);

    if (target == ModTarget::Pitch) {
      double readPos = 0.0;
      for (std::size_t i = 0; i < n; ++i) {
        const double phase = startPhase + (static_cast<double>(i) / sr) * rate;
        const double lfo = lfoValue(shape, phase);
        readPos += 1.0 + lfo * depth * 0.06;
        const double idx = std::floor(readPos);
        const double frac = readPos - idx;
        // Extreme depths can move readPos below 0 (TS reads `undefined` → NaN); clamp instead.
        const auto ia = static_cast<std::size_t>(std::clamp(idx, 0.0, static_cast<double>(n - 1)));
        const auto ib = static_cast<std::size_t>(std::clamp(idx + 1.0, 0.0, static_cast<double>(n - 1)));
        const double a = rd(out[ia]);
        const double b = rd(out[ib]);
        next[i] = wr(a + (b - a) * frac);
      }
    } else if (target == ModTarget::Filter) {
      double lp = 0.0;
      for (std::size_t i = 0; i < n; ++i) {
        const double phase = startPhase + (static_cast<double>(i) / sr) * rate;
        const double lfo = lfoValue(shape, phase);
        const double alpha = 0.05 + (0.5 + lfo * 0.5) * depth * 0.3;
        lp += alpha * (rd(out[i]) - lp);
        next[i] = wr(lp);
      }
    } else {
      // "amplitude" — and "pan", which the TS code also treats as amplitude.
      for (std::size_t i = 0; i < n; ++i) {
        const double phase = startPhase + (static_cast<double>(i) / sr) * rate;
        const double lfo = lfoValue(shape, phase);
        const double gain = 1.0 - depth * 0.5 + lfo * depth * 0.5;
        next[i] = wr(rd(out[i]) * gain);
      }
    }
    out = std::move(next);
  }
  return out;
}

// ── texture.ts ──────────────────────────────────────────────────────────────

std::vector<float> applyTexture(std::vector<float> samples, const std::optional<TextureParams>& texture,
                                Mulberry32& random, double sr) {
  const TextureParams t = withDefaults(texture.value_or(TextureParams{}));
  std::vector<float> out = std::move(samples);
  const std::size_t n = out.size();
  const double len = static_cast<double>(n);

  if (*t.subMix > 0.0) {
    double phase = 0.0;
    const double baseFreq = 220.0 * *t.subOctave;
    for (std::size_t i = 0; i < n; ++i) {
      phase += (baseFreq * 2.0 * dmath::kPi) / sr;
      out[i] = wr(rd(out[i]) + dmath::sin(phase) * *t.subMix * 0.4);
    }
  }

  if (*t.chorus > 0.0) {
    std::vector<float> mixed(n);
    const double delay = std::floor(0.02 * sr);
    for (std::size_t i = 0; i < n; ++i) {
      const double di = static_cast<double>(i);
      const double mod = dmath::sin((di / sr) * 1.5) * *t.chorus * delay;
      const double idx = std::max(0.0, std::min(len - 1.0, di - delay + std::floor(mod)));
      mixed[i] = wr(rd(out[i]) * (1.0 - *t.chorus * 0.4) +
                    rd(out[static_cast<std::size_t>(idx)]) * *t.chorus * 0.4);
    }
    out = std::move(mixed);
  }

  if (*t.phaser > 0.0) {
    double ap = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
      const double coeff = 0.5 + dmath::sin((static_cast<double>(i) / sr) * 3.0) * *t.phaser * 0.45;
      const double x = rd(out[i]);
      ap = x + coeff * ap;
      out[i] = wr(x - ap * *t.phaser);
    }
  }

  if (*t.ringMod > 0.0) {
    for (std::size_t i = 0; i < n; ++i) {
      const double carrier = dmath::sin((static_cast<double>(i) / sr) * 80.0 * dmath::kPi * 2.0);
      const double x = rd(out[i]);
      out[i] = wr(x * (1.0 - *t.ringMod) + x * carrier * *t.ringMod);
    }
  }

  auto resample = [&](double amount, double speed, double depthScale) {
    std::vector<float> mixed(n);
    double readPos = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
      readPos += 1.0 + dmath::sin((static_cast<double>(i) / sr) * speed) * amount * depthScale;
      const double idx = std::clamp(std::floor(readPos), 0.0, len - 1.0);  // see applyModulators
      mixed[i] = out[static_cast<std::size_t>(idx)];
    }
    out = std::move(mixed);
  };
  if (*t.flutter > 0.0) resample(*t.flutter, 12.0, 0.02);
  if (*t.wow > 0.0) resample(*t.wow, 0.6, 0.015);

  if (*t.transient > 0.0) {
    const double boost = std::floor(0.008 * sr);
    for (std::size_t i = 0; static_cast<double>(i) < boost && i < n; ++i) {
      out[i] = wr(rd(out[i]) * (1.0 + *t.transient * (1.0 - static_cast<double>(i) / boost)));
    }
  }

  if (*t.crackle > 0.0) {
    for (std::size_t i = 0; i < n; ++i) {
      if (random.next() < *t.crackle * 0.002) {
        const double r = random.next() * 2.0 - 1.0;
        out[i] = wr(rd(out[i]) + r * *t.crackle * 0.3);
      }
    }
  }

  if (*t.grain > 0.0) {
    const auto grainSize = static_cast<std::size_t>(std::floor(0.006 * sr));
    for (std::size_t i = 0; i < n; i += grainSize) {
      const double g = 0.5 + random.next() * *t.grain;
      for (std::size_t j = 0; j < grainSize && i + j < n; ++j) {
        out[i + j] = wr(rd(out[i + j]) * g);
      }
    }
  }

  if (*t.gate > 0.0) {
    const double threshold = *t.gate * 0.15;
    for (std::size_t i = 0; i < n; ++i) {
      if (std::fabs(rd(out[i])) < threshold) out[i] = 0.0f;
    }
  }

  return out;
}

}  // namespace makesfx::legacy
