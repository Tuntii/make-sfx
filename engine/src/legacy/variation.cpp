#include <cmath>

#include "legacy/js.hpp"
#include "legacy/legacy.hpp"

// Port of applyVariation() in variation.ts. The jitter draws happen in the
// same order as in TS, so a seed produces the same variant.

namespace makesfx::legacy {
namespace {

double jitter(Mulberry32& rng, double amount) { return (rng.next() - 0.5) * 2.0 * amount; }

}  // namespace

SoundConfig applyVariation(const SoundConfig& config, std::uint32_t seed) {
  Mulberry32 rng(seed);
  SoundConfig out = config;
  SoundParams& params = out.params;

  const double baseFreq = params.frequency.value_or(220.0);
  params.frequency = baseFreq * (1.0 + jitter(rng, 0.1));
  params.randomness = js::clamp(params.randomness.value_or(0.05) + std::fabs(jitter(rng, 0.04)), 0.0, 0.3);

  if (params.release) params.release = js::clamp(*params.release * (1.0 + jitter(rng, 0.12)), 0.01, 2.0);
  if (params.decay && *params.decay > 0.0) params.decay = js::clamp(*params.decay * (1.0 + jitter(rng, 0.1)), 0.0, 1.0);
  if (params.volume) params.volume = js::clamp(*params.volume * (1.0 + jitter(rng, 0.06)), 0.1, 1.0);
  if (params.pulseWidth && params.shape && *params.shape == 5.0) {
    params.pulseWidth = js::clamp(*params.pulseWidth + jitter(rng, 0.04), 0.05, 0.95);
  }

  if (out.oscillators && !out.oscillators->empty()) {
    for (OscillatorLayer& osc : *out.oscillators) {
      if (osc.params && osc.params->shape && *osc.params->shape == 5.0 && osc.params->pulseWidth) {
        osc.params->pulseWidth = js::clamp(*osc.params->pulseWidth + jitter(rng, 0.04), 0.05, 0.95);
      }
      if (osc.mix) osc.mix = js::clamp(*osc.mix + jitter(rng, 0.08), 0.0, 1.0);
      if (osc.detune) osc.detune = *osc.detune + jitter(rng, 1.5);
    }
  }

  if (out.master && out.master->duration && js::truthy(*out.master->duration) && *out.master->duration > 0.0) {
    out.master->duration = js::clamp(*out.master->duration * (1.0 + jitter(rng, 0.08)), 0.02, 3.0);
  }

  if (out.voice) out.voice = shiftVoicePitch(*out.voice, 1.0 + jitter(rng, 0.1));
  return out;
}

}  // namespace makesfx::legacy
