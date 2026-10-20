#include <algorithm>
#include <array>
#include <cmath>

#include "legacy/js.hpp"
#include "legacy/legacy.hpp"
#include "math/dmath.hpp"

// Port of fx.ts — the 1.x post-FX chain: EQ → saturation → compression →
// delay → reverb → limiter, plus the Haas stereo widener.

namespace makesfx::legacy {
namespace {

using js::rd;
using js::wr;

double dbToGain(double db) { return dmath::pow(10.0, db / 20.0); }

std::vector<float> applyEq(const std::vector<float>& samples, const FxParams& fx) {
  std::vector<float> out(samples.size());
  const double lowGain = dbToGain(*fx.eqLow);
  const double midGain = dbToGain(*fx.eqMid);
  const double highGain = dbToGain(*fx.eqHigh);
  double low = 0.0;
  double high = 0.0;
  const double lowAlpha = 0.04;
  const double highAlpha = 0.15;
  for (std::size_t i = 0; i < samples.size(); ++i) {
    const double s = rd(samples[i]);
    low += lowAlpha * (s - low);
    high += highAlpha * (s - high);
    const double mid = s - low - high * 0.5;
    out[i] = wr(low * lowGain + mid * midGain + high * highGain);
  }
  return out;
}

std::vector<float> applySaturation(std::vector<float> samples, double amount) {
  if (amount <= 0.0) return samples;
  const double drive = 1.0 + amount * 8.0;
  const double norm = dmath::tanh(drive);
  for (float& s : samples) s = wr(dmath::tanh(rd(s) * drive) / norm);
  return samples;
}

std::vector<float> applyCompression(std::vector<float> samples, double amount) {
  if (amount <= 0.0) return samples;
  const double threshold = 0.3 - amount * 0.2;
  const double ratio = 1.0 + amount * 6.0;
  for (float& sample : samples) {
    const double s = rd(sample);
    const double a = std::fabs(s);
    if (a > threshold) {
      const double sign = s < 0.0 ? -1.0 : 1.0;
      const double excess = a - threshold;
      sample = wr(sign * (threshold + excess / ratio));
    }
  }
  return samples;
}

std::vector<float> applyDelay(std::vector<float> samples, const FxParams& fx, double sr) {
  if (*fx.delayMix <= 0.0 || *fx.delayTime <= 0.0) return samples;
  const auto delaySamples = static_cast<std::size_t>(std::floor(*fx.delayTime * sr));
  const std::size_t tailLen = delaySamples * 4;
  std::vector<float> out(samples.size() + tailLen, 0.0f);
  const double dryMix = 1.0 - *fx.delayMix;
  for (std::size_t i = 0; i < samples.size(); ++i) out[i] = wr(rd(out[i]) + rd(samples[i]) * dryMix);

  double feedback = *fx.delayMix;
  for (int tap = 1; tap <= 4 && feedback > 0.02; ++tap) {
    const std::size_t offset = delaySamples * static_cast<std::size_t>(tap);
    const double tapGain = dmath::pow(*fx.delayFeedback, tap - 1);
    for (std::size_t i = 0; i < samples.size(); ++i) {
      const std::size_t idx = i + offset;
      if (idx < out.size()) out[idx] = wr(rd(out[idx]) + rd(samples[i]) * feedback * tapGain);
    }
    feedback *= *fx.delayFeedback;
  }
  return out;
}

std::vector<float> applyReverb(std::vector<float> samples, const FxParams& fx, double sr) {
  if (*fx.reverbMix <= 0.0) return samples;
  const double decaySamples = std::floor(*fx.reverbDecay * sr);
  const double tail = std::max(0.0, std::min(decaySamples, std::floor(static_cast<double>(samples.size()) * 3.0)));
  std::vector<float> buf(samples.size() + static_cast<std::size_t>(tail), 0.0f);
  std::copy(samples.begin(), samples.end(), buf.begin());

  constexpr std::array<double, 4> kComb = {1557.0, 1889.0, 2231.0, 2611.0};
  for (const double d : kComb) {
    const auto delay = static_cast<std::size_t>(std::floor((d / 44100.0) * sr));
    const double decay = 0.55 + *fx.reverbDecay * 0.1;
    for (std::size_t i = delay; i < buf.size(); ++i) {
      buf[i] = wr(rd(buf[i]) + rd(buf[i - delay]) * decay * *fx.reverbMix * 0.2);
    }
  }

  std::vector<float> out(buf.size());
  for (std::size_t i = 0; i < buf.size(); ++i) {
    const double dry = i < samples.size() ? rd(samples[i]) * (1.0 - *fx.reverbMix) : 0.0;
    out[i] = wr(dry + rd(buf[i]) * *fx.reverbMix);
  }
  return out;
}

std::vector<float> applyLimiter(std::vector<float> samples, double ceiling) {
  const double max = std::max(ceiling, 0.01);
  for (float& sample : samples) {
    const double s = rd(sample);
    sample = wr(s > max ? max : s < -max ? -max : s);
  }
  return samples;
}

}  // namespace

std::vector<float> applyFx(const std::vector<float>& samples, const FxParams& fxIn, double sr) {
  const FxParams f = withDefaults(fxIn);
  std::vector<float> out = applyEq(samples, f);
  out = applySaturation(std::move(out), *f.saturation);
  out = applyCompression(std::move(out), *f.compression);
  out = applyDelay(std::move(out), f, sr);
  out = applyReverb(std::move(out), f, sr);
  out = applyLimiter(std::move(out), *f.limiter);
  return out;
}

void applyFxStereo(const std::vector<float>& samples, const FxParams& fxIn, double sr, std::vector<float>& left,
                   std::vector<float>& right) {
  const FxParams f = withDefaults(fxIn);
  std::vector<float> processed = applyFx(samples, f, sr);
  const double width = *f.stereoWidth;
  if (width <= 0.0) {
    left = processed;
    right = std::move(processed);
    return;
  }
  const auto haas = static_cast<std::size_t>(std::floor(sr * 0.012 * width));
  right.assign(processed.size(), 0.0f);
  for (std::size_t i = haas; i < processed.size(); ++i) {
    right[i] = wr(rd(processed[i - haas]) * (0.85 + width * 0.15));
  }
  left = std::move(processed);
}

}  // namespace makesfx::legacy
