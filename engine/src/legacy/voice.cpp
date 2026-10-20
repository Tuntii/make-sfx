#include <algorithm>
#include <array>
#include <cmath>

#include "legacy/js.hpp"
#include "legacy/legacy.hpp"
#include "math/dmath.hpp"

// Port of voice.ts — the three-oscillator channel synth with polyBLEP
// oscillators, a TPT state-variable filter, unison and a DC blocker.

namespace makesfx::legacy {
namespace {

using js::rd;
using js::wr;

double orDefault(const Opt& v, double fallback) { return v ? *v : fallback; }

struct Adsr {
  double attack, decay, sustain, release;
};

Adsr adsrOf(const std::optional<VoiceAdsr>& src, double fallbackRelease = 0.05) {
  const VoiceAdsr s = src.value_or(VoiceAdsr{});
  return {std::max(0.0, orDefault(s.attack, 0.0)), std::max(0.0, orDefault(s.decay, 0.0)),
          std::min(1.0, std::max(0.0, orDefault(s.sustain, 1.0))),
          std::max(0.001, orDefault(s.release, fallbackRelease))};
}

double levelAt(double t, const Adsr& env) {
  if (t <= env.attack) return env.attack == 0.0 ? 1.0 : t / env.attack;
  if (t <= env.attack + env.decay) {
    const double u = env.decay == 0.0 ? 1.0 : (t - env.attack) / env.decay;
    return 1.0 + (env.sustain - 1.0) * u;
  }
  return env.sustain;
}

double envAt(double time, double gate, const Adsr& env) {
  if (time < gate) return levelAt(time, env);
  const double rel = time - gate;
  if (rel >= env.release) return 0.0;
  return levelAt(gate, env) * (1.0 - rel / env.release);
}

double polyBlep(double phase, double dt) {
  if (dt <= 0.0 || dt >= 1.0) return 0.0;
  if (phase < dt) {
    const double x = phase / dt;
    return x + x - x * x - 1.0;
  }
  if (phase > 1.0 - dt) {
    const double x = (phase - 1.0) / dt;
    return x * x + x + x + 1.0;
  }
  return 0.0;
}

double oscSample(VoiceWave wave, double phase, double dt, double pulseWidth, Mulberry32& random) {
  switch (wave) {
    case VoiceWave::Noise: return random.next() * 2.0 - 1.0;
    case VoiceWave::Sine: return dmath::sin(phase * dmath::kPi * 2.0);
    case VoiceWave::Triangle: return 4.0 * std::fabs(phase - 0.5) - 1.0;
    case VoiceWave::Saw: return 2.0 * phase - 1.0 - polyBlep(phase, dt);
    case VoiceWave::Square: break;
  }
  const double pw = std::min(0.95, std::max(0.05, pulseWidth));
  double sample = phase < pw ? 1.0 : -1.0;
  sample += polyBlep(phase, dt);
  sample -= polyBlep(js::mod(phase - pw + 1.0, 1.0), dt);
  return sample;
}

struct SvfState {
  double ic1eq = 0.0;
  double ic2eq = 0.0;
};

struct SvfOut {
  double low, band, high;
};

SvfOut svf(SvfState& state, double input, double cutoff, double resonance, double sr) {
  const double nyquist = sr * 0.45;
  const double fc = std::min(nyquist, std::max(20.0, cutoff));
  const double g = dmath::tan((dmath::kPi * fc) / sr);
  const double q = 0.707 + std::min(1.0, std::max(0.0, resonance)) * 17.0;
  const double k = 1.0 / q;
  const double a1 = 1.0 / (1.0 + g * (g + k));
  const double a2 = g * a1;
  const double a3 = g * a2;
  const double v3 = input - state.ic2eq;
  const double v1 = a1 * state.ic1eq + a2 * v3;
  const double v2 = state.ic2eq + a2 * state.ic1eq + a3 * v3;
  state.ic1eq = 2.0 * v1 - state.ic1eq;
  state.ic2eq = 2.0 * v2 - state.ic2eq;
  return {v2, v1, input - k * v1 - v2};
}

std::vector<const VoiceOsc*> activeOscs(const VoicePatch& patch) {
  std::vector<const VoiceOsc*> out;
  auto consider = [&](const VoiceOsc* osc) {
    if (osc != nullptr && !(osc->enabled && !*osc->enabled) && orDefault(osc->level, 1.0) > 0.0) out.push_back(osc);
  };
  consider(&patch.osc1);
  consider(patch.osc2 ? &*patch.osc2 : nullptr);
  consider(patch.osc3 ? &*patch.osc3 : nullptr);
  return out;
}

std::vector<VoiceNote> resolveVoiceNotes(const VoicePatch& patch) {
  if (patch.notes && !patch.notes->empty()) return *patch.notes;
  VoiceNote n;
  n.time = 0.0;
  n.gate = orDefault(patch.gate, 0.1);
  return {n};
}

double noteHz(const VoicePatch& patch, const VoiceNote& note) {
  if (note.frequency) return *note.frequency;
  return patch.frequency * dmath::pow(2.0, orDefault(note.transpose, 0.0) / 12.0);
}

std::optional<VoiceAdsr> scaleAdsr(const std::optional<VoiceAdsr>& env, double scale) {
  if (!env) return env;
  VoiceAdsr r = *env;
  r.attack = orDefault(env->attack, 0.0) * scale;
  r.decay = orDefault(env->decay, 0.0) * scale;
  r.release = orDefault(env->release, 0.0) * scale;
  return r;
}

void renderNote(const VoicePatch& patch, const VoiceNote& note, std::vector<float>& out, Mulberry32& random,
                double sr) {
  const auto oscs = activeOscs(patch);
  if (oscs.empty()) return;
  double levelSum = 0.0;
  for (const VoiceOsc* osc : oscs) levelSum += orDefault(osc->level, 1.0);
  levelSum = js::orElse(levelSum, 1.0);

  const Adsr amp = adsrOf(patch.amp);
  const Adsr filterEnv = patch.filter ? adsrOf(patch.filter->adsr, amp.release) : amp;
  const double tail = std::max(amp.release, filterEnv.release);
  const double start = std::floor(note.time * sr);
  const double length = std::floor((note.gate + tail) * sr);
  const double baseHz = std::max(1.0, noteHz(patch, note));
  const VoiceUnison unison = patch.unison.value_or(VoiceUnison{});
  const auto unisonCount =
      static_cast<std::size_t>(std::min(7.0, std::max(1.0, js::round(orDefault(unison.voices, 1.0)))));
  const double spread = orDefault(unison.detune, 0.0);
  const double blend = std::min(1.0, std::max(0.0, orDefault(unison.blend, 1.0)));

  std::vector<SvfState> states(unisonCount);
  std::vector<std::array<double, 7>> phases(oscs.size());
  for (std::size_t o = 0; o < oscs.size(); ++o) {
    for (std::size_t v = 0; v < unisonCount; ++v) {
      phases[o][v] = js::mod(static_cast<double>(o) * 0.17 + static_cast<double>(v) * 0.137, 1.0);
    }
  }

  const std::optional<VoiceFilter>& filter = patch.filter;
  const double cutoffBase = filter ? orDefault(filter->cutoff, 8000.0) : 8000.0;
  const double resonance = filter ? orDefault(filter->resonance, 0.0) : 0.0;
  const double envAmount = filter ? orDefault(filter->envAmount, 0.0) : 0.0;
  const VoiceFilterType filterType = filter ? filter->type.value_or(VoiceFilterType::Lowpass) : VoiceFilterType::Lowpass;
  const double volume = orDefault(patch.volume, 0.8);
  const double nyquist = sr * 0.45;
  const double count = static_cast<double>(unisonCount);

  for (double i = 0.0; i < length; i += 1.0) {
    const double at = start + i;
    if (at < 0.0 || at >= static_cast<double>(out.size())) continue;
    const double t = i / sr;
    const double ampGain = envAt(t, note.gate, amp);
    if (ampGain <= 0.0) continue;
    const double fEnv = envAt(t, note.gate, filterEnv);
    const double cutoff = cutoffBase * dmath::pow(2.0, envAmount * fEnv);

    double mixed = 0.0;
    for (std::size_t voice = 0; voice < unisonCount; ++voice) {
      const double dv = static_cast<double>(voice);
      const double pos = unisonCount == 1 ? 0.0 : (dv / (count - 1.0)) * 2.0 - 1.0;
      const double cents = pos * (spread / 2.0);
      double stacked = 0.0;
      for (std::size_t o = 0; o < oscs.size(); ++o) {
        const VoiceOsc& osc = *oscs[o];
        const double hz =
            std::min(nyquist, baseHz * dmath::pow(2.0, orDefault(osc.coarse, 0.0) / 12.0 +
                                                           (orDefault(osc.fine, 0.0) + cents) / 1200.0));
        const double dt = hz / sr;
        const double phase = phases[o][voice];
        stacked += oscSample(osc.wave.value_or(VoiceWave::Saw), phase, dt, orDefault(osc.pulseWidth, 0.5), random) *
                   (orDefault(osc.level, 1.0) / levelSum);
        phases[o][voice] = js::mod(phase + dt, 1.0);
      }
      stacked /= std::sqrt(count);
      if (filter) {
        const SvfOut f = svf(states[voice], stacked, cutoff, resonance, sr);
        stacked = filterType == VoiceFilterType::Highpass  ? f.high
                  : filterType == VoiceFilterType::Bandpass ? f.band
                                                            : f.low;
      }
      const double voiceBlend = unisonCount == 1 ? 1.0 : dv == (count - 1.0) / 2.0 ? 1.0 - blend * 0.5 : blend;
      mixed += stacked * (unisonCount == 1 ? 1.0 : voiceBlend);
    }
    float& o = out[static_cast<std::size_t>(at)];
    o = wr(rd(o) + dmath::tanh(mixed * ampGain * volume));
  }
}

}  // namespace

double voiceLength(const VoicePatch& patch) {
  const Adsr amp = adsrOf(patch.amp);
  const double filterRelease = patch.filter ? adsrOf(patch.filter->adsr, amp.release).release : 0.0;
  const double tail = std::max(amp.release, filterRelease);
  double end = 0.0;
  for (const VoiceNote& note : resolveVoiceNotes(patch)) end = std::max(end, note.time + note.gate + tail);
  return end;
}

VoicePatch fitVoiceDuration(const VoicePatch& patch, const std::optional<MasterParams>& master) {
  if (!master || !master->duration || !js::truthy(*master->duration) || *master->duration <= 0.0) return patch;
  const double natural = voiceLength(patch);
  if (natural <= 0.0) return patch;
  const double scale = *master->duration / natural;
  VoicePatch r = patch;
  if (patch.gate) r.gate = *patch.gate * scale;
  r.amp = scaleAdsr(patch.amp, scale).value_or(patch.amp);
  if (patch.filter) r.filter->adsr = scaleAdsr(patch.filter->adsr, scale);
  if (patch.notes) {
    for (VoiceNote& n : *r.notes) {
      n.time *= scale;
      n.gate *= scale;
    }
  }
  return r;
}

VoicePatch shiftVoicePitch(const VoicePatch& patch, double factor) {
  if (factor == 1.0) return patch;
  VoicePatch r = patch;
  r.frequency = patch.frequency * factor;
  if (r.notes) {
    for (VoiceNote& n : *r.notes) {
      if (n.frequency) n.frequency = *n.frequency * factor;
    }
  }
  return r;
}

std::vector<float> synthesizeVoice(const VoicePatch& patch, Mulberry32& random, double sr) {
  const auto notes = resolveVoiceNotes(patch);
  const double total = std::max(1.0, std::ceil(voiceLength(patch) * sr) + 8.0);
  std::vector<float> out(static_cast<std::size_t>(total), 0.0f);
  for (const VoiceNote& note : notes) renderNote(patch, note, out, random, sr);

  double x1 = 0.0;
  double y1 = 0.0;
  const double r = 0.995;
  for (float& sample : out) {
    const double x = rd(sample);
    const double y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    sample = wr(y);
  }
  return out;
}

}  // namespace makesfx::legacy
