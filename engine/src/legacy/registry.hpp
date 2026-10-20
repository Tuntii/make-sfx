#pragma once

#include <span>
#include <string_view>

#include "util/json_writer.hpp"

// Parameter registry of the legacy `sfx` sound (SoundConfig, make-sfx 1.x
// semantics): ranges, defaults, UI labels and AI hints. make-sfx-core generates
// its TS parameter tables and the MCP `sfx_get_parameters` listing from it
// (through msfx_parameters_json); game engine inspectors read the same data.

namespace makesfx::legacy {

struct SfxParamSpec {
  // SoundConfig path: "params.volume", "fx.reverbMix", "oscillators[].mix",
  // "oscillators[].params.shape", "modulators[].rate".
  std::string_view path;
  std::string_view group;
  // Layer and LFO entries use "{n}" for the 1-based slot number shown in UIs
  // (OSC2–OSC4, LFO1–LFO4).
  std::string_view label;
  std::string_view labelTr;
  double min;
  double max;
  double step;
  double defaultValue;
  std::string_view unit;  // empty when unitless
  std::string_view description;
  std::string_view aiHint;
};

std::span<const SfxParamSpec> sfxParameters() noexcept;

// {"groups":[...],"waveShapes":[...],"modulatorTargets":[...],"params":[...]}
void writeSfxRegistry(JsonWriter& w);

}  // namespace makesfx::legacy
