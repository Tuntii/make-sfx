#include "render/probe.hpp"

#include <cmath>

#include "dsp/oscillator.hpp"
#include "math/dmath.hpp"
#include "math/sha256.hpp"

namespace makesfx {
namespace {

constexpr double kMinSampleRate = 8000.0;
constexpr double kMaxSampleRate = 384000.0;
constexpr double kMaxSeconds = 600.0;

Diagnostic outOfRange(std::string path, std::string message) {
  return Diagnostic{Severity::Error, "E_OUT_OF_RANGE", std::move(path), std::move(message), {}};
}

}  // namespace

bool parseProbeSignal(std::string_view name, ProbeSignal& out) noexcept {
  if (name == "sine") {
    out = ProbeSignal::Sine;
    return true;
  }
  if (name == "saw") {
    out = ProbeSignal::Saw;
    return true;
  }
  return false;
}

std::size_t probeFrames(double sampleRate, double seconds) noexcept {
  if (!(sampleRate >= kMinSampleRate && sampleRate <= kMaxSampleRate)) return 0;
  if (!(seconds > 0.0 && seconds <= kMaxSeconds)) return 0;
  return static_cast<std::size_t>(std::floor(seconds * sampleRate));
}

Diagnostics validateProbe(const ProbeSpec& spec) {
  Diagnostics d;
  if (!(spec.sampleRate >= kMinSampleRate && spec.sampleRate <= kMaxSampleRate)) {
    d.push_back(outOfRange("/sample_rate", "sample_rate must be within 8000..384000"));
  }
  if (!(spec.seconds > 0.0 && spec.seconds <= kMaxSeconds)) {
    d.push_back(outOfRange("/seconds", "seconds must be within (0, 600]"));
  }
  if (!(spec.frequencyHz > 0.0 && spec.frequencyHz < spec.sampleRate * 0.5)) {
    d.push_back(outOfRange("/frequency_hz", "frequency_hz must be above 0 and below Nyquist"));
  }
  if (!(spec.levelDb >= -96.0 && spec.levelDb <= 0.0)) {
    d.push_back(outOfRange("/level_db", "level_db must be within -96..0"));
  }
  return d;
}

void renderProbeInto(const ProbeSpec& spec, float* out) noexcept {
  const std::size_t frames = probeFrames(spec.sampleRate, spec.seconds);
  const auto gain = static_cast<float>(dmath::dbToGain(spec.levelDb));
  switch (spec.signal) {
    case ProbeSignal::Sine: {
      dsp::SineOscillator osc;
      osc.setFrequency(spec.frequencyHz, spec.sampleRate);
      for (std::size_t i = 0; i < frames; ++i) out[i] = osc.next() * gain;
      break;
    }
    case ProbeSignal::Saw: {
      dsp::PolyBlepSaw osc;
      osc.setFrequency(spec.frequencyHz, spec.sampleRate);
      for (std::size_t i = 0; i < frames; ++i) out[i] = osc.next() * gain;
      break;
    }
  }
}

Result<std::vector<float>> renderProbe(const ProbeSpec& spec) {
  Diagnostics problems = validateProbe(spec);
  if (!problems.empty()) return Result<std::vector<float>>::failure(std::move(problems));
  std::vector<float> samples(probeFrames(spec.sampleRate, spec.seconds));
  renderProbeInto(spec, samples.data());
  return Result<std::vector<float>>::success(std::move(samples));
}

std::string pcmSha256(const std::vector<float>& samples) {
  Sha256 h;
  h.updateFloatsLE(samples);
  return h.finishHex();
}

std::string mathGridSha256() {
  std::vector<double> values;
  constexpr int kSteps = 4096;
  values.reserve(kSteps * 10);
  for (int i = 0; i < kSteps; ++i) {
    const double u = static_cast<double>(i) / kSteps;    // [0, 1)
    const double x = (u - 0.5) * 200.0;                  // [-100, 100)
    values.push_back(dmath::sinTurns(u * 7.0 - 3.0));
    values.push_back(dmath::cosTurns(u * 7.0 - 3.0));
    values.push_back(dmath::sin(x));
    values.push_back(dmath::tan(x * 0.0078125));
    values.push_back(dmath::exp((u - 0.5) * 1400.0));
    values.push_back(dmath::exp2((u - 0.5) * 40.0));
    values.push_back(dmath::log(std::ldexp(u + 1e-3, i % 64 - 32)));
    values.push_back(dmath::tanh(x * 0.25));
    values.push_back(dmath::pow(u * 4.0 + 0.01, x * 0.05));
    values.push_back(dmath::gainToDb(dmath::dbToGain(x)));
  }
  Sha256 h;
  h.updateDoublesLE(values);
  return h.finishHex();
}

}  // namespace makesfx
