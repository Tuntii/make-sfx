#include "render/wav.hpp"

#include <bit>
#include <cmath>

#include "math/rng.hpp"

namespace makesfx {
namespace {

constexpr std::uint16_t kFormatPcm = 1;
constexpr std::uint16_t kFormatFloat = 3;
constexpr std::uint64_t kDitherStream = 0x64697468ULL;  // "dith"

class ByteWriter {
public:
  explicit ByteWriter(std::size_t reserve) { bytes_.reserve(reserve); }

  void tag(const char (&fourcc)[5]) {
    for (int i = 0; i < 4; ++i) bytes_.push_back(static_cast<std::uint8_t>(fourcc[i]));
  }
  void u16(std::uint16_t v) { le(v, 2); }
  void u32(std::uint32_t v) { le(v, 4); }
  void le(std::uint64_t v, int count) {
    for (int i = 0; i < count; ++i) bytes_.push_back(static_cast<std::uint8_t>(v >> (8 * i)));
  }

  std::vector<std::uint8_t> take() { return std::move(bytes_); }

private:
  std::vector<std::uint8_t> bytes_;
};

int bitsOf(SampleFormat f) {
  switch (f) {
    case SampleFormat::Pcm16: return 16;
    case SampleFormat::Pcm24: return 24;
    case SampleFormat::Float32: return 32;
  }
  return 0;
}

}  // namespace

double roundHalfEven(double x) noexcept {
  const double r = std::floor(x);
  const double diff = x - r;
  if (diff > 0.5) return r + 1.0;
  if (diff < 0.5) return r;
  return std::fmod(r, 2.0) == 0.0 ? r : r + 1.0;
}

std::vector<std::uint8_t> encodeWav(std::span<const float* const> channels, std::size_t frames,
                                    const WavFormat& format) {
  const std::size_t numChannels = channels.size();
  if (numChannels < 1 || numChannels > 2 || format.sampleRate == 0) return {};
  for (const float* ch : channels) {
    if (ch == nullptr && frames > 0) return {};
  }

  const bool isFloat = format.format == SampleFormat::Float32;
  const int bits = bitsOf(format.format);
  const std::size_t bytesPerSample = static_cast<std::size_t>(bits / 8);
  const std::size_t blockAlign = bytesPerSample * numChannels;
  const std::size_t dataSize = blockAlign * frames;
  const std::size_t fmtSize = isFloat ? 18 : 16;
  const std::size_t factSize = isFloat ? 12 : 0;
  const std::size_t riffSize = 4 + (8 + fmtSize) + factSize + (8 + dataSize);
  if (riffSize > 0xffffffffULL) return {};

  ByteWriter w(8 + riffSize + (dataSize & 1));
  w.tag("RIFF");
  w.u32(static_cast<std::uint32_t>(riffSize + (dataSize & 1)));
  w.tag("WAVE");

  w.tag("fmt ");
  w.u32(static_cast<std::uint32_t>(fmtSize));
  w.u16(isFloat ? kFormatFloat : kFormatPcm);
  w.u16(static_cast<std::uint16_t>(numChannels));
  w.u32(format.sampleRate);
  w.u32(static_cast<std::uint32_t>(format.sampleRate * blockAlign));
  w.u16(static_cast<std::uint16_t>(blockAlign));
  w.u16(static_cast<std::uint16_t>(bits));
  if (isFloat) {
    w.u16(0);  // cbSize
    w.tag("fact");
    w.u32(4);
    w.u32(static_cast<std::uint32_t>(frames));
  }

  w.tag("data");
  w.u32(static_cast<std::uint32_t>(dataSize));

  if (isFloat) {
    for (std::size_t i = 0; i < frames; ++i) {
      for (std::size_t c = 0; c < numChannels; ++c) {
        w.le(std::bit_cast<std::uint32_t>(channels[c][i]), 4);
      }
    }
  } else {
    const double maxValue = std::ldexp(1.0, bits - 1) - 1.0;
    Pcg32 rng(format.ditherSeed, kDitherStream);
    for (std::size_t i = 0; i < frames; ++i) {
      for (std::size_t c = 0; c < numChannels; ++c) {
        double v = static_cast<double>(channels[c][i]);
        if (std::isnan(v)) v = 0.0;
        v *= maxValue;
        if (format.dither) {
          // TPDF, ±1 LSB. Two statements: operand evaluation order in `a() - b()`
          // is unspecified and would differ between compilers.
          const double u1 = rng.uniformDouble();
          const double u2 = rng.uniformDouble();
          v += u1 - u2;
        }
        v = roundHalfEven(v);
        if (v > maxValue) v = maxValue;
        if (v < -maxValue) v = -maxValue;
        const auto q = static_cast<std::int32_t>(v);
        w.le(static_cast<std::uint32_t>(q), static_cast<int>(bytesPerSample));
      }
    }
  }
  if (dataSize & 1) w.le(0, 1);  // RIFF chunks are word aligned
  return w.take();
}

}  // namespace makesfx
