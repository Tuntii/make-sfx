#include <algorithm>
#include <array>
#include <cmath>

#include "legacy/js.hpp"
#include "legacy/legacy.hpp"
#include "math/dmath.hpp"

// Port of loudness.ts: ITU-R BS.1770 K-weighting, category loudness (maximum
// momentary), 4x windowed-sinc true peak, clip-based true-peak limiter and the
// iterative category normalizer.

namespace makesfx::legacy {
namespace {

using js::rd;
using js::wr;

constexpr int kMaxPasses = 12;
constexpr int kTpOversample = 4;
constexpr int kTpHalf = 6;

struct Biquad {
  double b0, b1, b2, a1, a2;
};

Biquad kWeightHighShelf(double fs) {
  const double f0 = 1681.974450955533;
  const double G = 3.999843853973347;
  const double Q = 0.7071752369554196;
  const double K = dmath::tan((dmath::kPi * f0) / fs);
  const double Vh = dmath::pow(10.0, G / 20.0);
  const double Vb = dmath::pow(Vh, 0.4996667741545416);
  const double a0 = 1.0 + K / Q + K * K;
  return {(Vh + (Vb * K) / Q + K * K) / a0, (2.0 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0,
          (2.0 * (K * K - 1.0)) / a0, (1.0 - K / Q + K * K) / a0};
}

Biquad kWeightHighPass(double fs) {
  const double f0 = 38.13547087602444;
  const double Q = 0.5003270373238773;
  const double K = dmath::tan((dmath::kPi * f0) / fs);
  const double a0 = 1.0 + K / Q + K * K;
  return {1.0 / a0, -2.0 / a0, 1.0 / a0, (2.0 * (K * K - 1.0)) / a0, (1.0 - K / Q + K * K) / a0};
}

std::vector<float> applyBiquad(const std::vector<float>& x, const Biquad& c) {
  std::vector<float> out(x.size());
  double x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0;
  for (std::size_t i = 0; i < x.size(); ++i) {
    const double xn = rd(x[i]);
    const double yn = c.b0 * xn + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = xn;
    y2 = y1;
    y1 = yn;
    out[i] = wr(yn);
  }
  return out;
}

std::vector<float> kWeighted(const std::vector<float>& samples, double sr) {
  const auto minSamples = static_cast<std::size_t>(std::floor(sr * 0.1));
  std::vector<float> buf = samples;
  if (buf.size() < minSamples) buf.resize(minSamples, 0.0f);
  buf = applyBiquad(buf, kWeightHighShelf(sr));
  return applyBiquad(buf, kWeightHighPass(sr));
}

double meanSquareToLufs(double meanSquare) {
  if (meanSquare < 1e-20) return -70.0;
  return 10.0 * dmath::log10(meanSquare) - 0.691;
}

struct TpKernels {
  std::array<std::array<float, 2 * kTpHalf>, kTpOversample> taps{};

  TpKernels() {
    for (int phase = 0; phase < kTpOversample; ++phase) {
      const double frac = static_cast<double>(phase) / kTpOversample;
      for (int k = 0; k < 2 * kTpHalf; ++k) {
        const double t = static_cast<double>(k - (kTpHalf - 1));
        const double d = t - frac;
        const double sinc = d == 0.0 ? 1.0 : dmath::sin(dmath::kPi * d) / (dmath::kPi * d);
        const double w = 0.5 * (1.0 + dmath::cos((dmath::kPi * d) / kTpHalf));
        taps[static_cast<std::size_t>(phase)][static_cast<std::size_t>(k)] =
            wr(std::fabs(d) < kTpHalf ? sinc * w : 0.0);
      }
    }
  }
};

const TpKernels& tpKernels() {
  static const TpKernels kernels;
  return kernels;
}

double truePeakAmp(const std::vector<float>& x) {
  const auto& kernels = tpKernels().taps;
  const auto n = static_cast<std::ptrdiff_t>(x.size());
  double peak = 0.0;
  for (std::ptrdiff_t i = 0; i < n; ++i) {
    for (const auto& ker : kernels) {
      double acc = 0.0;
      for (std::ptrdiff_t k = 0; k < static_cast<std::ptrdiff_t>(ker.size()); ++k) {
        const std::ptrdiff_t idx = i + (k - (kTpHalf - 1));
        if (idx >= 0 && idx < n) acc += rd(x[static_cast<std::size_t>(idx)]) * rd(ker[static_cast<std::size_t>(k)]);
      }
      const double a = acc < 0.0 ? -acc : acc;
      if (a > peak) peak = a;
    }
  }
  return peak;
}

std::vector<float> hardClip(const std::vector<float>& x, double ceiling) {
  std::vector<float> out(x.size());
  for (std::size_t i = 0; i < x.size(); ++i) {
    const double s = rd(x[i]);
    out[i] = wr(s > ceiling ? ceiling : s < -ceiling ? -ceiling : s);
  }
  return out;
}

}  // namespace

std::vector<float> applyLoudnessGain(const std::vector<float>& samples, double gain, double ceilingDbTp) {
  std::vector<float> scaled(samples.size());
  for (std::size_t i = 0; i < samples.size(); ++i) scaled[i] = wr(rd(samples[i]) * gain);
  return applyTruePeakLimit(scaled, ceilingDbTp);
}

double measureLufs(const std::vector<float>& samples, double sr) {
  const std::vector<float> buf = kWeighted(samples, sr);
  if (buf.empty()) return -70.0;
  const auto momentary = static_cast<std::size_t>(js::round(sr * 0.4));
  const std::size_t window = std::min(momentary, buf.size());

  double sum = 0.0;
  for (std::size_t i = 0; i < window; ++i) sum += rd(buf[i]) * rd(buf[i]);
  double best = sum;
  for (std::size_t i = window; i < buf.size(); ++i) {
    sum += rd(buf[i]) * rd(buf[i]) - rd(buf[i - window]) * rd(buf[i - window]);
    if (sum > best) best = sum;
  }
  return meanSquareToLufs(best / static_cast<double>(window));
}

double measureIntegratedLufs(const std::vector<float>& samples, double sr) {
  const std::vector<float> buf = kWeighted(samples, sr);
  if (buf.empty()) return -70.0;
  double sum = 0.0;
  for (const float v : buf) sum += rd(v) * rd(v);
  return meanSquareToLufs(sum / static_cast<double>(buf.size()));
}

double measureTruePeak(const std::vector<float>& samples) {
  const double peak = truePeakAmp(samples);
  return peak > 1e-10 ? 20.0 * dmath::log10(peak) : -70.0;
}

std::vector<float> applyTruePeakLimit(const std::vector<float>& samples, double ceilingDbTp) {
  const double ceiling = dmath::pow(10.0, ceilingDbTp / 20.0);
  double clip = ceiling;
  std::vector<float> out = hardClip(samples, clip);
  for (int iter = 0; iter < 8; ++iter) {
    const double tp = truePeakAmp(out);
    if (tp <= ceiling * 1.0001) return out;
    clip *= ceiling / tp;
    out = hardClip(samples, clip);
  }
  const double tp = truePeakAmp(out);
  if (tp > ceiling) {
    const double g = ceiling / tp;
    for (float& s : out) s = wr(rd(s) * g);
  }
  return out;
}

std::vector<float> mixDownMono(const std::vector<float>& left, const std::vector<float>& right) {
  const std::size_t len = std::max(left.size(), right.size());
  std::vector<float> mono(len);
  for (std::size_t i = 0; i < len; ++i) {
    const double l = i < left.size() ? rd(left[i]) : 0.0;
    const double r = i < right.size() ? rd(right[i]) : 0.0;
    mono[i] = wr((l + r) * 0.5);
  }
  return mono;
}

std::vector<float> normalizeLoudnessTo(const std::vector<float>& samples, double target, double sr,
                                       double toleranceLufs) {
  std::vector<float> result = samples;
  for (int pass = 0; pass < kMaxPasses; ++pass) {
    const double current = measureLufs(result, sr);
    if (!std::isfinite(current) || current < -60.0) return samples;
    if (std::fabs(current - target) <= toleranceLufs) return result;
    const double gain = dmath::pow(10.0, (target - current) / 20.0);
    result = applyLoudnessGain(result, gain, -1.0);
  }
  return result;
}

void normalizeLoudnessStereoTo(std::vector<float>& left, std::vector<float>& right, double target, double sr,
                               double toleranceLufs) {
  std::vector<float> l = left;
  std::vector<float> r = right;
  for (int pass = 0; pass < kMaxPasses; ++pass) {
    const double current = measureLufs(mixDownMono(l, r), sr);
    if (!std::isfinite(current) || current < -60.0) return;  // keep the originals
    if (std::fabs(current - target) <= toleranceLufs) break;
    const double gain = dmath::pow(10.0, (target - current) / 20.0);
    l = applyLoudnessGain(l, gain, -1.0);
    r = applyLoudnessGain(r, gain, -1.0);
  }
  left = std::move(l);
  right = std::move(r);
}

std::vector<float> normalizeLoudness(const std::vector<float>& samples, Category category, double sr,
                                     double toleranceLufs) {
  return normalizeLoudnessTo(samples, targetLufs(category), sr, toleranceLufs);
}

void normalizeLoudnessStereo(std::vector<float>& left, std::vector<float>& right, Category category, double sr,
                             double toleranceLufs) {
  normalizeLoudnessStereoTo(left, right, targetLufs(category), sr, toleranceLufs);
}

}  // namespace makesfx::legacy
