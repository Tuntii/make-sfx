#pragma once

#include <span>
#include <string>
#include <string_view>

// Parameter registry — the single source of truth for every parameter
// (spec §3.3, §6.4). JSON Schema, TS types, docs and the MCP parameter listing
// are generated from it. M0 ships the descriptor shape and the probe entries;
// instrument and effect parameters join in M1.

namespace makesfx {

enum class ParamUnit { None, Hz, Db, Ms, Seconds, Ratio, Percent, Semitones, Cents, Bool, Enum };
enum class ParamScale { Linear, Log, Db };
enum class SmoothingKind { None, Linear, OnePole };
enum class ParamRate { Audio, Control };

struct ParamDescriptor {
  std::string_view path;
  ParamUnit unit;
  double min;
  double max;
  double defaultValue;
  ParamScale scale;
  SmoothingKind smoothing;
  double smoothingMs;
  ParamRate rate;
  bool modulatable;
  std::string_view description;
};

std::span<const ParamDescriptor> parameterRegistry() noexcept;
const ParamDescriptor* findParameter(std::string_view path) noexcept;

std::string_view toString(ParamUnit unit) noexcept;
std::string_view toString(ParamScale scale) noexcept;
std::string_view toString(SmoothingKind kind) noexcept;
std::string_view toString(ParamRate rate) noexcept;

// {"schema":"makesfx-params/1","params":[...]}
std::string parametersJson();

}  // namespace makesfx
