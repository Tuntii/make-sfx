#include <doctest.h>

#include <cmath>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#include "dsp/resample.hpp"
#include "edit/edit.hpp"
#include "legacy/bridge.hpp"
#include "legacy/legacy.hpp"
#include "math/dmath.hpp"
#include "render/report.hpp"
#include "render/wav.hpp"
#include "render/wav_read.hpp"

using namespace makesfx;

namespace {

std::vector<float> sine(double hz, double sr, double seconds, double amp = 0.5) {
  std::vector<float> x(static_cast<std::size_t>(sr * seconds));
  for (std::size_t i = 0; i < x.size(); ++i) {
    x[i] = static_cast<float>(amp * dmath::sinTurns(hz * static_cast<double>(i) / sr));
  }
  return x;
}

RenderedAudio clip(std::vector<std::vector<float>> channels, double sr) {
  RenderedAudio a;
  a.sampleRate = sr;
  a.channels = std::move(channels);
  return a;
}

// Rising zero crossings per second over the middle of the signal.
double frequencyOf(const std::vector<float>& x, double sr) {
  const std::size_t from = x.size() / 4;
  const std::size_t to = x.size() * 3 / 4;
  int crossings = 0;
  for (std::size_t i = from + 1; i < to; ++i) {
    if (x[i - 1] <= 0.0f && x[i] > 0.0f) ++crossings;
  }
  return crossings / (static_cast<double>(to - from) / sr);
}

double rms(const std::vector<float>& x, std::size_t from, std::size_t to) {
  double sum = 0.0;
  for (std::size_t i = from; i < to; ++i) sum += static_cast<double>(x[i]) * static_cast<double>(x[i]);
  return std::sqrt(sum / static_cast<double>(to - from));
}

// Silence with short decaying 2 kHz bursts at `times` (seconds).
std::vector<float> bursts(const std::vector<double>& times, double sr, double seconds) {
  std::vector<float> x(static_cast<std::size_t>(sr * seconds), 0.0f);
  for (const double t : times) {
    const auto start = static_cast<std::size_t>(t * sr);
    for (std::size_t i = 0; i < static_cast<std::size_t>(0.08 * sr) && start + i < x.size(); ++i) {
      const double env = dmath::exp(-static_cast<double>(i) / (0.015 * sr));
      x[start + i] = static_cast<float>(0.8 * env * dmath::sinTurns(2000.0 * static_cast<double>(i) / sr));
    }
  }
  return x;
}

edit::Clip only(const Result<std::vector<edit::Clip>>& r) {
  REQUIRE(r.ok());
  REQUIRE(r.value().size() == 1);
  return r.value()[0];
}

bool hasDiag(const Diagnostics& d, const std::string& code, const std::string& path) {
  for (const auto& x : d) {
    if (x.code == code && x.path == path) return true;
  }
  return false;
}

// Minimal WAV writer for formats encodeWav() does not produce.
std::vector<std::uint8_t> rawWav(std::uint16_t format, std::uint16_t channels, std::uint32_t sr, std::uint16_t bits,
                                 const std::vector<std::uint8_t>& data, bool extensible = false,
                                 bool junkChunk = false) {
  std::vector<std::uint8_t> out;
  auto u16 = [&](std::uint32_t v) {
    out.push_back(static_cast<std::uint8_t>(v));
    out.push_back(static_cast<std::uint8_t>(v >> 8));
  };
  auto u32 = [&](std::uint32_t v) {
    u16(v & 0xffff);
    u16(v >> 16);
  };
  auto tag = [&](const char* t) { out.insert(out.end(), t, t + 4); };
  tag("RIFF");
  u32(0);  // patched below
  tag("WAVE");
  if (junkChunk) {
    tag("LIST");
    u32(3);
    out.insert(out.end(), {1, 2, 3, 0});  // odd size + pad byte
  }
  tag("fmt ");
  u32(extensible ? 40 : 16);
  u16(extensible ? 0xfffe : format);
  u16(channels);
  u32(sr);
  u32(sr * channels * bits / 8);
  u16(static_cast<std::uint16_t>(channels * bits / 8));
  u16(bits);
  if (extensible) {
    u16(22);
    u16(bits);
    u32(0);
    u16(format);
    out.insert(out.end(), 14, 0);
  }
  tag("data");
  u32(static_cast<std::uint32_t>(data.size()));
  out.insert(out.end(), data.begin(), data.end());
  const auto riff = static_cast<std::uint32_t>(out.size() - 8);
  for (int i = 0; i < 4; ++i) out[4 + static_cast<std::size_t>(i)] = static_cast<std::uint8_t>(riff >> (8 * i));
  return out;
}

}  // namespace

TEST_CASE("decodeWav reads what encodeWav writes") {
  const auto left = sine(440.0, 48000.0, 0.1);
  const auto right = sine(660.0, 48000.0, 0.1, 0.25);
  for (const auto [format, tolerance] : {std::pair{SampleFormat::Pcm16, 1.0 / 32767.0},
                                         std::pair{SampleFormat::Pcm24, 1.0 / 8388607.0},
                                         std::pair{SampleFormat::Float32, 0.0}}) {
    WavFormat f;
    f.sampleRate = 48000;
    f.format = format;
    f.dither = false;
    const auto bytes = encodeWav(clip({left, right}, 48000.0), f);
    const auto decoded = decodeWav(bytes);
    REQUIRE(decoded.ok());
    const auto& a = decoded.value().audio;
    CHECK(a.sampleRate == 48000.0);
    REQUIRE(a.channels.size() == 2);
    REQUIRE(a.frames() == left.size());
    double worst = 0.0;
    for (std::size_t i = 0; i < left.size(); ++i) {
      worst = std::max(worst, std::fabs(static_cast<double>(a.channels[0][i]) - static_cast<double>(left[i])));
      worst = std::max(worst, std::fabs(static_cast<double>(a.channels[1][i]) - static_cast<double>(right[i])));
    }
    CHECK(worst <= tolerance * 0.5 + 1e-9);
  }
}

TEST_CASE("decodeWav: other encodings, chunks and broken files") {
  // 8-bit unsigned PCM after an odd-sized LIST chunk.
  const auto u8 = decodeWav(rawWav(1, 1, 22050, 8, {0, 128, 255}, false, true));
  REQUIRE(u8.ok());
  CHECK(u8.value().audio.channels[0][0] == -1.0f);
  CHECK(u8.value().audio.channels[0][1] == 0.0f);

  // 64-bit float in WAVE_FORMAT_EXTENSIBLE.
  std::vector<std::uint8_t> f64(8);
  const double half = -0.5;
  std::memcpy(f64.data(), &half, 8);
  const auto ext = decodeWav(rawWav(3, 1, 44100, 64, f64, true));
  REQUIRE(ext.ok());
  CHECK(ext.value().audio.channels[0][0] == -0.5f);

  // Truncated data chunk: decode what is there and warn.
  auto cut = rawWav(1, 1, 44100, 16, std::vector<std::uint8_t>(400, 0));
  cut.resize(cut.size() - 100);
  const auto truncated = decodeWav(cut);
  REQUIRE(truncated.ok());
  CHECK(truncated.value().audio.frames() == 150);
  CHECK(truncated.diagnostics()[0].code == "W_TRUNCATED");

  CHECK(decodeWav(std::vector<std::uint8_t>{'R', 'I', 'F', 'F'}).diagnostics()[0].code == "E_WAV");
  CHECK(decodeWav(rawWav(2, 1, 44100, 4, {0, 0})).diagnostics()[0].code == "E_UNSUPPORTED");  // ADPCM
  CHECK(decodeWav(rawWav(1, 3, 44100, 16, std::vector<std::uint8_t>(6))).diagnostics()[0].code == "E_UNSUPPORTED");
}

TEST_CASE("resample keeps pitch and level and removes aliases") {
  const auto x = sine(1000.0, 48000.0, 1.0);
  const auto y = dsp::resample(x, 44100.0 / 48000.0);
  CHECK(y.size() == 44100);
  CHECK(frequencyOf(y, 44100.0) == doctest::Approx(1000.0).epsilon(0.002));
  CHECK(rms(y, 4000, 40000) == doctest::Approx(rms(x, 4000, 40000)).epsilon(0.01));

  // 20 kHz cannot exist at 22.05 kHz; it must be filtered, not folded to 2.05 kHz.
  const auto high = sine(20000.0, 48000.0, 0.5);
  const auto down = dsp::resample(high, 22050.0 / 48000.0);
  CHECK(rms(down, 1000, down.size() - 1000) < 0.001 * rms(high, 1000, high.size() - 1000));

  // An octave up halves the length and doubles the frequency.
  const auto up = dsp::resample(x, 0.5);
  CHECK(frequencyOf(up, 48000.0) == doctest::Approx(2000.0).epsilon(0.002));
}

TEST_CASE("edit: trim, silence trim, fades and source times") {
  const auto input = clip({sine(440.0, 44100.0, 1.0)}, 44100.0);
  const auto t = only(edit::applyEdits(input, R"({"ops":[{"op":"trim","start":0.25,"end":0.5}]})"));
  CHECK(t.audio.frames() == 11025);
  CHECK(t.sourceStart == doctest::Approx(0.25));
  CHECK(t.sourceEnd == doctest::Approx(0.5));

  std::vector<float> padded(44100, 0.0f);
  const auto tone = sine(440.0, 44100.0, 0.2);
  std::copy(tone.begin(), tone.end(), padded.begin() + 22050);
  const auto s = only(edit::applyEdits(clip({padded}, 44100.0),
                                       R"({"ops":[{"op":"trim_silence","pad":0.01},{"op":"fade","in":0.01,"out":0.01}]})"));
  CHECK(s.sourceStart == doctest::Approx(0.49).epsilon(0.001));
  CHECK(s.audio.frames() == doctest::Approx(0.22 * 44100).epsilon(0.002));
  CHECK(s.audio.channels[0].front() == 0.0f);
  CHECK(s.audio.channels[0].back() == 0.0f);

  // Reverse, then trim the first 0.1 s: that is the last 0.1 s of the source.
  const auto r = only(edit::applyEdits(input, R"({"ops":[{"op":"reverse"},{"op":"trim","end":0.1}]})"));
  CHECK(r.sourceStart == doctest::Approx(0.9));
  CHECK(r.sourceEnd == doctest::Approx(1.0));
}

TEST_CASE("edit: slicing by onsets and by times") {
  const std::vector<double> hits = {0.2, 0.7, 1.3};
  const auto input = clip({bursts(hits, 44100.0, 2.0)}, 44100.0);
  const auto onsets = edit::detectOnsets(input, {});
  REQUIRE(onsets.size() == 3);
  for (std::size_t i = 0; i < 3; ++i) CHECK(onsets[i] == doctest::Approx(hits[i] - 0.003).epsilon(0.005));

  const auto sliced = edit::applyEdits(input, R"({"ops":[{"op":"slice","onsets":true},{"op":"trim_silence"}]})");
  REQUIRE(sliced.ok());
  REQUIRE(sliced.value().size() == 3);
  for (std::size_t i = 0; i < 3; ++i) {
    CHECK(sliced.value()[i].sourceStart == doctest::Approx(hits[i]).epsilon(0.01));
    CHECK(sliced.value()[i].audio.frames() < static_cast<std::size_t>(0.1 * 44100));
  }

  const auto timed = edit::applyEdits(input, R"({"ops":[{"op":"slice","at":[1.5,0.5]}]})");
  REQUIRE(timed.ok());
  REQUIRE(timed.value().size() == 3);
  std::size_t total = 0;
  for (const auto& c : timed.value()) total += c.audio.frames();
  CHECK(total == input.frames());
  CHECK(timed.value()[1].sourceStart == doctest::Approx(0.5));

  const auto silent = edit::applyEdits(clip({std::vector<float>(4410, 0.0f)}, 44100.0),
                                       R"({"ops":[{"op":"slice","onsets":true}]})");
  REQUIRE(silent.ok());
  CHECK(silent.value().size() == 1);
  CHECK(silent.diagnostics()[0].code == "W_NO_ONSETS");
}

TEST_CASE("edit: pitch, speed, resample, mono") {
  const auto input = clip({sine(440.0, 44100.0, 1.0), sine(440.0, 44100.0, 1.0, 0.25)}, 44100.0);
  const auto up = only(edit::applyEdits(input, R"({"ops":[{"op":"pitch","semitones":12}]})"));
  CHECK(up.audio.frames() == 22050);
  CHECK(frequencyOf(up.audio.channels[0], 44100.0) == doctest::Approx(880.0).epsilon(0.003));
  CHECK(up.sourceEnd == doctest::Approx(1.0));

  const auto slow = only(edit::applyEdits(input, R"({"ops":[{"op":"speed","factor":0.5},{"op":"trim","end":1.0}]})"));
  CHECK(slow.sourceEnd == doctest::Approx(0.5));  // 1 s of half-speed audio covers 0.5 s of the source

  const auto rs = only(edit::applyEdits(input, R"({"ops":[{"op":"resample","sample_rate":48000},{"op":"mono"}]})"));
  CHECK(rs.audio.sampleRate == 48000.0);
  CHECK(rs.audio.channels.size() == 1);
  CHECK(frequencyOf(rs.audio.channels[0], 48000.0) == doctest::Approx(440.0).epsilon(0.003));
}

TEST_CASE("edit: loudness and peak normalization") {
  const auto input = clip({sine(1000.0, 44100.0, 0.5, 0.05)}, 44100.0);
  const auto combat = only(edit::applyEdits(input, R"({"ops":[{"op":"normalize","category":"combat"}]})"));
  CHECK(legacy::measureLufs(combat.audio.channels[0], 44100.0) == doctest::Approx(-9.0).epsilon(0.06));
  CHECK(legacy::measureTruePeak(combat.audio.channels[0]) <= -0.99);

  const auto peak = only(edit::applyEdits(input, R"({"ops":[{"op":"normalize","peak_db":-3}]})"));
  CHECK(legacy::measureTruePeak(peak.audio.channels[0]) == doctest::Approx(-3.0).epsilon(0.001));
}

TEST_CASE("edit: program errors carry JSON Pointer paths") {
  const auto input = clip({sine(440.0, 44100.0, 0.5)}, 44100.0);
  const auto bad = edit::applyEdits(input, R"({"ops":[
      {"op":"wobble"},
      {"op":"trim","start":0.4,"end":0.2},
      {"op":"normalize"},
      {"op":"gain","db":3,"unit":"dB"},
      {"op":"pitch","semitones":100}]})");
  REQUIRE_FALSE(bad.ok());
  const auto& d = bad.diagnostics();
  CHECK(hasDiag(d, "E_ENUM", "/ops/0/op"));
  CHECK(hasDiag(d, "E_RANGE", "/ops/1/end"));
  CHECK(hasDiag(d, "E_REQUIRED", "/ops/2"));
  CHECK(hasDiag(d, "E_UNKNOWN_FIELD", "/ops/3/unit"));
  CHECK(hasDiag(d, "E_RANGE", "/ops/4/semitones"));

  const auto empty = edit::applyEdits(input, R"({"ops":[{"op":"trim","start":2}]})");
  REQUIRE_FALSE(empty.ok());
  CHECK(empty.diagnostics()[0].code == "E_EMPTY");
}

TEST_CASE("bridge: editAudio from WAV bytes is deterministic") {
  WavFormat f;
  f.sampleRate = 44100;
  f.format = SampleFormat::Pcm24;
  f.dither = false;
  const auto bytes = encodeWav(clip({bursts({0.1, 0.5}, 44100.0, 1.0)}, 44100.0), f);
  const std::string program = R"({"ops":[{"op":"slice","onsets":true},{"op":"trim_silence"},
                                         {"op":"pitch","semitones":-5},{"op":"normalize","category":"ui"}]})";
  const auto a = legacy::bridgeCall("editAudio", program, "", {}, {}, bytes);
  const auto b = legacy::bridgeCall("editAudio", program, "", {}, {}, bytes);
  REQUIRE(a.ok);
  CHECK(a.buffers.size() == 2);
  CHECK(a.buffers == b.buffers);
  CHECK(a.json.find("\"source_start_s\"") != std::string::npos);

  const auto info = legacy::bridgeCall("inspectAudio", "", "", {}, {}, bytes);
  REQUIRE(info.ok);
  CHECK(info.json.find("\"onsets_s\":[") != std::string::npos);

  const auto broken = legacy::bridgeCall("editAudio", program, "", {}, {}, std::vector<std::uint8_t>{1, 2, 3});
  CHECK_FALSE(broken.ok);
  CHECK(broken.diagnostics[0].path == "input:");
}
