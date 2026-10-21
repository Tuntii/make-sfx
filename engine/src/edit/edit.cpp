#include "edit/edit.hpp"

#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include <optional>
#include <utility>

#include <yyjson.h>

#include "dsp/resample.hpp"
#include "legacy/legacy.hpp"
#include "math/dmath.hpp"
#include "math/sha256.hpp"
#include "render/wav_read.hpp"
#include "util/json_writer.hpp"

namespace makesfx::edit {
namespace {

constexpr std::size_t kMaxOps = 64;
constexpr std::size_t kMaxClips = 512;
constexpr double kNormalizeToleranceLufs = 0.5;

double seconds(const RenderedAudio& a) { return static_cast<double>(a.frames()) / a.sampleRate; }

std::size_t toFrame(double t, double sr, std::size_t limit) {
  if (!(t > 0.0)) return 0;
  return std::min(limit, static_cast<std::size_t>(std::llround(t * sr)));
}

std::vector<float> monoOf(const RenderedAudio& a) {
  if (a.channels.size() == 1) return a.channels[0];
  return legacy::mixDownMono(a.channels[0], a.channels[1]);
}

std::string fmt(double x) {
  JsonWriter w;
  w.exact(x);
  return w.str();
}

// ── Program ─────────────────────────────────────────────────────────────────

enum class Kind { Trim, TrimSilence, Fade, Gain, Normalize, Reverse, Pitch, Speed, Resample, Mono, Slice };

struct Op {
  Kind kind = Kind::Trim;
  std::string path;
  std::optional<double> start, end;   // trim
  double thresholdDb = -60.0;         // trim_silence
  double pad = 0.005;
  double fadeIn = 0.0, fadeOut = 0.0;  // fade
  bool cosine = false;
  std::optional<double> db;                     // gain
  std::optional<legacy::Category> category;     // normalize: one of category, lufs, peak_db
  std::optional<double> lufs, peakDb;
  double factor = 1.0;                           // pitch, speed
  std::optional<double> semitones, speed, sampleRate;
  std::optional<std::vector<double>> at;        // slice: times or onsets
  std::optional<OnsetOptions> onsets;
};

using Field = std::function<void(std::string_view, yyjson_val*, const std::string&)>;

class Parser {
public:
  explicit Parser(Diagnostics& d) : d_(d) {}

  void error(const std::string& path, std::string code, std::string message, std::string hint = {}) {
    d_.push_back({Severity::Error, std::move(code), path, std::move(message), std::move(hint)});
  }

  // Calls `field` for each key of `obj`; keys outside `allowed` are errors.
  void fields(yyjson_val* obj, const std::string& path, std::initializer_list<std::string_view> allowed,
              const Field& field) {
    yyjson_obj_iter it = yyjson_obj_iter_with(obj);
    yyjson_val* key = nullptr;
    while ((key = yyjson_obj_iter_next(&it)) != nullptr) {
      const std::string_view name(yyjson_get_str(key), yyjson_get_len(key));
      const std::string child = path + "/" + std::string(name);
      if (std::find(allowed.begin(), allowed.end(), name) == allowed.end()) {
        std::string list;
        for (const auto a : allowed) list += (list.empty() ? "" : ", ") + std::string(a);
        error(child, "E_UNKNOWN_FIELD", "unknown field \"" + std::string(name) + "\"", "allowed: " + list);
        continue;
      }
      field(name, yyjson_obj_iter_get_val(key), child);
    }
  }

  bool number(yyjson_val* v, const std::string& path, double lo, double hi, double& out) {
    if (!yyjson_is_num(v) || !std::isfinite(yyjson_get_num(v))) {
      error(path, "E_TYPE", "expected a number");
      return false;
    }
    const double x = yyjson_get_num(v);
    if (x < lo || x > hi) {
      error(path, "E_RANGE", "must be within " + fmt(lo) + ".." + fmt(hi));
      return false;
    }
    out = x;
    return true;
  }

  void number(yyjson_val* v, const std::string& path, double lo, double hi, std::optional<double>& out) {
    double x = 0.0;
    if (number(v, path, lo, hi, x)) out = x;
  }

  OnsetOptions onsetOptions(yyjson_val* v, const std::string& path) {
    OnsetOptions o;
    if (yyjson_is_bool(v)) {
      if (!yyjson_get_bool(v)) error(path, "E_RANGE", "use true or an options object");
      return o;
    }
    if (!yyjson_is_obj(v)) {
      error(path, "E_TYPE", "expected true or an object");
      return o;
    }
    fields(v, path, {"threshold_db", "rise_db", "min_gap", "pre_roll"},
           [&](std::string_view k, yyjson_val* x, const std::string& p) {
             if (k == "threshold_db") number(x, p, -120.0, 0.0, o.thresholdDb);
             else if (k == "rise_db") number(x, p, 1.0, 60.0, o.riseDb);
             else if (k == "min_gap") number(x, p, 0.01, 10.0, o.minGap);
             else number(x, p, 0.0, 0.1, o.preRoll);
           });
    return o;
  }

  std::optional<Op> op(yyjson_val* v, const std::string& path) {
    if (!yyjson_is_obj(v)) {
      error(path, "E_TYPE", "expected an object");
      return std::nullopt;
    }
    yyjson_val* nameVal = yyjson_obj_get(v, "op");
    const std::string_view name =
        yyjson_is_str(nameVal) ? std::string_view(yyjson_get_str(nameVal), yyjson_get_len(nameVal)) : "";
    Op o;
    o.path = path;
    const auto parse = [&](Kind kind, std::initializer_list<std::string_view> allowed, const Field& field) {
      o.kind = kind;
      fields(v, path, allowed, [&](std::string_view k, yyjson_val* x, const std::string& p) {
        if (k != "op") field(k, x, p);
      });
    };
    const std::size_t before = d_.size();

    if (name == "trim") {
      parse(Kind::Trim, {"op", "start", "end"}, [&](std::string_view k, yyjson_val* x, const std::string& p) {
        number(x, p, 0.0, 1e6, k == "start" ? o.start : o.end);
      });
      if (o.start && o.end && *o.end <= *o.start) error(path + "/end", "E_RANGE", "end must be after start");
    } else if (name == "trim_silence") {
      parse(Kind::TrimSilence, {"op", "threshold_db", "pad"},
            [&](std::string_view k, yyjson_val* x, const std::string& p) {
              if (k == "threshold_db") number(x, p, -120.0, 0.0, o.thresholdDb);
              else number(x, p, 0.0, 1.0, o.pad);
            });
    } else if (name == "fade") {
      parse(Kind::Fade, {"op", "in", "out", "curve"}, [&](std::string_view k, yyjson_val* x, const std::string& p) {
        if (k == "in") number(x, p, 0.0, 600.0, o.fadeIn);
        else if (k == "out") number(x, p, 0.0, 600.0, o.fadeOut);
        else {
          const std::string_view c = yyjson_is_str(x) ? std::string_view(yyjson_get_str(x), yyjson_get_len(x)) : "";
          if (c == "cosine") o.cosine = true;
          else if (c != "linear") error(p, "E_ENUM", "unsupported curve", "allowed: linear, cosine");
        }
      });
    } else if (name == "gain") {
      parse(Kind::Gain, {"op", "db"}, [&](std::string_view, yyjson_val* x, const std::string& p) {
        number(x, p, -60.0, 60.0, o.db);
      });
      if (!o.db && d_.size() == before) error(path + "/db", "E_REQUIRED", "db is required");
    } else if (name == "normalize") {
      parse(Kind::Normalize, {"op", "category", "lufs", "peak_db"},
            [&](std::string_view k, yyjson_val* x, const std::string& p) {
              if (k == "lufs") number(x, p, -60.0, 0.0, o.lufs);
              else if (k == "peak_db") number(x, p, -60.0, 0.0, o.peakDb);
              else {
                legacy::Category c{};
                if (yyjson_is_str(x) && legacy::parseCategory(yyjson_get_str(x), c)) o.category = c;
                else error(p, "E_ENUM", "unsupported category", "allowed: ui, combat, pickup, ambient, stinger");
              }
            });
      const int targets = (o.category ? 1 : 0) + (o.lufs ? 1 : 0) + (o.peakDb ? 1 : 0);
      if (targets != 1 && d_.size() == before) {
        error(path, "E_REQUIRED", "give exactly one of category, lufs, peak_db");
      }
    } else if (name == "reverse" || name == "mono") {
      parse(name == "reverse" ? Kind::Reverse : Kind::Mono, {"op"},
            [](std::string_view, yyjson_val*, const std::string&) {});
    } else if (name == "pitch") {
      parse(Kind::Pitch, {"op", "semitones"}, [&](std::string_view, yyjson_val* x, const std::string& p) {
        number(x, p, -48.0, 48.0, o.semitones);
      });
      if (!o.semitones && d_.size() == before) error(path + "/semitones", "E_REQUIRED", "semitones is required");
      if (o.semitones) o.factor = dmath::exp2(*o.semitones / 12.0);
    } else if (name == "speed") {
      parse(Kind::Speed, {"op", "factor"}, [&](std::string_view, yyjson_val* x, const std::string& p) {
        number(x, p, 0.25, 4.0, o.speed);
      });
      if (!o.speed && d_.size() == before) error(path + "/factor", "E_REQUIRED", "factor is required");
      if (o.speed) o.factor = *o.speed;
    } else if (name == "resample") {
      parse(Kind::Resample, {"op", "sample_rate"}, [&](std::string_view, yyjson_val* x, const std::string& p) {
        number(x, p, 8000.0, 192000.0, o.sampleRate);
      });
      if (!o.sampleRate && d_.size() == before) error(path + "/sample_rate", "E_REQUIRED", "sample_rate is required");
    } else if (name == "slice") {
      parse(Kind::Slice, {"op", "at", "onsets"}, [&](std::string_view k, yyjson_val* x, const std::string& p) {
        if (k == "onsets") {
          o.onsets = onsetOptions(x, p);
          return;
        }
        if (!yyjson_is_arr(x) || yyjson_arr_size(x) > kMaxClips - 1) {
          error(p, "E_TYPE", "expected an array of up to " + std::to_string(kMaxClips - 1) + " times in seconds");
          return;
        }
        std::vector<double> times;
        std::size_t i = 0;
        yyjson_val* t = nullptr;
        yyjson_arr_iter it = yyjson_arr_iter_with(x);
        while ((t = yyjson_arr_iter_next(&it)) != nullptr) {
          double s = 0.0;
          if (number(t, p + "/" + std::to_string(i++), 0.0, 1e6, s)) times.push_back(s);
        }
        o.at = std::move(times);
      });
      if ((o.at.has_value() == o.onsets.has_value()) && d_.size() == before) {
        error(path, "E_REQUIRED", "give exactly one of at, onsets");
      }
    } else {
      error(path + "/op", "E_ENUM", "unknown op \"" + std::string(name) + "\"",
            "allowed: trim, trim_silence, slice, fade, gain, normalize, reverse, pitch, speed, resample, mono");
      return std::nullopt;
    }
    if (d_.size() != before) return std::nullopt;
    return o;
  }

private:
  Diagnostics& d_;
};

Result<std::vector<Op>> parseProgram(std::string_view json) {
  yyjson_read_err err{};
  yyjson_doc* doc = yyjson_read_opts(const_cast<char*>(json.data()), json.size(), 0, nullptr, &err);
  if (doc == nullptr) {
    return Result<std::vector<Op>>::failure(Diagnostic{
        Severity::Error, "E_JSON", "", std::string(err.msg ? err.msg : "invalid JSON") + " at byte " + std::to_string(err.pos), {}});
  }
  Diagnostics d;
  Parser p(d);
  std::vector<Op> ops;
  yyjson_val* root = yyjson_doc_get_root(doc);
  if (!yyjson_is_obj(root)) {
    p.error("", "E_TYPE", "expected an object {\"ops\":[...]}");
  } else {
    p.fields(root, "", {"ops"}, [&](std::string_view, yyjson_val* v, const std::string& path) {
      if (!yyjson_is_arr(v) || yyjson_arr_size(v) > kMaxOps) {
        p.error(path, "E_TYPE", "expected an array of up to " + std::to_string(kMaxOps) + " ops");
        return;
      }
      std::size_t i = 0;
      yyjson_val* item = nullptr;
      yyjson_arr_iter it = yyjson_arr_iter_with(v);
      while ((item = yyjson_arr_iter_next(&it)) != nullptr) {
        if (auto op = p.op(item, path + "/" + std::to_string(i++))) ops.push_back(std::move(*op));
      }
    });
    if (yyjson_obj_get(root, "ops") == nullptr) p.error("/ops", "E_REQUIRED", "ops is required");
  }
  yyjson_doc_free(doc);
  if (hasErrors(d)) return Result<std::vector<Op>>::failure(std::move(d));
  return Result<std::vector<Op>>::success(std::move(ops));
}

// ── Operations ──────────────────────────────────────────────────────────────

// Input time of clip time `t`.
double sourceTime(const Clip& c, double t) {
  return c.reversed ? c.sourceEnd - t * c.scale : c.sourceStart + t * c.scale;
}

// The part [from, to) of `c`, in frames.
Clip cut(const Clip& c, std::size_t from, std::size_t to) {
  Clip out;
  out.audio.sampleRate = c.audio.sampleRate;
  out.scale = c.scale;
  out.reversed = c.reversed;
  for (const auto& ch : c.audio.channels) {
    out.audio.channels.emplace_back(ch.begin() + static_cast<std::ptrdiff_t>(from),
                                    ch.begin() + static_cast<std::ptrdiff_t>(to));
  }
  const double sr = c.audio.sampleRate;
  const double a = sourceTime(c, static_cast<double>(from) / sr);
  const double b = sourceTime(c, static_cast<double>(to) / sr);
  out.sourceStart = std::min(a, b);
  out.sourceEnd = std::max(a, b);
  return out;
}

void fade(Clip& c, double inS, double outS, bool cosine) {
  const std::size_t n = c.audio.frames();
  const std::size_t nIn = toFrame(inS, c.audio.sampleRate, n);
  const std::size_t nOut = toFrame(outS, c.audio.sampleRate, n);
  const auto shape = [cosine](double x) { return cosine ? 0.5 - 0.5 * dmath::cos(dmath::kPi * x) : x; };
  for (auto& ch : c.audio.channels) {
    for (std::size_t i = 0; i < nIn; ++i) {
      ch[i] = static_cast<float>(static_cast<double>(ch[i]) * shape(static_cast<double>(i) / static_cast<double>(nIn)));
    }
    for (std::size_t i = 0; i < nOut; ++i) {
      const std::size_t k = n - 1 - i;  // i-th sample from the end
      ch[k] = static_cast<float>(static_cast<double>(ch[k]) * shape(static_cast<double>(i) / static_cast<double>(nOut)));
    }
  }
}

void gain(Clip& c, double g) {
  for (auto& ch : c.audio.channels) {
    for (float& s : ch) s = static_cast<float>(static_cast<double>(s) * g);
  }
}

double truePeak(const RenderedAudio& a) {
  double tp = -std::numeric_limits<double>::infinity();
  for (const auto& ch : a.channels) tp = std::max(tp, legacy::measureTruePeak(ch));
  return tp;
}

double samplePeak(const RenderedAudio& a) {
  double peak = 0.0;
  for (const auto& ch : a.channels) {
    for (const float s : ch) peak = std::max(peak, std::fabs(static_cast<double>(s)));
  }
  return peak;
}

// First and one-past-last frame whose level (any channel) exceeds `threshold`.
std::pair<std::size_t, std::size_t> audibleRange(const RenderedAudio& a, double threshold) {
  const std::size_t n = a.frames();
  std::size_t first = n;
  std::size_t last = 0;
  for (const auto& ch : a.channels) {
    for (std::size_t i = 0; i < n; ++i) {
      if (std::fabs(static_cast<double>(ch[i])) > threshold) {
        first = std::min(first, i);
        last = std::max(last, i + 1);
      }
    }
  }
  return {first, last};
}

void warn(Diagnostics& d, const Op& op, std::string code, std::string message) {
  d.push_back({Severity::Warning, std::move(code), op.path, std::move(message), {}});
}

// Resamples every channel by `ratio` (output/input frames), refusing results over the length limit.
bool stretch(Clip& c, double ratio, const Op& op, Diagnostics& d) {
  const double frames = std::floor(static_cast<double>(c.audio.frames()) * ratio);
  if (frames > kMaxDecodeSeconds * 192000.0 ||
      frames * static_cast<double>(c.audio.channels.size()) > static_cast<double>(kMaxDecodeSamples)) {
    d.push_back({Severity::Error, "E_TOO_LONG", op.path, "result would exceed the edit length limit", {}});
    return false;
  }
  for (auto& ch : c.audio.channels) ch = dsp::resample(ch, ratio);
  return true;
}

void slice(const Clip& c, const Op& op, std::vector<Clip>& out, Diagnostics& d) {
  const double sr = c.audio.sampleRate;
  const std::size_t n = c.audio.frames();
  std::vector<std::size_t> cuts;
  if (op.at) {
    cuts.push_back(0);
    for (const double t : *op.at) {
      const std::size_t f = toFrame(t, sr, n);
      if (f > 0 && f < n) cuts.push_back(f);
    }
  } else {
    for (const double t : detectOnsets(c.audio, *op.onsets)) cuts.push_back(toFrame(t, sr, n));
    if (cuts.empty()) {
      warn(d, op, "W_NO_ONSETS", "no onsets found; the clip is kept whole");
      cuts.push_back(0);
    }
  }
  std::sort(cuts.begin(), cuts.end());
  cuts.erase(std::unique(cuts.begin(), cuts.end()), cuts.end());
  cuts.push_back(n);
  for (std::size_t i = 0; i + 1 < cuts.size(); ++i) {
    if (cuts[i + 1] > cuts[i]) out.push_back(cut(c, cuts[i], cuts[i + 1]));
  }
}

bool apply(const Op& op, Clip& c, Diagnostics& d) {
  const double sr = c.audio.sampleRate;
  const std::size_t n = c.audio.frames();
  switch (op.kind) {
    case Kind::Trim: {
      const std::size_t from = toFrame(op.start.value_or(0.0), sr, n);
      const std::size_t to = op.end ? toFrame(*op.end, sr, n) : n;
      if (to <= from) {
        d.push_back({Severity::Error, "E_EMPTY", op.path,
                     "trim leaves no audio (clip is " + fmt(seconds(c.audio)) + " s long)", {}});
        return false;
      }
      c = cut(c, from, to);
      return true;
    }
    case Kind::TrimSilence: {
      const auto [first, last] = audibleRange(c.audio, dmath::dbToGain(op.thresholdDb));
      if (first >= last) {
        warn(d, op, "W_SILENT", "clip is below the threshold everywhere; left unchanged");
        return true;
      }
      const std::size_t pad = toFrame(op.pad, sr, n);
      c = cut(c, first > pad ? first - pad : 0, std::min(n, last + pad));
      return true;
    }
    case Kind::Fade: fade(c, op.fadeIn, op.fadeOut, op.cosine); return true;
    case Kind::Gain: gain(c, dmath::dbToGain(*op.db)); return true;
    case Kind::Normalize: {
      if (op.peakDb) {
        const double tp = truePeak(c.audio);
        if (!std::isfinite(tp) || tp < -100.0) {
          warn(d, op, "W_SILENT", "clip is silent; left unchanged");
          return true;
        }
        gain(c, dmath::dbToGain(*op.peakDb - tp));
        return true;
      }
      const double target = op.category ? legacy::targetLufs(*op.category) : *op.lufs;
      if (legacy::measureLufs(monoOf(c.audio), sr) < -60.0) {
        warn(d, op, "W_SILENT", "clip is quieter than -60 LUFS; left unchanged");
        return true;
      }
      if (c.audio.channels.size() == 2) {
        legacy::normalizeLoudnessStereoTo(c.audio.channels[0], c.audio.channels[1], target, sr,
                                          kNormalizeToleranceLufs);
      } else {
        c.audio.channels[0] = legacy::normalizeLoudnessTo(c.audio.channels[0], target, sr, kNormalizeToleranceLufs);
      }
      return true;
    }
    case Kind::Reverse:
      for (auto& ch : c.audio.channels) std::reverse(ch.begin(), ch.end());
      c.reversed = !c.reversed;
      return true;
    case Kind::Pitch:
    case Kind::Speed:
      // Varispeed: playing `factor` times faster raises pitch and shortens the clip.
      if (!stretch(c, 1.0 / op.factor, op, d)) return false;
      c.scale *= op.factor;
      return true;
    case Kind::Resample:
      if (!stretch(c, *op.sampleRate / sr, op, d)) return false;
      c.audio.sampleRate = *op.sampleRate;
      return true;
    case Kind::Mono:
      if (c.audio.channels.size() == 2) c.audio.channels = {monoOf(c.audio)};
      return true;
    case Kind::Slice: return true;  // handled by applyEdits
  }
  return true;
}

void writeStats(JsonWriter& w, const RenderedAudio& a) {
  w.key("sample_rate").value(a.sampleRate);
  w.key("channels").value(static_cast<long long>(a.channels.size()));
  w.key("frames").value(static_cast<long long>(a.frames()));
  w.key("duration_s").value(seconds(a));
  w.key("peak_dbfs").value(dmath::gainToDb(samplePeak(a)));
  w.key("true_peak_dbtp").value(truePeak(a));
  const std::vector<float> mono = monoOf(a);
  w.key("lufs").value(legacy::measureLufs(mono, a.sampleRate));
  w.key("integrated_lufs").value(legacy::measureIntegratedLufs(mono, a.sampleRate));
}

}  // namespace

std::vector<double> detectOnsets(const RenderedAudio& audio, const OnsetOptions& o) {
  const double sr = audio.sampleRate;
  const std::size_t n = audio.frames();
  const auto hop = std::max<std::size_t>(1, static_cast<std::size_t>(std::llround(sr * 0.0025)));
  const std::size_t window = 4 * hop;  // 10 ms
  constexpr std::size_t kLookback = 8;  // hops (20 ms)

  // Mean power across channels per sample, then 10 ms RMS level per hop.
  std::vector<double> power(n, 0.0);
  for (const auto& ch : audio.channels) {
    for (std::size_t i = 0; i < n; ++i) power[i] += static_cast<double>(ch[i]) * static_cast<double>(ch[i]);
  }
  for (double& p : power) p /= static_cast<double>(audio.channels.size());
  const std::size_t hops = (n + hop - 1) / hop;
  std::vector<double> level(hops);
  for (std::size_t j = 0; j < hops; ++j) {
    const std::size_t from = j * hop;
    const std::size_t to = std::min(n, from + window);
    double sum = 0.0;
    for (std::size_t i = from; i < to; ++i) sum += power[i];
    level[j] = 10.0 * dmath::log10(sum / static_cast<double>(to - from) + 1e-20);
  }

  std::vector<double> onsets;
  double last = -1e9;
  for (std::size_t j = 0; j < hops; ++j) {
    if (level[j] < o.thresholdDb) continue;
    double before = -200.0;  // silence ahead of the file start
    if (j > 0) {
      before = level[j - 1];
      for (std::size_t k = 2; k <= kLookback && k <= j; ++k) before = std::min(before, level[j - k]);
    }
    if (level[j] - before < o.riseDb) continue;

    // Refine to the first sample at a quarter of the window's peak.
    const std::size_t from = j * hop;
    const std::size_t to = std::min(n, from + window);
    double peak = 0.0;
    for (std::size_t i = from; i < to; ++i) peak = std::max(peak, std::sqrt(power[i]));
    std::size_t at = from;
    while (at < to && std::sqrt(power[at]) < 0.25 * peak) ++at;
    const double t = std::max(0.0, static_cast<double>(at) / sr - o.preRoll);
    if (t - last < o.minGap) continue;
    onsets.push_back(t);
    last = t;
    if (onsets.size() >= kMaxClips) break;
  }
  return onsets;
}

Result<std::string> inspectJson(const RenderedAudio& audio, std::string_view optionsJson) {
  double silenceDb = -60.0;
  OnsetOptions onset;
  if (!optionsJson.empty()) {
    yyjson_doc* doc = yyjson_read(optionsJson.data(), optionsJson.size(), 0);
    if (doc == nullptr) {
      return Result<std::string>::failure(Diagnostic{Severity::Error, "E_JSON", "", "invalid JSON", {}});
    }
    Diagnostics d;
    Parser p(d);
    yyjson_val* root = yyjson_doc_get_root(doc);
    if (!yyjson_is_obj(root)) p.error("", "E_TYPE", "expected an object");
    else {
      p.fields(root, "", {"silence_db", "onsets"}, [&](std::string_view k, yyjson_val* v, const std::string& path) {
        if (k == "silence_db") p.number(v, path, -120.0, 0.0, silenceDb);
        else onset = p.onsetOptions(v, path);
      });
    }
    yyjson_doc_free(doc);
    if (hasErrors(d)) return Result<std::string>::failure(std::move(d));
  }

  const auto [first, last] = audibleRange(audio, dmath::dbToGain(silenceDb));
  const double sr = audio.sampleRate;
  const bool silent = first >= last;
  JsonWriter w;
  w.beginObject();
  writeStats(w, audio);
  w.key("lead_silence_s").value(silent ? seconds(audio) : static_cast<double>(first) / sr);
  w.key("tail_silence_s").value(silent ? seconds(audio) : static_cast<double>(audio.frames() - last) / sr);
  w.key("onsets_s").beginArray();
  for (const double t : detectOnsets(audio, onset)) w.value(t);
  w.endArray();
  w.endObject();
  return Result<std::string>::success(w.str());
}

Result<std::vector<Clip>> applyEdits(const RenderedAudio& input, std::string_view programJson) {
  auto program = parseProgram(programJson);
  if (!program) return Result<std::vector<Clip>>::failure(program.diagnostics());
  if (input.channels.empty() || input.channels.size() > 2 || !(input.sampleRate > 0.0)) {
    return Result<std::vector<Clip>>::failure(
        Diagnostic{Severity::Error, "E_INPUT", "", "input must have 1 or 2 channels and a sample rate", {}});
  }

  Clip whole;
  whole.audio = input;
  whole.sourceEnd = seconds(input);
  std::vector<Clip> clips{std::move(whole)};
  Diagnostics d;
  for (const Op& op : program.value()) {
    std::vector<Clip> next;
    for (Clip& c : clips) {
      if (op.kind == Kind::Slice) {
        slice(c, op, next, d);
      } else {
        if (!apply(op, c, d)) return Result<std::vector<Clip>>::failure(std::move(d));
        next.push_back(std::move(c));
      }
    }
    if (next.size() > kMaxClips) {
      d.push_back({Severity::Error, "E_TOO_MANY", op.path, "more than " + std::to_string(kMaxClips) + " clips", {}});
      return Result<std::vector<Clip>>::failure(std::move(d));
    }
    clips = std::move(next);
  }
  return Result<std::vector<Clip>>::success(std::move(clips), std::move(d));
}

std::string clipsJson(const std::vector<Clip>& clips) {
  JsonWriter w;
  w.beginObject().key("clips").beginArray();
  for (std::size_t i = 0; i < clips.size(); ++i) {
    w.beginObject();
    w.key("index").value(static_cast<long long>(i));
    w.key("source_start_s").value(clips[i].sourceStart);
    w.key("source_end_s").value(clips[i].sourceEnd);
    writeStats(w, clips[i].audio);
    w.endObject();
  }
  w.endArray().endObject();
  return w.str();
}

std::string clipsSha256(const std::vector<Clip>& clips) {
  Sha256 h;
  for (const Clip& c : clips) {
    std::vector<float> frame(c.audio.channels.size());
    for (std::size_t i = 0; i < c.audio.frames(); ++i) {
      for (std::size_t ch = 0; ch < frame.size(); ++ch) frame[ch] = c.audio.channels[ch][i];
      h.updateFloatsLE(frame);
    }
  }
  return h.finishHex();
}

}  // namespace makesfx::edit
