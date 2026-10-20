#include "engine/params.hpp"

#include <array>

#include "legacy/registry.hpp"
#include "util/json_writer.hpp"

namespace makesfx {
namespace {

constexpr std::array kRegistry = {
    ParamDescriptor{"probe.frequency_hz", ParamUnit::Hz, 20.0, 20000.0, 1000.0, ParamScale::Log,
                    SmoothingKind::OnePole, 5.0, ParamRate::Audio, true,
                    "Probe oscillator frequency."},
    ParamDescriptor{"probe.level_db", ParamUnit::Db, -96.0, 0.0, -6.0, ParamScale::Db,
                    SmoothingKind::Linear, 10.0, ParamRate::Control, true,
                    "Probe output level."},
};

}  // namespace

std::span<const ParamDescriptor> parameterRegistry() noexcept { return kRegistry; }

const ParamDescriptor* findParameter(std::string_view path) noexcept {
  for (const ParamDescriptor& p : kRegistry) {
    if (p.path == path) return &p;
  }
  return nullptr;
}

std::string_view toString(ParamUnit unit) noexcept {
  switch (unit) {
    case ParamUnit::None: return "none";
    case ParamUnit::Hz: return "hz";
    case ParamUnit::Db: return "db";
    case ParamUnit::Ms: return "ms";
    case ParamUnit::Seconds: return "s";
    case ParamUnit::Ratio: return "ratio";
    case ParamUnit::Percent: return "percent";
    case ParamUnit::Semitones: return "semitones";
    case ParamUnit::Cents: return "cents";
    case ParamUnit::Bool: return "bool";
    case ParamUnit::Enum: return "enum";
  }
  return "none";
}

std::string_view toString(ParamScale scale) noexcept {
  switch (scale) {
    case ParamScale::Linear: return "linear";
    case ParamScale::Log: return "log";
    case ParamScale::Db: return "db";
  }
  return "linear";
}

std::string_view toString(SmoothingKind kind) noexcept {
  switch (kind) {
    case SmoothingKind::None: return "none";
    case SmoothingKind::Linear: return "linear";
    case SmoothingKind::OnePole: return "one_pole";
  }
  return "none";
}

std::string_view toString(ParamRate rate) noexcept {
  switch (rate) {
    case ParamRate::Audio: return "audio";
    case ParamRate::Control: return "control";
  }
  return "control";
}

std::string parametersJson() {
  JsonWriter w;
  w.beginObject();
  w.key("schema").value("makesfx-params/1");
  w.key("params").beginArray();
  for (const ParamDescriptor& p : kRegistry) {
    w.beginObject();
    w.key("path").value(p.path);
    w.key("unit").value(toString(p.unit));
    w.key("min").value(p.min);
    w.key("max").value(p.max);
    w.key("default").value(p.defaultValue);
    w.key("scale").value(toString(p.scale));
    w.key("smoothing").beginObject();
    w.key("type").value(toString(p.smoothing));
    w.key("ms").value(p.smoothingMs);
    w.endObject();
    w.key("rate").value(toString(p.rate));
    w.key("modulatable").value(p.modulatable);
    w.key("description").value(p.description);
    w.endObject();
  }
  w.endArray();
  legacy::writeSfxRegistry(w.key("sfx"));
  w.endObject();
  return w.str();
}

}  // namespace makesfx
