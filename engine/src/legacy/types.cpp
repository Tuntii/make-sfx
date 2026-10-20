#include "legacy/types.hpp"

#include <array>
#include <string_view>
#include <utility>

namespace makesfx::legacy {
namespace {

template <class T>
void fill(Opt T::*field, T& target, double value) {
  if (!(target.*field)) target.*field = value;
}

template <class T>
void take(Opt T::*field, T& target, const T& source) {
  if (source.*field) target.*field = source.*field;
}

}  // namespace

SoundParams withDefaults(const SoundParams& p) {
  SoundParams r = p;
  fill(&SoundParams::volume, r, 1.0);
  fill(&SoundParams::randomness, r, 0.05);
  fill(&SoundParams::frequency, r, 220.0);
  fill(&SoundParams::attack, r, 0.0);
  fill(&SoundParams::sustain, r, 0.0);
  fill(&SoundParams::release, r, 0.1);
  fill(&SoundParams::shape, r, 0.0);
  fill(&SoundParams::shapeCurve, r, 1.0);
  fill(&SoundParams::pulseWidth, r, 0.5);
  fill(&SoundParams::slide, r, 0.0);
  fill(&SoundParams::deltaSlide, r, 0.0);
  fill(&SoundParams::pitchJump, r, 0.0);
  fill(&SoundParams::pitchJumpTime, r, 0.0);
  fill(&SoundParams::repeatTime, r, 0.0);
  fill(&SoundParams::noise, r, 0.0);
  fill(&SoundParams::modulation, r, 0.0);
  fill(&SoundParams::bitCrush, r, 0.0);
  fill(&SoundParams::delay, r, 0.0);
  fill(&SoundParams::sustainVolume, r, 1.0);
  fill(&SoundParams::decay, r, 0.0);
  fill(&SoundParams::tremolo, r, 0.0);
  fill(&SoundParams::filter, r, 0.0);
  return r;
}

FxParams withDefaults(const FxParams& f) {
  FxParams r = f;
  fill(&FxParams::reverbMix, r, 0.0);
  fill(&FxParams::reverbDecay, r, 0.8);
  fill(&FxParams::delayTime, r, 0.0);
  fill(&FxParams::delayMix, r, 0.0);
  fill(&FxParams::delayFeedback, r, 0.3);
  fill(&FxParams::eqLow, r, 0.0);
  fill(&FxParams::eqMid, r, 0.0);
  fill(&FxParams::eqHigh, r, 0.0);
  fill(&FxParams::compression, r, 0.0);
  fill(&FxParams::saturation, r, 0.0);
  fill(&FxParams::stereoWidth, r, 0.0);
  fill(&FxParams::limiter, r, 0.8);
  return r;
}

MasterParams withDefaults(const MasterParams& m) {
  MasterParams r = m;
  fill(&MasterParams::duration, r, 0.0);
  fill(&MasterParams::durationScale, r, 1.0);
  fill(&MasterParams::tail, r, 0.0);
  fill(&MasterParams::fadeIn, r, 0.0);
  fill(&MasterParams::fadeOut, r, 0.0);
  return r;
}

TextureParams withDefaults(const TextureParams& t) {
  TextureParams r = t;
  fill(&TextureParams::chorus, r, 0.0);
  fill(&TextureParams::phaser, r, 0.0);
  fill(&TextureParams::crackle, r, 0.0);
  fill(&TextureParams::subMix, r, 0.0);
  fill(&TextureParams::subOctave, r, 0.5);
  fill(&TextureParams::transient, r, 0.0);
  fill(&TextureParams::flutter, r, 0.0);
  fill(&TextureParams::gate, r, 0.0);
  fill(&TextureParams::grain, r, 0.0);
  fill(&TextureParams::ringMod, r, 0.0);
  fill(&TextureParams::wow, r, 0.0);
  return r;
}

SoundParams merge(const SoundParams& base, const SoundParams& o) {
  SoundParams r = base;
  for (Opt SoundParams::*field :
       {&SoundParams::volume, &SoundParams::randomness, &SoundParams::frequency, &SoundParams::attack,
        &SoundParams::sustain, &SoundParams::release, &SoundParams::shape, &SoundParams::shapeCurve,
        &SoundParams::pulseWidth, &SoundParams::slide, &SoundParams::deltaSlide, &SoundParams::pitchJump,
        &SoundParams::pitchJumpTime, &SoundParams::repeatTime, &SoundParams::noise, &SoundParams::modulation,
        &SoundParams::bitCrush, &SoundParams::delay, &SoundParams::sustainVolume, &SoundParams::decay,
        &SoundParams::tremolo, &SoundParams::filter}) {
    take(field, r, o);
  }
  return r;
}

double targetLufs(Category c) noexcept {
  switch (c) {
    case Category::Ui: return -14.0;
    case Category::Combat: return -9.0;
    case Category::Pickup: return -12.0;
    case Category::Ambient: return -18.0;
    case Category::Stinger: return -11.0;
  }
  return -14.0;
}

const char* toString(Category c) noexcept {
  switch (c) {
    case Category::Ui: return "ui";
    case Category::Combat: return "combat";
    case Category::Pickup: return "pickup";
    case Category::Ambient: return "ambient";
    case Category::Stinger: return "stinger";
  }
  return "ui";
}

bool parseCategory(const std::string& name, Category& out) noexcept {
  for (const Category c : {Category::Ui, Category::Combat, Category::Pickup, Category::Ambient, Category::Stinger}) {
    if (name == toString(c)) {
      out = c;
      return true;
    }
  }
  return false;
}

Category presetCategory(const std::string& presetId) noexcept {
  // PRESET_CATEGORY_MAP in categories.ts; unknown presets fall back to "ui".
  static constexpr std::array<std::pair<std::string_view, Category>, 25> kMap = {{
      {"jump", Category::Combat},     {"blink", Category::Ui},         {"coin", Category::Pickup},
      {"hit", Category::Combat},      {"explosion", Category::Combat}, {"click", Category::Ui},
      {"powerup", Category::Stinger}, {"gameover", Category::Stinger}, {"laser", Category::Combat},
      {"swoosh", Category::Ambient},  {"footstep", Category::Ambient}, {"alarm", Category::Stinger},
      {"shield", Category::Combat},   {"success", Category::Ui},       {"error", Category::Ui},
      {"menu", Category::Ui},         {"door", Category::Ambient},     {"reload", Category::Combat},
      {"engine", Category::Ambient},  {"blip", Category::Ui},          {"confirm", Category::Ui},
      {"deny", Category::Ui},         {"glitch", Category::Ui},        {"data", Category::Ui},
      {"hologram", Category::Stinger},
  }};
  for (const auto& [id, category] : kMap) {
    if (id == presetId) return category;
  }
  return Category::Ui;
}

}  // namespace makesfx::legacy
