#include "render/wav_read.hpp"

#include <cmath>
#include <cstring>
#include <string>

namespace makesfx {
namespace {

constexpr std::uint16_t kFormatPcm = 1;
constexpr std::uint16_t kFormatFloat = 3;
constexpr std::uint16_t kFormatExtensible = 0xfffe;

std::uint16_t u16(const std::uint8_t* p) { return static_cast<std::uint16_t>(p[0] | (p[1] << 8)); }

std::uint32_t u32(const std::uint8_t* p) {
  return static_cast<std::uint32_t>(p[0]) | (static_cast<std::uint32_t>(p[1]) << 8) |
         (static_cast<std::uint32_t>(p[2]) << 16) | (static_cast<std::uint32_t>(p[3]) << 24);
}

bool tagIs(const std::uint8_t* p, const char* tag) { return std::memcmp(p, tag, 4) == 0; }

Result<DecodedWav> fail(std::string code, std::string message, std::string hint = {}) {
  return Result<DecodedWav>::failure(
      Diagnostic{Severity::Error, std::move(code), "", std::move(message), std::move(hint)});
}

// One sample at `p` as a float in [-1, 1].
float readSample(const std::uint8_t* p, int bits, bool isFloat) {
  if (isFloat) {
    if (bits == 32) {
      const std::uint32_t raw = u32(p);
      float f;
      std::memcpy(&f, &raw, sizeof f);
      return f;
    }
    const std::uint64_t raw = static_cast<std::uint64_t>(u32(p)) | (static_cast<std::uint64_t>(u32(p + 4)) << 32);
    double d;
    std::memcpy(&d, &raw, sizeof d);
    return static_cast<float>(d);
  }
  // Symmetric scale, as encodeWav() writes: ±(2^(bits-1) - 1) is ±1, and the
  // one extra negative code clamps to -1.
  double v = 0.0;
  switch (bits) {
    case 8: v = (static_cast<int>(p[0]) - 128) / 127.0; break;
    case 16: v = static_cast<std::int16_t>(u16(p)) / 32767.0; break;
    case 24: {
      std::int32_t s = static_cast<std::int32_t>(p[0] | (p[1] << 8) | (p[2] << 16));
      if (s & 0x800000) s -= 0x1000000;
      v = s / 8388607.0;
      break;
    }
    default: v = static_cast<std::int32_t>(u32(p)) / 2147483647.0;
  }
  return static_cast<float>(v < -1.0 ? -1.0 : v);
}

}  // namespace

Result<DecodedWav> decodeWav(std::span<const std::uint8_t> bytes) {
  const std::uint8_t* data = bytes.data();
  const std::size_t size = bytes.size();
  if (size < 12 || !tagIs(data, "RIFF") || !tagIs(data + 8, "WAVE")) {
    return fail("E_WAV", "not a RIFF/WAVE file");
  }

  bool haveFmt = false;
  std::uint16_t format = 0;
  std::uint16_t channels = 0;
  std::uint32_t sampleRate = 0;
  std::uint16_t blockAlign = 0;
  std::uint16_t bits = 0;
  const std::uint8_t* pcm = nullptr;
  std::size_t pcmBytes = 0;
  Diagnostics warnings;

  // Chunks are word aligned: an odd-sized chunk is followed by a pad byte.
  std::size_t pos = 12;
  while (pos + 8 <= size) {
    const std::uint8_t* chunk = data + pos;
    const std::size_t chunkSize = u32(chunk + 4);
    const std::size_t body = pos + 8;
    const std::size_t available = size - body;
    if (tagIs(chunk, "fmt ")) {
      if (chunkSize < 16 || available < 16) return fail("E_WAV", "fmt chunk is too short");
      format = u16(data + body);
      channels = u16(data + body + 2);
      sampleRate = u32(data + body + 4);
      blockAlign = u16(data + body + 12);
      bits = u16(data + body + 14);
      if (format == kFormatExtensible) {
        if (chunkSize < 40 || available < 40) return fail("E_WAV", "WAVE_FORMAT_EXTENSIBLE fmt chunk is too short");
        format = u16(data + body + 24);  // first two bytes of the SubFormat GUID
      }
      haveFmt = true;
    } else if (tagIs(chunk, "data")) {
      pcm = data + body;
      pcmBytes = chunkSize;
      if (chunkSize > available) {
        pcmBytes = available;
        warnings.push_back({Severity::Warning, "W_TRUNCATED", "", "data chunk ends early; decoded what is there", {}});
      }
      break;  // nothing after the samples is needed
    }
    if (chunkSize > available) break;
    pos = body + chunkSize + (chunkSize & 1);
  }

  if (!haveFmt) return fail("E_WAV", "missing fmt chunk");
  if (pcm == nullptr) return fail("E_WAV", "missing data chunk");
  const bool isFloat = format == kFormatFloat;
  if (format != kFormatPcm && !isFloat) {
    return fail("E_UNSUPPORTED", "unsupported WAV encoding " + std::to_string(format),
                "use PCM (8/16/24/32-bit) or IEEE float (32/64-bit)");
  }
  if (isFloat ? (bits != 32 && bits != 64) : (bits != 8 && bits != 16 && bits != 24 && bits != 32)) {
    return fail("E_UNSUPPORTED", std::to_string(bits) + "-bit " + (isFloat ? "float" : "PCM") + " is not supported");
  }
  if (channels < 1 || channels > 2) {
    return fail("E_UNSUPPORTED", std::to_string(channels) + " channels", "mono and stereo files are supported");
  }
  if (sampleRate < 8000 || sampleRate > 384000) {
    return fail("E_UNSUPPORTED", "sample rate " + std::to_string(sampleRate) + " Hz", "8000–384000 Hz is supported");
  }
  const std::size_t bytesPerSample = bits / 8u;
  if (blockAlign != bytesPerSample * channels) return fail("E_WAV", "block align does not match the format");

  const std::size_t frames = pcmBytes / blockAlign;
  if (static_cast<double>(frames) > kMaxDecodeSeconds * sampleRate ||
      static_cast<std::uint64_t>(frames) * channels > kMaxDecodeSamples) {
    return fail("E_TOO_LONG", "audio is longer than the edit limit",
                "inputs up to " + std::to_string(static_cast<int>(kMaxDecodeSeconds)) + " s are accepted");
  }

  DecodedWav out;
  out.bitsPerSample = bits;
  out.isFloat = isFloat;
  out.audio.sampleRate = sampleRate;
  out.audio.channels.assign(channels, std::vector<float>(frames));
  bool nonFinite = false;
  for (std::size_t i = 0; i < frames; ++i) {
    for (std::size_t c = 0; c < channels; ++c) {
      float v = readSample(pcm + i * blockAlign + c * bytesPerSample, bits, isFloat);
      if (!std::isfinite(v)) {
        v = 0.0f;
        nonFinite = true;
      }
      out.audio.channels[c][i] = v;
    }
  }
  if (nonFinite) warnings.push_back({Severity::Warning, "W_NON_FINITE", "", "NaN/Inf samples were replaced with 0", {}});
  return Result<DecodedWav>::success(std::move(out), std::move(warnings));
}

}  // namespace makesfx
