#include <cmath>
#include <functional>
#include <string>
#include <utility>

#include <yyjson.h>

#include "legacy/legacy.hpp"

// JSON → legacy SoundConfig. Strict: unknown keys, wrong types, nulls and
// non-finite numbers are reported with JSON Pointer paths, all at once.

namespace makesfx::legacy {
namespace {

std::string pointerEscape(std::string_view key) {
  std::string out;
  for (const char c : key) {
    if (c == '~') out += "~0";
    else if (c == '/') out += "~1";
    else out.push_back(c);
  }
  return out;
}

class Reader {
public:
  explicit Reader(Diagnostics& diagnostics) : d_(diagnostics) {}

  void error(const std::string& path, std::string code, std::string message, std::string hint = {}) {
    d_.push_back({Severity::Error, std::move(code), path, std::move(message), std::move(hint)});
  }

  using Handler = std::function<void(yyjson_val*, const std::string&)>;
  using Fields = std::vector<std::pair<std::string_view, Handler>>;

  bool object(yyjson_val* v, const std::string& path, const Fields& fields) {
    if (!yyjson_is_obj(v)) {
      error(path, "E_TYPE", "expected an object");
      return false;
    }
    yyjson_obj_iter it = yyjson_obj_iter_with(v);
    yyjson_val* key = nullptr;
    while ((key = yyjson_obj_iter_next(&it)) != nullptr) {
      const std::string_view name(yyjson_get_str(key), yyjson_get_len(key));
      yyjson_val* value = yyjson_obj_iter_get_val(key);
      const std::string childPath = path + "/" + pointerEscape(name);
      bool known = false;
      for (const auto& [fieldName, handler] : fields) {
        if (fieldName == name) {
          handler(value, childPath);
          known = true;
          break;
        }
      }
      if (!known) {
        std::string allowed;
        for (const auto& field : fields) allowed += (allowed.empty() ? "" : ", ") + std::string(field.first);
        error(childPath, "E_UNKNOWN_FIELD", "unknown field \"" + std::string(name) + "\"", "allowed: " + allowed);
      }
    }
    return true;
  }

  Handler number(Opt& out) {
    return [this, &out](yyjson_val* v, const std::string& path) {
      if (!yyjson_is_num(v)) {
        error(path, "E_TYPE", "expected a number");
        return;
      }
      const double x = yyjson_get_num(v);
      if (!std::isfinite(x)) {
        error(path, "E_TYPE", "expected a finite number");
        return;
      }
      out = x;
    };
  }

  Handler requiredNumber(double& out) {
    return [this, &out](yyjson_val* v, const std::string& path) {
      Opt tmp;
      number(tmp)(v, path);
      if (tmp) out = *tmp;
    };
  }

  Handler boolean(std::optional<bool>& out) {
    return [this, &out](yyjson_val* v, const std::string& path) {
      if (!yyjson_is_bool(v)) {
        error(path, "E_TYPE", "expected true or false");
        return;
      }
      out = yyjson_get_bool(v);
    };
  }

  template <class E>
  Handler enumeration(std::optional<E>& out, std::vector<std::pair<std::string_view, E>> values) {
    return [this, &out, values = std::move(values)](yyjson_val* v, const std::string& path) {
      if (yyjson_is_str(v)) {
        const std::string_view s(yyjson_get_str(v), yyjson_get_len(v));
        for (const auto& [name, value] : values) {
          if (name == s) {
            out = value;
            return;
          }
        }
      }
      std::string allowed;
      for (const auto& value : values) allowed += (allowed.empty() ? "" : ", ") + std::string(value.first);
      error(path, "E_ENUM", "unsupported value", "allowed: " + allowed);
    };
  }

  template <class T, class Fn>
  Handler array(std::optional<std::vector<T>>& out, Fn element) {
    return [this, &out, element](yyjson_val* v, const std::string& path) {
      if (!yyjson_is_arr(v)) {
        error(path, "E_TYPE", "expected an array");
        return;
      }
      std::vector<T> items(yyjson_arr_size(v));
      std::size_t i = 0;
      yyjson_val* item = nullptr;
      yyjson_arr_iter it = yyjson_arr_iter_with(v);
      while ((item = yyjson_arr_iter_next(&it)) != nullptr) {
        element(item, path + "/" + std::to_string(i), items[i]);
        ++i;
      }
      out = std::move(items);
    };
  }

private:
  Diagnostics& d_;
};

Reader::Fields soundParamsFields(Reader& r, SoundParams& p) {
  return {{"volume", r.number(p.volume)},
          {"randomness", r.number(p.randomness)},
          {"frequency", r.number(p.frequency)},
          {"attack", r.number(p.attack)},
          {"sustain", r.number(p.sustain)},
          {"release", r.number(p.release)},
          {"shape", r.number(p.shape)},
          {"shapeCurve", r.number(p.shapeCurve)},
          {"pulseWidth", r.number(p.pulseWidth)},
          {"slide", r.number(p.slide)},
          {"deltaSlide", r.number(p.deltaSlide)},
          {"pitchJump", r.number(p.pitchJump)},
          {"pitchJumpTime", r.number(p.pitchJumpTime)},
          {"repeatTime", r.number(p.repeatTime)},
          {"noise", r.number(p.noise)},
          {"modulation", r.number(p.modulation)},
          {"bitCrush", r.number(p.bitCrush)},
          {"delay", r.number(p.delay)},
          {"sustainVolume", r.number(p.sustainVolume)},
          {"decay", r.number(p.decay)},
          {"tremolo", r.number(p.tremolo)},
          {"filter", r.number(p.filter)}};
}

void readSoundParams(Reader& r, yyjson_val* v, const std::string& path, SoundParams& p) {
  r.object(v, path, soundParamsFields(r, p));
}

void readAdsr(Reader& r, yyjson_val* v, const std::string& path, VoiceAdsr& a) {
  r.object(v, path,
           {{"attack", r.number(a.attack)},
            {"decay", r.number(a.decay)},
            {"sustain", r.number(a.sustain)},
            {"release", r.number(a.release)}});
}

void readOsc(Reader& r, yyjson_val* v, const std::string& path, VoiceOsc& o) {
  r.object(v, path,
           {{"enabled", r.boolean(o.enabled)},
            {"wave", r.enumeration<VoiceWave>(o.wave, {{"sine", VoiceWave::Sine},
                                                      {"triangle", VoiceWave::Triangle},
                                                      {"saw", VoiceWave::Saw},
                                                      {"square", VoiceWave::Square},
                                                      {"noise", VoiceWave::Noise}})},
            {"coarse", r.number(o.coarse)},
            {"fine", r.number(o.fine)},
            {"level", r.number(o.level)},
            {"pulseWidth", r.number(o.pulseWidth)}});
}

template <class T, class Fn>
Reader::Handler optionalObject(std::optional<T>& out, Fn read) {
  return [&out, read](yyjson_val* v, const std::string& path) {
    T value{};
    read(v, path, value);
    out = std::move(value);
  };
}

void readVoice(Reader& r, yyjson_val* v, const std::string& path, VoicePatch& patch, bool& hasOsc1) {
  auto adsr = [&r](yyjson_val* x, const std::string& p, VoiceAdsr& a) { readAdsr(r, x, p, a); };
  auto osc = [&r](yyjson_val* x, const std::string& p, VoiceOsc& o) { readOsc(r, x, p, o); };
  r.object(
      v, path,
      {{"frequency", r.requiredNumber(patch.frequency)},
       {"volume", r.number(patch.volume)},
       {"osc1",
        [&](yyjson_val* x, const std::string& p) {
          hasOsc1 = true;
          readOsc(r, x, p, patch.osc1);
        }},
       {"osc2", optionalObject(patch.osc2, osc)},
       {"osc3", optionalObject(patch.osc3, osc)},
       {"amp", [&](yyjson_val* x, const std::string& p) { readAdsr(r, x, p, patch.amp); }},
       {"filter", optionalObject(patch.filter,
                                 [&r, adsr](yyjson_val* x, const std::string& p, VoiceFilter& f) {
                                   r.object(x, p,
                                            {{"type", r.enumeration<VoiceFilterType>(
                                                          f.type, {{"lowpass", VoiceFilterType::Lowpass},
                                                                   {"highpass", VoiceFilterType::Highpass},
                                                                   {"bandpass", VoiceFilterType::Bandpass}})},
                                             {"cutoff", r.number(f.cutoff)},
                                             {"resonance", r.number(f.resonance)},
                                             {"envAmount", r.number(f.envAmount)},
                                             {"adsr", optionalObject(f.adsr, adsr)}});
                                 })},
       {"unison", optionalObject(patch.unison,
                                 [&r](yyjson_val* x, const std::string& p, VoiceUnison& u) {
                                   r.object(x, p,
                                            {{"voices", r.number(u.voices)},
                                             {"detune", r.number(u.detune)},
                                             {"blend", r.number(u.blend)}});
                                 })},
       {"notes", r.array(patch.notes,
                         [&r](yyjson_val* x, const std::string& p, VoiceNote& n) {
                           r.object(x, p,
                                    {{"time", r.requiredNumber(n.time)},
                                     {"gate", r.requiredNumber(n.gate)},
                                     {"frequency", r.number(n.frequency)},
                                     {"transpose", r.number(n.transpose)}});
                         })},
       {"gate", r.number(patch.gate)}});
}

Reader::Handler categoryHandler(Reader& r, std::optional<Category>& out) {
  return r.enumeration<Category>(out, {{"ui", Category::Ui},
                                       {"combat", Category::Combat},
                                       {"pickup", Category::Pickup},
                                       {"ambient", Category::Ambient},
                                       {"stinger", Category::Stinger}});
}

std::string parseError(yyjson_doc*& doc, std::string_view json) {
  yyjson_read_err err{};
  doc = yyjson_read_opts(const_cast<char*>(json.data()), json.size(), 0, nullptr, &err);
  if (doc != nullptr) return {};
  return std::string(err.msg != nullptr ? err.msg : "invalid JSON") + " at byte " + std::to_string(err.pos);
}

}  // namespace

Result<SoundConfig> parseSoundConfig(std::string_view json) {
  yyjson_doc* doc = nullptr;
  if (std::string err = parseError(doc, json); !err.empty()) {
    return Result<SoundConfig>::failure(Diagnostic{Severity::Error, "E_JSON", "", err, {}});
  }
  Diagnostics d;
  Reader r(d);
  SoundConfig cfg;
  yyjson_val* root = yyjson_doc_get_root(doc);
  yyjson_val* params = yyjson_is_obj(root) ? yyjson_obj_get(root, "params") : nullptr;

  if (params != nullptr && yyjson_is_obj(params)) {
    r.object(root, "",
             {{"params", [&](yyjson_val* v, const std::string& p) { readSoundParams(r, v, p, cfg.params); }},
              {"fx", optionalObject(cfg.fx,
                                    [&r](yyjson_val* v, const std::string& p, FxParams& f) {
                                      r.object(v, p,
                                               {{"reverbMix", r.number(f.reverbMix)},
                                                {"reverbDecay", r.number(f.reverbDecay)},
                                                {"delayTime", r.number(f.delayTime)},
                                                {"delayMix", r.number(f.delayMix)},
                                                {"delayFeedback", r.number(f.delayFeedback)},
                                                {"eqLow", r.number(f.eqLow)},
                                                {"eqMid", r.number(f.eqMid)},
                                                {"eqHigh", r.number(f.eqHigh)},
                                                {"compression", r.number(f.compression)},
                                                {"saturation", r.number(f.saturation)},
                                                {"stereoWidth", r.number(f.stereoWidth)},
                                                {"limiter", r.number(f.limiter)}});
                                    })},
              {"master", optionalObject(cfg.master,
                                        [&r](yyjson_val* v, const std::string& p, MasterParams& m) {
                                          r.object(v, p,
                                                   {{"duration", r.number(m.duration)},
                                                    {"durationScale", r.number(m.durationScale)},
                                                    {"tail", r.number(m.tail)},
                                                    {"fadeIn", r.number(m.fadeIn)},
                                                    {"fadeOut", r.number(m.fadeOut)}});
                                        })},
              {"oscillators", r.array(cfg.oscillators,
                                      [&r](yyjson_val* v, const std::string& p, OscillatorLayer& l) {
                                        r.object(v, p,
                                                 {{"enabled", r.boolean(l.enabled)},
                                                  {"mix", r.number(l.mix)},
                                                  {"detune", r.number(l.detune)},
                                                  {"delay", r.number(l.delay)},
                                                  {"params", optionalObject(l.params,
                                                                            [&r](yyjson_val* x, const std::string& q,
                                                                                 SoundParams& sp) {
                                                                              readSoundParams(r, x, q, sp);
                                                                            })}});
                                      })},
              {"modulators", r.array(cfg.modulators,
                                     [&r](yyjson_val* v, const std::string& p, ModulatorConfig& m) {
                                       r.object(v, p,
                                                {{"enabled", r.boolean(m.enabled)},
                                                 {"target", r.enumeration<ModTarget>(
                                                                m.target, {{"amplitude", ModTarget::Amplitude},
                                                                           {"pitch", ModTarget::Pitch},
                                                                           {"filter", ModTarget::Filter},
                                                                           {"pan", ModTarget::Pan}})},
                                                 {"rate", r.number(m.rate)},
                                                 {"depth", r.number(m.depth)},
                                                 {"shape", r.number(m.shape)},
                                                 {"phase", r.number(m.phase)}});
                                     })},
              {"texture", optionalObject(cfg.texture,
                                         [&r](yyjson_val* v, const std::string& p, TextureParams& t) {
                                           r.object(v, p,
                                                    {{"chorus", r.number(t.chorus)},
                                                     {"phaser", r.number(t.phaser)},
                                                     {"crackle", r.number(t.crackle)},
                                                     {"subMix", r.number(t.subMix)},
                                                     {"subOctave", r.number(t.subOctave)},
                                                     {"transient", r.number(t.transient)},
                                                     {"flutter", r.number(t.flutter)},
                                                     {"gate", r.number(t.gate)},
                                                     {"grain", r.number(t.grain)},
                                                     {"ringMod", r.number(t.ringMod)},
                                                     {"wow", r.number(t.wow)}});
                                         })},
              {"voice",
               [&](yyjson_val* v, const std::string& p) {
                 VoicePatch patch;
                 bool hasOsc1 = false;
                 readVoice(r, v, p, patch, hasOsc1);
                 if (!hasOsc1) {
                   r.error(p + "/osc1", "E_REQUIRED", "voice.osc1 is required");
                 }
                 cfg.voice = std::move(patch);
               }},
              {"category", categoryHandler(r, cfg.category)},
              {"seed", r.number(cfg.seed)}});
  } else {
    // A bare SoundParams object, as accepted by renderSound(params).
    readSoundParams(r, root, "", cfg.params);
  }
  yyjson_doc_free(doc);

  if (hasErrors(d)) return Result<SoundConfig>::failure(std::move(d));
  return Result<SoundConfig>::success(std::move(cfg), std::move(d));
}

namespace {

// Shared by render options and bridge options: `extra` adds fields.
template <class T>
Result<T> parseOptions(std::string_view json, T& out, RenderOptions& options,
                       const std::function<void(Reader&, Reader::Fields&)>& extra) {
  if (json.empty()) return Result<T>::success(std::move(out));
  yyjson_doc* doc = nullptr;
  if (std::string err = parseError(doc, json); !err.empty()) {
    return Result<T>::failure(Diagnostic{Severity::Error, "E_JSON", "", err, {}});
  }
  Diagnostics d;
  Reader r(d);
  std::optional<double> sampleRate;
  Reader::Fields fields{{"seed", r.number(options.seed)},
                        {"category", categoryHandler(r, options.category)},
                        {"preset_id",
                         [&](yyjson_val* v, const std::string& p) {
                           if (yyjson_is_str(v)) options.presetId = std::string(yyjson_get_str(v), yyjson_get_len(v));
                           else r.error(p, "E_TYPE", "expected a string");
                         }},
                        {"normalize", r.boolean(options.normalize)},
                        {"sample_rate", r.number(sampleRate)}};
  if (extra) extra(r, fields);
  r.object(yyjson_doc_get_root(doc), "", fields);
  yyjson_doc_free(doc);
  if (sampleRate) {
    if (*sampleRate < 8000.0 || *sampleRate > 192000.0) {
      d.push_back({Severity::Error, "E_OUT_OF_RANGE", "/sample_rate", "sample_rate must be within 8000..192000", {}});
    } else {
      options.sampleRate = *sampleRate;
    }
  }
  if (hasErrors(d)) return Result<T>::failure(std::move(d));
  return Result<T>::success(std::move(out));
}

}  // namespace

Result<RenderOptions> parseRenderOptions(std::string_view json) {
  RenderOptions options;
  return parseOptions<RenderOptions>(json, options, options, {});
}

Result<BridgeOptions> parseBridgeOptions(std::string_view json) {
  BridgeOptions options;
  return parseOptions<BridgeOptions>(json, options, options.render, [&options](Reader& r, Reader::Fields& f) {
    f.emplace_back("factor", r.number(options.factor));
    f.emplace_back("ceiling_dbtp", r.number(options.ceilingDbTp));
    f.emplace_back("tolerance_lufs", r.number(options.toleranceLufs));
    f.emplace_back("gain", r.number(options.gain));
  });
}

}  // namespace makesfx::legacy
