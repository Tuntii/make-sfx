#include <doctest.h>

#include <cmath>
#include <limits>
#include <string>
#include <vector>

#include "legacy/api.hpp"
#include "legacy/js.hpp"
#include "legacy/legacy.hpp"
#include "math/dmath.hpp"

using namespace makesfx;
using namespace makesfx::legacy;

// Reference values below come from packages/core (TypeScript) directly.

TEST_CASE("Mulberry32 matches createSeededRng()") {
  Mulberry32 a(42u);
  CHECK(a.next() == 0.60110375192016363);
  CHECK(a.next() == 0.44829055899754167);
  CHECK(a.next() == 0.85246579349040985);

  Mulberry32 b = drySynthRng(1042u);  // createSeededRng(1042 ^ 0x9e3779b9)
  CHECK(b.next() == 0.81254821154288948);
  CHECK(b.next() == 0.56849489687010646);
}

TEST_CASE("applyVariation matches the TS draw order") {
  SoundConfig cfg;
  cfg.params.frequency = 440.0;
  cfg.params.release = 0.2;
  cfg.params.volume = 0.5;
  const SoundConfig v = applyVariation(cfg, 7u);
  CHECK(*v.params.frequency == doctest::Approx(397.0300182774663).epsilon(1e-15));
  CHECK(*v.params.release == doctest::Approx(0.22289156637340787).epsilon(1e-15));
  CHECK(*v.params.volume == doctest::Approx(0.5119417223427445).epsilon(1e-15));
  CHECK(*v.params.randomness == doctest::Approx(0.08504333939403297).epsilon(1e-15));
  CHECK_FALSE(v.params.decay.has_value());  // only defined fields vary
}

TEST_CASE("JavaScript number helpers") {
  CHECK(js::toInt32(3.9) == 3);
  CHECK(js::toInt32(-3.9) == -3);
  CHECK(js::toInt32(4294967296.0 + 5.0) == 5);
  CHECK(js::toInt32(2147483648.0) == -2147483647 - 1);
  CHECK(js::toUint32(-1.0) == 4294967295u);
  CHECK(js::round(2.5) == 3.0);
  CHECK(js::round(-2.5) == -2.0);
  CHECK(js::round(-2.6) == -3.0);
  CHECK(js::mod(-1.5, 1.0) == -0.5);
  CHECK(js::orElse(0.0, 9.0) == 9.0);
  CHECK(js::orElse(std::numeric_limits<double>::quiet_NaN(), 9.0) == 9.0);
}

TEST_CASE("K-weighting: 1 kHz sine at -20 dBFS reads -23.01 LUFS") {
  // BS.1770: a full-scale 1 kHz sine is -3.01 LUFS (mono).
  for (const double sr : {44100.0, 48000.0}) {
    std::vector<float> x(static_cast<std::size_t>(sr * 2.0));
    for (std::size_t i = 0; i < x.size(); ++i) {
      x[i] = static_cast<float>(0.1 * dmath::sinTurns(1000.0 * static_cast<double>(i) / sr));
    }
    CAPTURE(sr);
    CHECK(measureIntegratedLufs(x, sr) == doctest::Approx(-23.01).epsilon(0.002));
    CHECK(measureLufs(x, sr) == doctest::Approx(-23.01).epsilon(0.002));
  }
}

TEST_CASE("category loudness ignores silent tails") {
  // Sounds of 400 ms or more: a tail never changes the reading. (Shorter
  // sounds are measured over their own length, so a tail can only extend the
  // window up to 400 ms.)
  const double sr = 44100.0;
  std::vector<float> burst(static_cast<std::size_t>(sr * 0.6));
  for (std::size_t i = 0; i < burst.size(); ++i) {
    burst[i] = static_cast<float>(0.5 * dmath::sinTurns(440.0 * static_cast<double>(i) / sr));
  }
  std::vector<float> withTail = burst;
  withTail.resize(static_cast<std::size_t>(sr * 2.0), 0.0f);
  CHECK(measureLufs(withTail, sr) == doctest::Approx(measureLufs(burst, sr)).epsilon(1e-9));
  // The ungated integrated reading is diluted by 10·log10(0.6 / 2) ≈ -5.2 dB.
  CHECK(measureIntegratedLufs(withTail, sr) == doctest::Approx(measureIntegratedLufs(burst, sr) - 5.23).epsilon(0.01));
}

TEST_CASE("true-peak limiter keeps the ceiling") {
  std::vector<float> loud(4000);
  for (std::size_t i = 0; i < loud.size(); ++i) {
    loud[i] = static_cast<float>(1.5 * dmath::sinTurns(3000.0 * static_cast<double>(i) / 44100.0));
  }
  const auto limited = applyTruePeakLimit(loud, -1.0);
  CHECK(measureTruePeak(limited) <= -0.999);
}

TEST_CASE("JSON: strict parsing reports every problem with a path") {
  const auto r = parseSoundConfig(R"({
    "params": { "frequency": "high", "volumee": 1 },
    "fx": { "reverbMix": null },
    "modulators": [ { "target": "wobble" } ],
    "category": "boss"
  })");
  REQUIRE_FALSE(r.ok());
  const auto& d = r.diagnostics();
  auto has = [&](const std::string& path, const std::string& code) {
    for (const auto& x : d) {
      if (x.path == path && x.code == code) return true;
    }
    return false;
  };
  CHECK(has("/params/frequency", "E_TYPE"));
  CHECK(has("/params/volumee", "E_UNKNOWN_FIELD"));
  CHECK(has("/fx/reverbMix", "E_TYPE"));
  CHECK(has("/modulators/0/target", "E_ENUM"));
  CHECK(has("/category", "E_ENUM"));
}

TEST_CASE("JSON: bare SoundParams and syntax errors") {
  const auto bare = parseSoundConfig(R"({"frequency": 330, "shape": 2})");
  REQUIRE(bare.ok());
  CHECK(*bare.value().params.frequency == 330.0);

  const auto broken = parseSoundConfig("{\"params\": {");
  REQUIRE_FALSE(broken.ok());
  CHECK(broken.diagnostics()[0].code == "E_JSON");

  const auto voice = parseSoundConfig(R"({"params": {}, "voice": {"frequency": 440, "amp": {}}})");
  REQUIRE_FALSE(voice.ok());
  CHECK(voice.diagnostics()[0].path == "/voice/osc1");
}

TEST_CASE("render rejects absurd lengths instead of allocating") {
  const auto r = renderJson(R"({"params": {"sustain": 100000}})", "");
  REQUIRE_FALSE(r.ok());
  CHECK(r.diagnostics()[0].code == "E_TOO_LONG");

  const auto ok = renderJson(R"({"params": {"sustain": 0.2}})", R"({"seed": 3})");
  CHECK(ok.ok());
}

TEST_CASE("render: seeds, stereo and category mastering") {
  const std::string cfg = R"({
    "params": { "frequency": 660, "sustain": 0.12, "release": 0.1, "shape": 1 },
    "fx": { "stereoWidth": 0.4, "reverbMix": 0.1 },
    "category": "pickup"
  })";
  const auto a = renderJson(cfg, R"({"seed": 5})");
  const auto b = renderJson(cfg, R"({"seed": 5})");
  const auto c = renderJson(cfg, R"({"seed": 6})");
  REQUIRE(a.ok());
  REQUIRE(b.ok());
  REQUIRE(c.ok());
  CHECK(a.value().channels.size() == 2);
  CHECK(pcmSha256(a.value()) == pcmSha256(b.value()));
  CHECK(pcmSha256(a.value()) != pcmSha256(c.value()));

  const auto mono = mixDownMono(a.value().channels[0], a.value().channels[1]);
  CHECK(std::fabs(measureLufs(mono, 44100.0) - targetLufs(Category::Pickup)) <= 2.0);
  CHECK(measureTruePeak(mono) <= -0.99);
}
