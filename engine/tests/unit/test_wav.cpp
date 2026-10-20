#include <doctest.h>

#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "render/wav.hpp"

using namespace makesfx;

namespace {

std::uint32_t u32At(const std::vector<std::uint8_t>& b, std::size_t at) {
  return std::uint32_t{b[at]} | (std::uint32_t{b[at + 1]} << 8) | (std::uint32_t{b[at + 2]} << 16) |
         (std::uint32_t{b[at + 3]} << 24);
}

std::uint16_t u16At(const std::vector<std::uint8_t>& b, std::size_t at) {
  return static_cast<std::uint16_t>(b[at] | (b[at + 1] << 8));
}

std::int16_t s16At(const std::vector<std::uint8_t>& b, std::size_t at) {
  return static_cast<std::int16_t>(u16At(b, at));
}

std::string tagAt(const std::vector<std::uint8_t>& b, std::size_t at) {
  return std::string(reinterpret_cast<const char*>(b.data() + at), 4);
}

}  // namespace

TEST_CASE("roundHalfEven") {
  CHECK(roundHalfEven(0.5) == 0.0);
  CHECK(roundHalfEven(1.5) == 2.0);
  CHECK(roundHalfEven(2.5) == 2.0);
  CHECK(roundHalfEven(-0.5) == 0.0);
  CHECK(roundHalfEven(-1.5) == -2.0);
  CHECK(roundHalfEven(-2.5) == -2.0);
  CHECK(roundHalfEven(2.4999) == 2.0);
  CHECK(roundHalfEven(-2.5001) == -3.0);
}

TEST_CASE("16-bit mono PCM header and samples") {
  const std::vector<float> s = {0.0f, 0.5f, -0.5f, 1.0f, -1.0f, 2.0f, -2.0f};
  const float* ch[] = {s.data()};
  WavFormat f;
  f.sampleRate = 44100;
  f.format = SampleFormat::Pcm16;
  f.dither = false;
  const auto b = encodeWav(ch, s.size(), f);

  REQUIRE(b.size() == 44 + s.size() * 2);
  CHECK(tagAt(b, 0) == "RIFF");
  CHECK(u32At(b, 4) == b.size() - 8);
  CHECK(tagAt(b, 8) == "WAVE");
  CHECK(tagAt(b, 12) == "fmt ");
  CHECK(u16At(b, 20) == 1);      // PCM
  CHECK(u16At(b, 22) == 1);      // channels
  CHECK(u32At(b, 24) == 44100);
  CHECK(u32At(b, 28) == 88200);  // byte rate
  CHECK(u16At(b, 32) == 2);      // block align
  CHECK(u16At(b, 34) == 16);
  CHECK(tagAt(b, 36) == "data");
  CHECK(u32At(b, 40) == s.size() * 2);

  CHECK(s16At(b, 44) == 0);
  CHECK(s16At(b, 46) == 16384);   // 0.5 * 32767 = 16383.5 -> even
  CHECK(s16At(b, 48) == -16384);
  CHECK(s16At(b, 50) == 32767);
  CHECK(s16At(b, 52) == -32767);  // symmetric scale
  CHECK(s16At(b, 54) == 32767);   // clamped
  CHECK(s16At(b, 56) == -32767);
}

TEST_CASE("24-bit stereo interleaves and pads odd data") {
  const std::vector<float> l = {1.0f};
  const std::vector<float> r = {-1.0f};
  const float* ch[] = {l.data(), r.data()};
  WavFormat f;
  f.format = SampleFormat::Pcm24;
  f.dither = false;
  const auto b = encodeWav(ch, 1, f);
  REQUIRE(b.size() == 44 + 6);
  CHECK(u16At(b, 22) == 2);
  CHECK(u16At(b, 34) == 24);
  // +8388607 then -8388607
  CHECK(b[44] == 0xff); CHECK(b[45] == 0xff); CHECK(b[46] == 0x7f);
  CHECK(b[47] == 0x01); CHECK(b[48] == 0x00); CHECK(b[49] == 0x80);

  const float* mono[] = {l.data()};
  const auto odd = encodeWav(mono, 1, f);  // 3 data bytes -> 1 pad byte
  CHECK(odd.size() == 44 + 4);
  CHECK(u32At(odd, 40) == 3);
  CHECK(u32At(odd, 4) == odd.size() - 8);
}

TEST_CASE("float32 uses IEEE format with fact chunk") {
  const std::vector<float> s = {0.25f, -0.75f};
  const float* ch[] = {s.data()};
  WavFormat f;
  f.format = SampleFormat::Float32;
  const auto b = encodeWav(ch, s.size(), f);
  CHECK(u16At(b, 20) == 3);
  CHECK(u32At(b, 16) == 18);
  CHECK(tagAt(b, 38) == "fact");
  CHECK(u32At(b, 46) == 2);
  CHECK(tagAt(b, 50) == "data");
  float back = 0.0f;
  std::memcpy(&back, b.data() + 58, 4);
  CHECK(back == 0.25f);
}

TEST_CASE("dither is deterministic per seed") {
  std::vector<float> s(512);
  for (std::size_t i = 0; i < s.size(); ++i) s[i] = static_cast<float>(i) / 1024.0f - 0.25f;
  const float* ch[] = {s.data()};
  WavFormat f;
  f.format = SampleFormat::Pcm16;
  f.dither = true;
  f.ditherSeed = 99;
  const auto a = encodeWav(ch, s.size(), f);
  const auto b = encodeWav(ch, s.size(), f);
  f.ditherSeed = 100;
  const auto c = encodeWav(ch, s.size(), f);
  CHECK(a == b);
  CHECK(a != c);
}

TEST_CASE("invalid input yields empty output") {
  const std::vector<float> s = {0.0f};
  const float* three[] = {s.data(), s.data(), s.data()};
  CHECK(encodeWav(three, 1, WavFormat{}).empty());
  const float* none[] = {nullptr};
  CHECK(encodeWav(none, 1, WavFormat{}).empty());
}
