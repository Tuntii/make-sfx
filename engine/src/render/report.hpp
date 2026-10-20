#pragma once

#include <optional>
#include <string>
#include <vector>

#include "render/wav.hpp"

namespace makesfx {

// Rendered PCM, non-interleaved, one vector per channel (1 or 2).
struct RenderedAudio {
  double sampleRate = 48000.0;
  std::vector<std::vector<float>> channels;
  std::optional<std::string> category;

  std::size_t frames() const noexcept { return channels.empty() ? 0 : channels.front().size(); }
};

// SHA-256 over interleaved float32 little-endian samples (spec §12.5 pcm_sha256).
std::string pcmSha256(const RenderedAudio& audio);

// Render report JSON (spec §12.5): format, duration, loudness, hash.
std::string renderReportJson(const RenderedAudio& audio);

std::vector<std::uint8_t> encodeWav(const RenderedAudio& audio, const WavFormat& format);

}  // namespace makesfx
