#include "legacy/legacy.hpp"

#include <bit>
#include <cmath>
#include <cstdint>

#include "legacy/js.hpp"
#include "math/dmath.hpp"
#include "math/rng.hpp"

// Port of buildSamples() in packages/core/src/synth.ts (ZzFX 1.3.2 lineage,
// with the 2.0 pitch and modulation fixes). Statement order follows the TS
// code so the RNG stream and rounding match.

namespace makesfx::legacy {
namespace {

constexpr double kPi2 = dmath::kPi * 2.0;

// sin() for the arguments ZzFX feeds it. Above 2^40 a double no longer
// resolves the phase (and in JS `i ** 5` is already rounding noise there), so
// those values come from a hash of the argument's bits: deterministic, with the
// same arcsine distribution as sin of a uniformly random phase.
double zzfxSin(double x) {
  if (std::fabs(x) < 1099511627776.0) return dmath::sin(x);
  const auto bits = std::bit_cast<std::uint64_t>(x);
  const double u = static_cast<double>(splitmix64Mix(bits) >> 11) * (1.0 / 9007199254740992.0);
  return dmath::sinTurns(u);
}

double zzfxTan(double x) {
  if (std::fabs(x) < 1099511627776.0) return dmath::tan(x);
  return zzfxSin(x) / zzfxSin(x + 1.0);
}

}  // namespace

std::vector<float> buildSamples(const SoundParams& params, Mulberry32& random, double sampleRate) {
  const SoundParams p = withDefaults(params);

  double volume = *p.volume;
  const double randomness = *p.randomness;
  double frequency = *p.frequency;
  double attack = *p.attack;
  double sustain = *p.sustain;
  double release = *p.release;
  const double shape = *p.shape;
  const double shapeCurve = *p.shapeCurve;
  double slide = *p.slide;
  double deltaSlide = *p.deltaSlide;
  double pitchJump = *p.pitchJump;
  double pitchJumpTime = *p.pitchJumpTime;
  double repeatTime = *p.repeatTime;
  const double noise = *p.noise;
  const double modulation = *p.modulation;
  const double bitCrush = *p.bitCrush;
  const double delay = *p.delay;
  const double sustainVolume = *p.sustainVolume;
  double decay = *p.decay;
  const double tremolo = *p.tremolo;
  const double filter = *p.filter;
  const bool callerHadPulseWidth = params.pulseWidth.has_value();
  const double pulseWidth = *p.pulseWidth;

  const double sr = sampleRate;

  slide *= (500.0 * kPi2) / sr / sr;
  const double startSlide = slide;
  const double r = random.next();
  frequency *= ((1.0 + randomness * 2.0 * r - randomness) * kPi2) / sr;
  double startFrequency = frequency;

  double modOffset = 0.0;
  double repeat = 0.0;
  double crush = 0.0;
  double jump = 1.0;
  double t = 0.0;
  double s = 0.0;

  const double quality = 2.0;
  const double w = (kPi2 * std::fabs(filter) * 2.0) / sr;
  const double cosw = dmath::cos(w);
  const double alpha = dmath::sin(w) / 2.0 / quality;
  const double a0 = 1.0 + alpha;
  const double a1 = (-2.0 * cosw) / a0;
  const double a2 = (1.0 - alpha) / a0;
  const double b0 = (1.0 + js::sign(filter) * cosw) / 2.0 / a0;
  const double b1 = -(js::sign(filter) + cosw) / a0;
  const double b2 = b0;
  double x2 = 0.0, x1 = 0.0, y2 = 0.0, y1 = 0.0;

  const double minAttack = 9.0;
  attack = js::orElse(attack * sr, minAttack);
  decay *= sr;
  sustain *= sr;
  release *= sr;
  const double delaySamples = delay * sr;
  deltaSlide *= (500.0 * kPi2) / (sr * sr * sr);
  const double modStep = (modulation * kPi2) / sr;
  pitchJump = (pitchJump * kPi2) / sr;
  pitchJumpTime *= sr;
  repeatTime = static_cast<double>(js::toInt32(repeatTime * sr));
  volume *= kMasterVolume;

  const std::int32_t lengthI = js::toInt32(attack + decay + sustain + release + delaySamples);
  const double length = static_cast<double>(lengthI);
  std::vector<float> samples(lengthI > 0 ? static_cast<std::size_t>(lengthI) : 0);

  const double crushMod = static_cast<double>(js::toInt32(bitCrush * 100.0));
  const bool pitchJumpOn = js::truthy(pitchJump);
  const bool repeatOn = js::truthy(repeatTime);

  for (std::size_t idx = 0; idx < samples.size(); ++idx) {
    const double i = static_cast<double>(idx);

    bool synthesize = crushMod == 0.0;
    if (!synthesize) {
      crush += 1.0;
      synthesize = js::mod(crush, crushMod) == 0.0;
    }
    if (synthesize) {
      if (js::truthy(shape)) {
        if (shape > 1.0) {
          if (shape > 2.0) {
            if (shape > 3.0) {
              if (shape > 4.0) {
                const double duty = callerHadPulseWidth ? pulseWidth : shapeCurve / 2.0;
                const double pw = std::fmin(0.95, std::fmax(0.05, duty));
                const double phase = js::mod(t / kPi2, 1.0);
                s = phase < pw ? 1.0 : -1.0;
              } else {
                s = zzfxSin(dmath::pow(t, 3.0));
              }
            } else {
              s = std::fmax(std::fmin(zzfxTan(t), 1.0), -1.0);
            }
          } else {
            s = 1.0 - js::mod(js::mod((2.0 * t) / kPi2, 2.0) + 2.0, 2.0);
          }
        } else {
          s = 1.0 - 4.0 * std::fabs(js::round(t / kPi2) - t / kPi2);
        }
      } else {
        s = zzfxSin(t);
      }

      double env;
      if (i < attack) {
        env = i / attack;
      } else if (i < attack + decay) {
        env = 1.0 - ((i - attack) / decay) * (1.0 - sustainVolume);
      } else if (i < attack + decay + sustain) {
        env = sustainVolume;
      } else if (i < length - delaySamples) {
        env = ((length - i - delaySamples) / release) * sustainVolume;
      } else {
        env = 0.0;
      }

      const double trem = repeatOn ? 1.0 - tremolo + tremolo * dmath::sin((kPi2 * i) / repeatTime) : 1.0;
      const double curved = shape > 4.0 ? s : js::sign(s) * dmath::pow(std::fabs(s), shapeCurve);
      s = trem * curved * env;

      if (js::truthy(delaySamples)) {
        double echo = 0.0;
        if (!(delaySamples > i)) {
          const double fade = i < length - delaySamples ? 1.0 : (length - i) / delaySamples;
          const std::int32_t at = js::toInt32(i - delaySamples);
          const double prev = (at >= 0 && static_cast<std::size_t>(at) < samples.size())
                                  ? js::rd(samples[static_cast<std::size_t>(at)])
                                  : 0.0;
          echo = fade * (prev / 2.0 / volume);
        }
        s = s / 2.0 + echo;
      }

      if (js::truthy(filter)) {
        // s = y1 = b2*x2 + b1*(x2 = x1) + b0*(x1 = s) - a2*y2 - a1*(y2 = y1)
        const double t1 = b2 * x2;
        x2 = x1;
        const double t2 = b1 * x2;
        x1 = s;
        const double t3 = b0 * x1;
        const double t4 = a2 * y2;
        y2 = y1;
        const double t5 = a1 * y2;
        s = y1 = t1 + t2 + t3 - t4 - t5;
      }
    }

    slide += deltaSlide;
    frequency += slide;
    const double f = frequency * dmath::cos(modStep * modOffset);
    modOffset += 1.0;
    if (noise != 0.0) {
      t += f + f * noise * zzfxSin(i * i * i * i * i);
    } else {
      t += f;
    }

    if (pitchJumpOn) {
      jump += 1.0;
      if (jump > pitchJumpTime) {
        frequency += pitchJump;
        startFrequency += pitchJump;
        jump = 0.0;
      }
    }

    if (repeatOn) {
      repeat += 1.0;
      if (js::mod(repeat, repeatTime) == 0.0) {
        frequency = startFrequency;
        slide = startSlide;
        if (jump == 0.0) jump = 1.0;
      }
    }

    samples[idx] = js::wr(s * volume);
  }

  return samples;
}

}  // namespace makesfx::legacy
