#pragma once

#include <cstdint>
#include <span>

#include "makesfx/result.hpp"
#include "render/report.hpp"

namespace makesfx {

// Longest input accepted (seconds and total samples), so a crafted header or a
// huge file cannot make the engine allocate gigabytes.
inline constexpr double kMaxDecodeSeconds = 600.0;
inline constexpr std::uint64_t kMaxDecodeSamples = 64ull * 1024 * 1024;

struct DecodedWav {
  RenderedAudio audio;     // float samples in [-1, 1], one vector per channel (1 or 2)
  int bitsPerSample = 0;   // of the source file
  bool isFloat = false;
};

// RIFF/WAVE: PCM 8/16/24/32-bit, IEEE float 32/64-bit, WAVE_FORMAT_EXTENSIBLE,
// mono or stereo, 8–384 kHz. Unknown chunks are skipped. A data chunk cut short
// by the end of the file is decoded as far as it goes (warning W_TRUNCATED);
// non-finite float samples become 0 (warning W_NON_FINITE).
Result<DecodedWav> decodeWav(std::span<const std::uint8_t> bytes);

}  // namespace makesfx
