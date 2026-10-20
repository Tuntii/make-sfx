#pragma once

#include "math/dmath.hpp"

// Phase-accumulator oscillators. Phase is a double in turns [0, 1) so long
// renders never drift; output is float (spec §5.2 precision rules).

namespace makesfx::dsp {

// Two-sample polynomial band-limited step residual (Välimäki 2007).
// `t` is the phase in turns, `dt` the per-sample increment.
inline double polyBlep(double t, double dt) noexcept {
  if (t < dt) {
    const double x = t / dt;
    return x + x - x * x - 1.0;
  }
  if (t > 1.0 - dt) {
    const double x = (t - 1.0) / dt;
    return x * x + x + x + 1.0;
  }
  return 0.0;
}

class PhaseAccumulator {
public:
  void reset(double phase = 0.0) noexcept { phase_ = phase; }
  void setIncrement(double frequencyHz, double sampleRate) noexcept { increment_ = frequencyHz / sampleRate; }

  double phase() const noexcept { return phase_; }
  double increment() const noexcept { return increment_; }

  void advance() noexcept {
    phase_ += increment_;
    if (phase_ >= 1.0) phase_ -= 1.0;
  }

private:
  double phase_ = 0.0;
  double increment_ = 0.0;
};

class SineOscillator {
public:
  void setFrequency(double hz, double sampleRate) noexcept { acc_.setIncrement(hz, sampleRate); }
  void reset() noexcept { acc_.reset(); }

  float next() noexcept {
    const double y = dmath::sinTurns(acc_.phase());
    acc_.advance();
    return static_cast<float>(y);
  }

private:
  PhaseAccumulator acc_;
};

// Band-limited sawtooth rising from -1 to 1.
class PolyBlepSaw {
public:
  void setFrequency(double hz, double sampleRate) noexcept { acc_.setIncrement(hz, sampleRate); }
  void reset() noexcept { acc_.reset(); }

  float next() noexcept {
    const double t = acc_.phase();
    const double y = 2.0 * t - 1.0 - polyBlep(t, acc_.increment());
    acc_.advance();
    return static_cast<float>(y);
  }

private:
  PhaseAccumulator acc_;
};

// Flushes values that would become subnormal in feedback paths (spec §5.2).
// FTZ/DAZ cannot be relied on: WASM has no such mode.
inline float flushDenormal(float x) noexcept { return (x < 1e-15f && x > -1e-15f) ? 0.0f : x; }
inline double flushDenormal(double x) noexcept { return (x < 1e-15 && x > -1e-15) ? 0.0 : x; }

}  // namespace makesfx::dsp
