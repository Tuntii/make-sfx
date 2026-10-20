#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace makesfx {

enum class SampleFormat { Pcm16, Pcm24, Float32 };

struct WavFormat {
  std::uint32_t sampleRate = 48000;
  SampleFormat format = SampleFormat::Pcm24;
  // TPDF dither for integer formats; driven by a seeded RNG so it stays deterministic.
  bool dither = true;
  std::uint64_t ditherSeed = 0;
};

// Encodes non-interleaved channels (1 or 2) of `frames` samples each into a
// RIFF/WAVE file. Integer formats scale symmetrically by 2^(bits-1) - 1, clamp,
// and round half to even (spec §5.2). Float32 uses WAVE_FORMAT_IEEE_FLOAT with
// a `fact` chunk. Returns an empty vector on invalid input.
std::vector<std::uint8_t> encodeWav(std::span<const float* const> channels, std::size_t frames,
                                    const WavFormat& format);

// Exposed for tests.
double roundHalfEven(double x) noexcept;

}  // namespace makesfx
