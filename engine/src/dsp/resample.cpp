#include "dsp/resample.hpp"

#include <algorithm>
#include <cmath>

#include "math/dmath.hpp"

namespace makesfx::dsp {
namespace {

constexpr double kZeroCrossings = 16.0;
constexpr double kBeta = 8.6;
constexpr int kTableResolution = 512;  // kernel points per input sample

// Modified Bessel function of the first kind, order 0 (power series).
double besselI0(double x) {
  double sum = 1.0;
  double term = 1.0;
  const double q = x * x / 4.0;
  for (int k = 1; k < 64; ++k) {
    term *= q / (static_cast<double>(k) * static_cast<double>(k));
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

}  // namespace

std::vector<float> resample(std::span<const float> input, double ratio) {
  if (!(ratio > 0.0) || !std::isfinite(ratio)) return {};
  const auto outFrames = static_cast<std::size_t>(std::floor(static_cast<double>(input.size()) * ratio));
  std::vector<float> out(outFrames);
  if (input.empty() || outFrames == 0) return out;

  // Cutoff in units of the input Nyquist; slightly below the lower Nyquist.
  const double cutoff = std::min(1.0, ratio) * 0.97;
  const double radius = kZeroCrossings / cutoff;  // kernel half-width in input samples

  // kernel(d) = cutoff · sinc(cutoff · d) · kaiser(d / radius), tabulated over d ∈ [0, radius].
  const auto tableSize = static_cast<std::size_t>(std::ceil(radius * kTableResolution)) + 2;
  std::vector<double> table(tableSize);
  const double i0Beta = besselI0(kBeta);
  for (std::size_t j = 0; j < tableSize; ++j) {
    const double d = static_cast<double>(j) / kTableResolution;
    if (d >= radius) {
      table[j] = 0.0;
      continue;
    }
    const double x = cutoff * d;
    const double sinc = x == 0.0 ? 1.0 : dmath::sin(dmath::kPi * x) / (dmath::kPi * x);
    const double r = d / radius;
    const double window = besselI0(kBeta * std::sqrt(1.0 - r * r)) / i0Beta;
    table[j] = cutoff * sinc * window;
  }

  const auto n = static_cast<std::ptrdiff_t>(input.size());
  for (std::size_t i = 0; i < outFrames; ++i) {
    const double t = static_cast<double>(i) / ratio;  // position in input samples
    const auto first = static_cast<std::ptrdiff_t>(std::ceil(t - radius));
    const auto last = static_cast<std::ptrdiff_t>(std::floor(t + radius));
    double acc = 0.0;
    for (std::ptrdiff_t k = std::max<std::ptrdiff_t>(first, 0); k <= std::min(last, n - 1); ++k) {
      const double pos = std::fabs(t - static_cast<double>(k)) * kTableResolution;
      const auto j = static_cast<std::size_t>(pos);
      if (j + 1 >= tableSize) continue;
      const double frac = pos - static_cast<double>(j);
      const double kernel = table[j] + (table[j + 1] - table[j]) * frac;
      acc += static_cast<double>(input[static_cast<std::size_t>(k)]) * kernel;
    }
    out[i] = static_cast<float>(acc);
  }
  return out;
}

}  // namespace makesfx::dsp
