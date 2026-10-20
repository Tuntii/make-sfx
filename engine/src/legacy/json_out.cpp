#include <utility>

#include "legacy/legacy.hpp"
#include "util/json_writer.hpp"

// Legacy types → JSON in the TS shape. Only fields that are set are written,
// so "undefined" survives the round trip; numbers are written exactly.

namespace makesfx::legacy {
namespace {

template <class T>
using Fields = std::initializer_list<std::pair<const char*, Opt T::*>>;

template <class T>
void numbers(JsonWriter& w, const T& v, Fields<T> fields) {
  for (const auto& [name, member] : fields) {
    if (v.*member) w.key(name).exact(*(v.*member));
  }
}

void flag(JsonWriter& w, const char* name, const std::optional<bool>& v) {
  if (v) w.key(name).value(*v);
}

void write(JsonWriter& w, const SoundParams& p) {
  w.beginObject();
  numbers<SoundParams>(w, p,
                       {{"volume", &SoundParams::volume},
                        {"randomness", &SoundParams::randomness},
                        {"frequency", &SoundParams::frequency},
                        {"attack", &SoundParams::attack},
                        {"sustain", &SoundParams::sustain},
                        {"release", &SoundParams::release},
                        {"shape", &SoundParams::shape},
                        {"shapeCurve", &SoundParams::shapeCurve},
                        {"pulseWidth", &SoundParams::pulseWidth},
                        {"slide", &SoundParams::slide},
                        {"deltaSlide", &SoundParams::deltaSlide},
                        {"pitchJump", &SoundParams::pitchJump},
                        {"pitchJumpTime", &SoundParams::pitchJumpTime},
                        {"repeatTime", &SoundParams::repeatTime},
                        {"noise", &SoundParams::noise},
                        {"modulation", &SoundParams::modulation},
                        {"bitCrush", &SoundParams::bitCrush},
                        {"delay", &SoundParams::delay},
                        {"sustainVolume", &SoundParams::sustainVolume},
                        {"decay", &SoundParams::decay},
                        {"tremolo", &SoundParams::tremolo},
                        {"filter", &SoundParams::filter}});
  w.endObject();
}

void write(JsonWriter& w, const FxParams& f) {
  w.beginObject();
  numbers<FxParams>(w, f,
                    {{"reverbMix", &FxParams::reverbMix},
                     {"reverbDecay", &FxParams::reverbDecay},
                     {"delayTime", &FxParams::delayTime},
                     {"delayMix", &FxParams::delayMix},
                     {"delayFeedback", &FxParams::delayFeedback},
                     {"eqLow", &FxParams::eqLow},
                     {"eqMid", &FxParams::eqMid},
                     {"eqHigh", &FxParams::eqHigh},
                     {"compression", &FxParams::compression},
                     {"saturation", &FxParams::saturation},
                     {"stereoWidth", &FxParams::stereoWidth},
                     {"limiter", &FxParams::limiter}});
  w.endObject();
}

void write(JsonWriter& w, const MasterParams& m) {
  w.beginObject();
  numbers<MasterParams>(w, m,
                        {{"duration", &MasterParams::duration},
                         {"durationScale", &MasterParams::durationScale},
                         {"tail", &MasterParams::tail},
                         {"fadeIn", &MasterParams::fadeIn},
                         {"fadeOut", &MasterParams::fadeOut}});
  w.endObject();
}

void write(JsonWriter& w, const OscillatorLayer& l) {
  w.beginObject();
  flag(w, "enabled", l.enabled);
  numbers<OscillatorLayer>(
      w, l, {{"mix", &OscillatorLayer::mix}, {"detune", &OscillatorLayer::detune}, {"delay", &OscillatorLayer::delay}});
  if (l.params) write(w.key("params"), *l.params);
  w.endObject();
}

const char* toString(ModTarget t) {
  switch (t) {
    case ModTarget::Amplitude: return "amplitude";
    case ModTarget::Pitch: return "pitch";
    case ModTarget::Filter: return "filter";
    case ModTarget::Pan: return "pan";
  }
  return "amplitude";
}

void write(JsonWriter& w, const ModulatorConfig& m) {
  w.beginObject();
  flag(w, "enabled", m.enabled);
  if (m.target) w.key("target").value(toString(*m.target));
  numbers<ModulatorConfig>(w, m,
                           {{"rate", &ModulatorConfig::rate},
                            {"depth", &ModulatorConfig::depth},
                            {"shape", &ModulatorConfig::shape},
                            {"phase", &ModulatorConfig::phase}});
  w.endObject();
}

void write(JsonWriter& w, const TextureParams& t) {
  w.beginObject();
  numbers<TextureParams>(w, t,
                         {{"chorus", &TextureParams::chorus},
                          {"phaser", &TextureParams::phaser},
                          {"crackle", &TextureParams::crackle},
                          {"subMix", &TextureParams::subMix},
                          {"subOctave", &TextureParams::subOctave},
                          {"transient", &TextureParams::transient},
                          {"flutter", &TextureParams::flutter},
                          {"gate", &TextureParams::gate},
                          {"grain", &TextureParams::grain},
                          {"ringMod", &TextureParams::ringMod},
                          {"wow", &TextureParams::wow}});
  w.endObject();
}

const char* toString(VoiceWave wave) {
  switch (wave) {
    case VoiceWave::Sine: return "sine";
    case VoiceWave::Triangle: return "triangle";
    case VoiceWave::Saw: return "saw";
    case VoiceWave::Square: return "square";
    case VoiceWave::Noise: return "noise";
  }
  return "sine";
}

const char* toString(VoiceFilterType type) {
  switch (type) {
    case VoiceFilterType::Lowpass: return "lowpass";
    case VoiceFilterType::Highpass: return "highpass";
    case VoiceFilterType::Bandpass: return "bandpass";
  }
  return "lowpass";
}

void write(JsonWriter& w, const VoiceOsc& o) {
  w.beginObject();
  flag(w, "enabled", o.enabled);
  if (o.wave) w.key("wave").value(toString(*o.wave));
  numbers<VoiceOsc>(w, o,
                    {{"coarse", &VoiceOsc::coarse},
                     {"fine", &VoiceOsc::fine},
                     {"level", &VoiceOsc::level},
                     {"pulseWidth", &VoiceOsc::pulseWidth}});
  w.endObject();
}

void write(JsonWriter& w, const VoiceAdsr& a) {
  w.beginObject();
  numbers<VoiceAdsr>(w, a,
                     {{"attack", &VoiceAdsr::attack},
                      {"decay", &VoiceAdsr::decay},
                      {"sustain", &VoiceAdsr::sustain},
                      {"release", &VoiceAdsr::release}});
  w.endObject();
}

void write(JsonWriter& w, const VoicePatch& v) {
  w.beginObject();
  w.key("frequency").exact(v.frequency);
  if (v.volume) w.key("volume").exact(*v.volume);
  write(w.key("osc1"), v.osc1);
  if (v.osc2) write(w.key("osc2"), *v.osc2);
  if (v.osc3) write(w.key("osc3"), *v.osc3);
  write(w.key("amp"), v.amp);
  if (v.filter) {
    w.key("filter").beginObject();
    if (v.filter->type) w.key("type").value(toString(*v.filter->type));
    numbers<VoiceFilter>(w, *v.filter,
                         {{"cutoff", &VoiceFilter::cutoff},
                          {"resonance", &VoiceFilter::resonance},
                          {"envAmount", &VoiceFilter::envAmount}});
    if (v.filter->adsr) write(w.key("adsr"), *v.filter->adsr);
    w.endObject();
  }
  if (v.unison) {
    w.key("unison").beginObject();
    numbers<VoiceUnison>(w, *v.unison,
                         {{"voices", &VoiceUnison::voices},
                          {"detune", &VoiceUnison::detune},
                          {"blend", &VoiceUnison::blend}});
    w.endObject();
  }
  if (v.notes) {
    w.key("notes").beginArray();
    for (const VoiceNote& n : *v.notes) {
      w.beginObject();
      w.key("time").exact(n.time);
      w.key("gate").exact(n.gate);
      if (n.frequency) w.key("frequency").exact(*n.frequency);
      if (n.transpose) w.key("transpose").exact(*n.transpose);
      w.endObject();
    }
    w.endArray();
  }
  if (v.gate) w.key("gate").exact(*v.gate);
  w.endObject();
}

template <class T>
void writeArray(JsonWriter& w, const char* name, const std::optional<std::vector<T>>& items) {
  if (!items) return;
  w.key(name).beginArray();
  for (const T& item : *items) write(w, item);
  w.endArray();
}

}  // namespace

std::string toJson(const SoundParams& params) {
  JsonWriter w;
  write(w, params);
  return w.str();
}

std::string toJson(const VoicePatch& voice) {
  JsonWriter w;
  write(w, voice);
  return w.str();
}

std::string toJson(const SoundConfig& c) {
  JsonWriter w;
  w.beginObject();
  write(w.key("params"), c.params);
  if (c.fx) write(w.key("fx"), *c.fx);
  if (c.master) write(w.key("master"), *c.master);
  writeArray(w, "oscillators", c.oscillators);
  writeArray(w, "modulators", c.modulators);
  if (c.texture) write(w.key("texture"), *c.texture);
  if (c.voice) write(w.key("voice"), *c.voice);
  if (c.category) w.key("category").value(toString(*c.category));
  if (c.seed) w.key("seed").exact(*c.seed);
  w.endObject();
  return w.str();
}

}  // namespace makesfx::legacy
