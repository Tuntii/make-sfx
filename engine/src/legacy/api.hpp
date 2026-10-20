#pragma once

#include <string_view>

#include "legacy/legacy.hpp"
#include "render/report.hpp"

namespace makesfx::legacy {

// One call from JSON to rendered audio: parse config + options, render,
// package as RenderedAudio (mono, or left/right when stereo).
Result<RenderedAudio> renderJson(std::string_view configJson, std::string_view optionsJson);

// E_TOO_LONG when `config` would render longer than the 120 s limit; empty otherwise.
Diagnostics checkRenderLength(const SoundConfig& config);

}  // namespace makesfx::legacy
