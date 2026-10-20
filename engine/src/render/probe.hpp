#pragma once

#include <cstddef>
#include <string>
#include <string_view>
#include <vector>

#include "makesfx/result.hpp"

// Probe renders: fixed reference signals that exercise the oscillator, math and
// hashing paths end to end. M0 uses them to prove that every platform produces
// identical bits before any real project rendering exists.

namespace makesfx {

enum class ProbeSignal { Sine, Saw };

struct ProbeSpec {
  ProbeSignal signal = ProbeSignal::Sine;
  double frequencyHz = 1000.0;
  double sampleRate = 48000.0;
  double seconds = 1.0;
  double levelDb = -6.0;
};

bool parseProbeSignal(std::string_view name, ProbeSignal& out) noexcept;

// floor(seconds · sampleRate), or 0 when out of range.
std::size_t probeFrames(double sampleRate, double seconds) noexcept;

Diagnostics validateProbe(const ProbeSpec& spec);

// Renders into `out` (must hold probeFrames() samples). Precondition: validateProbe() is empty.
void renderProbeInto(const ProbeSpec& spec, float* out) noexcept;

Result<std::vector<float>> renderProbe(const ProbeSpec& spec);

// SHA-256 of float32 little-endian PCM.
std::string pcmSha256(const std::vector<float>& samples);

// SHA-256 over a fixed grid of dmath outputs (binary64 LE). Any cross-platform
// difference in the math library shows up here.
std::string mathGridSha256();

}  // namespace makesfx
