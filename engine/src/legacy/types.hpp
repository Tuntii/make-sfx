#pragma once

#include <optional>
#include <string>
#include <vector>

// Mirror of packages/core/src/types.ts (make-sfx 1.x SoundConfig). Fields are
// optional because the TS code distinguishes "undefined" from a value (seed
// variation, pulse width fallback, duration scaling).

namespace makesfx::legacy {

using Opt = std::optional<double>;

struct SoundParams {
  Opt volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, pulseWidth, slide,
      deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume,
      decay, tremolo, filter;
};

struct FxParams {
  Opt reverbMix, reverbDecay, delayTime, delayMix, delayFeedback, eqLow, eqMid, eqHigh, compression, saturation,
      stereoWidth, limiter;
};

struct MasterParams {
  Opt duration, durationScale, tail, fadeIn, fadeOut;
};

struct OscillatorLayer {
  std::optional<bool> enabled;
  Opt mix, detune, delay;
  std::optional<SoundParams> params;
};

enum class ModTarget { Amplitude, Pitch, Filter, Pan };

struct ModulatorConfig {
  std::optional<bool> enabled;
  std::optional<ModTarget> target;
  Opt rate, depth, shape, phase;
};

struct TextureParams {
  Opt chorus, phaser, crackle, subMix, subOctave, transient, flutter, gate, grain, ringMod, wow;
};

enum class VoiceWave { Sine, Triangle, Saw, Square, Noise };
enum class VoiceFilterType { Lowpass, Highpass, Bandpass };

struct VoiceOsc {
  std::optional<bool> enabled;
  std::optional<VoiceWave> wave;
  Opt coarse, fine, level, pulseWidth;
};

struct VoiceAdsr {
  Opt attack, decay, sustain, release;
};

struct VoiceFilter {
  std::optional<VoiceFilterType> type;
  Opt cutoff, resonance, envAmount;
  std::optional<VoiceAdsr> adsr;
};

struct VoiceUnison {
  Opt voices, detune, blend;
};

struct VoiceNote {
  double time = 0.0;
  double gate = 0.0;
  Opt frequency, transpose;
};

struct VoicePatch {
  double frequency = 220.0;
  Opt volume;
  VoiceOsc osc1;
  std::optional<VoiceOsc> osc2, osc3;
  VoiceAdsr amp;
  std::optional<VoiceFilter> filter;
  std::optional<VoiceUnison> unison;
  std::optional<std::vector<VoiceNote>> notes;
  Opt gate;
};

enum class Category { Ui, Combat, Pickup, Ambient, Stinger };

struct SoundConfig {
  SoundParams params;
  std::optional<FxParams> fx;
  std::optional<MasterParams> master;
  std::optional<std::vector<OscillatorLayer>> oscillators;
  std::optional<std::vector<ModulatorConfig>> modulators;
  std::optional<TextureParams> texture;
  std::optional<VoicePatch> voice;
  std::optional<Category> category;
  Opt seed;
};

struct RenderOptions {
  Opt seed;
  std::optional<Category> category;
  std::optional<std::string> presetId;
  std::optional<bool> normalize;
  double sampleRate = 44100.0;
};

struct MasteredBuffer {
  std::vector<float> mono;
  std::vector<float> left;
  std::vector<float> right;
  bool stereo = false;
  std::optional<Category> category;
};

// ── Defaults (types.ts) ─────────────────────────────────────────────────────

inline constexpr double kMasterVolume = 0.3;

SoundParams withDefaults(const SoundParams& p);
FxParams withDefaults(const FxParams& f);
MasterParams withDefaults(const MasterParams& m);
TextureParams withDefaults(const TextureParams& t);

// {...base, ...override}: fields set in `override` win.
SoundParams merge(const SoundParams& base, const SoundParams& override);

// ── Categories (categories.ts) ──────────────────────────────────────────────

double targetLufs(Category c) noexcept;
const char* toString(Category c) noexcept;
bool parseCategory(const std::string& name, Category& out) noexcept;
Category presetCategory(const std::string& presetId) noexcept;

}  // namespace makesfx::legacy
