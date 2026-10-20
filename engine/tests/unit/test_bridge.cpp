#include <doctest.h>

#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "legacy/api.hpp"
#include "legacy/bridge.hpp"
#include "legacy/legacy.hpp"
#include "render/report.hpp"

using namespace makesfx;
using namespace makesfx::legacy;

namespace {

BridgeResult call(std::string_view op, std::string_view config, std::string_view options = "",
                  std::span<const float> in0 = {}, std::span<const float> in1 = {}) {
  return bridgeCall(op, config, options, in0, in1);
}

std::string readGoldenConfig(const char* name) {
  std::string path = MAKESFX_GOLDEN_FILE;
  path = path.substr(0, path.find_last_of("/\\") + 1) + "legacy/" + name;
  std::ifstream in(path, std::ios::binary);
  std::stringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

bool hasCode(const BridgeResult& r, const std::string& code) {
  for (const auto& d : r.diagnostics) {
    if (d.code == code) return true;
  }
  return false;
}

}  // namespace

TEST_CASE("bridge: unknown ops and bad input are diagnostics") {
  const auto unknown = call("renderEverything", "");
  CHECK_FALSE(unknown.ok);
  CHECK(hasCode(unknown, "E_UNKNOWN_OP"));

  const auto badOptions = call("measureLufs", "", R"({"sead": 1})");
  CHECK_FALSE(badOptions.ok);
  REQUIRE_FALSE(badOptions.diagnostics.empty());
  CHECK(badOptions.diagnostics[0].path == "options:/sead");

  const std::vector<float> x(100, 0.1f);
  const auto noCategory = call("normalizeLoudness", "", "", x);
  CHECK(hasCode(noCategory, "E_REQUIRED"));

  const auto tooLong = call("buildSamples", R"({"sustain": 100000})");
  CHECK(hasCode(tooLong, "E_TOO_LONG"));
  CHECK(tooLong.buffers.empty());
}

TEST_CASE("bridge: config JSON round-trips exactly") {
  for (const char* name : {"digital_3_glitch.json", "digital_5_hologram.json", "game_4_powerup.json"}) {
    CAPTURE(name);
    const auto parsed = parseSoundConfig(readGoldenConfig(name));
    REQUIRE(parsed.ok());
    const std::string once = toJson(parsed.value());
    const auto reparsed = parseSoundConfig(once);
    REQUIRE(reparsed.ok());
    CHECK(toJson(reparsed.value()) == once);
  }

  SoundConfig cfg;
  cfg.params.frequency = 440.0;
  cfg.params.release = 0.2;
  cfg.params.volume = 0.5;
  const auto varied = call("applyVariation", toJson(cfg), R"({"seed": 7})");
  REQUIRE(varied.ok);
  const auto back = parseSoundConfig(varied.json);
  REQUIRE(back.ok());
  CHECK(*back.value().params.frequency == 397.0300182774663);  // test_legacy.cpp reference, bit exact
  CHECK_FALSE(back.value().params.decay.has_value());
}

TEST_CASE("bridge: render ops match the C ABI render path") {
  const std::string cfg = readGoldenConfig("game_4_powerup.json");
  const std::string options = R"({"seed": 1042, "category": "stinger"})";
  const auto direct = renderJson(cfg, options);
  REQUIRE(direct.ok());

  const auto mastered = call("renderMasteredBuffer", cfg, options);
  REQUIRE(mastered.ok);
  CHECK(mastered.json == R"({"stereo":true,"category":"stinger"})");
  REQUIRE(mastered.buffers.size() == 3);
  CHECK(mastered.buffers[1] == direct.value().channels[0]);
  CHECK(mastered.buffers[2] == direct.value().channels[1]);
  CHECK(mastered.buffers[0] == mixDownMono(mastered.buffers[1], mastered.buffers[2]));

  const auto wav = call("renderSound", cfg, options);
  REQUIRE(wav.ok);
  REQUIRE(wav.bytes.size() > 44);
  CHECK(std::string(wav.bytes.begin(), wav.bytes.begin() + 4) == "RIFF");
  CHECK(wav.bytes.size() == 44 + direct.value().frames() * 2 * 2);  // 16-bit stereo
}

TEST_CASE("bridge: stage ops compose like render") {
  const std::string cfg = R"({"params": {"frequency": 520, "sustain": 0.1, "release": 0.1},
                              "fx": {"reverbMix": 0.3, "delayMix": 0.2, "delayTime": 0.05}})";
  const auto full = call("synthesizeFull", cfg, R"({"seed": 3})");
  const auto dry = call("synthesizeDry", cfg, R"({"seed": 3})");
  REQUIRE(full.ok);
  REQUIRE(dry.ok);
  const auto wet = call("applyFx", cfg, "", dry.buffers[0]);
  REQUIRE(wet.ok);
  CHECK(wet.buffers[0] == full.buffers[0]);

  const auto tail = call("computeFxTailSamples", cfg);
  CHECK(tail.number == 35280.0);  // default reverbDecay 0.8 s outlasts 4 × 50 ms of delay

  const auto lufs = call("measureLufs", "", "", full.buffers[0]);
  CHECK(lufs.number == doctest::Approx(measureLufs(full.buffers[0], 44100.0)));
}

TEST_CASE("bridge: voice ops") {
  const std::string cfg = R"({"params": {}, "voice": {"frequency": 440, "gate": 0.2,
      "osc1": {"wave": "saw"}, "amp": {"attack": 0.01, "release": 0.1},
      "notes": [{"time": 0, "gate": 0.1}, {"time": 0.2, "gate": 0.1, "transpose": 7}]},
      "master": {"duration": 0.8}})";
  const auto length = call("voiceLength", cfg);
  CHECK(length.number == doctest::Approx(0.4));

  const auto fitted = call("fitVoiceDuration", cfg);
  REQUIRE(fitted.ok);
  const auto patch = parseSoundConfig(R"({"params": {}, "voice": )" + fitted.json + "}");
  REQUIRE(patch.ok());
  CHECK(voiceLength(*patch.value().voice) == doctest::Approx(0.8));

  const auto shifted = call("shiftVoicePitch", cfg, R"({"factor": 2})");
  REQUIRE(shifted.ok);
  CHECK(shifted.json.find("\"frequency\":880") != std::string::npos);
  CHECK(hasCode(call("shiftVoicePitch", cfg), "E_REQUIRED"));

  const auto samples = call("synthesizeVoice", cfg);
  REQUIRE(samples.ok);
  CHECK(samples.buffers[0].size() >= 17640);  // 0.4 s plus a few samples of filter tail
  CHECK(samples.buffers[0].size() < 17700);
}

TEST_CASE("bridge: encodeWav pads the shorter stereo channel") {
  const std::vector<float> left(10, 0.5f);
  const std::vector<float> right(4, -0.5f);
  const auto wav = call("encodeWavStereo", "", "", left, right);
  REQUIRE(wav.ok);
  CHECK(wav.bytes.size() == 44 + 10 * 4);
}
