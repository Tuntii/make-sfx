#include <doctest.h>

#include <algorithm>
#include <cmath>

#include "dsp/oscillator.hpp"
#include "render/probe.hpp"

using namespace makesfx;

TEST_CASE("probe frame count") {
  CHECK(probeFrames(48000.0, 1.0) == 48000);
  CHECK(probeFrames(44100.0, 0.5) == 22050);
  CHECK(probeFrames(96000.0, 1.5) == 144000);
  CHECK(probeFrames(1000.0, 1.0) == 0);   // sample rate too low
  CHECK(probeFrames(48000.0, 0.0) == 0);
}

TEST_CASE("probe validation reports JSON pointer paths") {
  ProbeSpec spec;
  spec.frequencyHz = 30000.0;  // above Nyquist at 48 kHz
  spec.seconds = -1.0;
  const auto d = validateProbe(spec);
  REQUIRE(d.size() == 2);
  CHECK(d[0].path == "/seconds");
  CHECK(d[1].path == "/frequency_hz");
  CHECK(d[1].code == "E_OUT_OF_RANGE");
  CHECK_FALSE(renderProbe(spec).ok());
}

TEST_CASE("sine probe peaks at the requested level") {
  ProbeSpec spec;
  spec.signal = ProbeSignal::Sine;
  spec.frequencyHz = 1000.0;  // 48 samples per cycle: hits the exact peak
  const auto r = renderProbe(spec);
  REQUIRE(r.ok());
  const auto& pcm = r.value();
  float peak = 0.0f;
  for (const float s : pcm) peak = std::max(peak, std::fabs(s));
  CHECK(peak == doctest::Approx(0.501187).epsilon(1e-6));
  CHECK(pcm[0] == 0.0f);
}

TEST_CASE("saw probe stays bounded and renders identically twice") {
  ProbeSpec spec;
  spec.signal = ProbeSignal::Saw;
  spec.frequencyHz = 7040.0;
  const auto a = renderProbe(spec);
  const auto b = renderProbe(spec);
  REQUIRE(a.ok());
  REQUIRE(b.ok());
  CHECK(a.value() == b.value());
  CHECK(pcmSha256(a.value()) == pcmSha256(b.value()));
  for (const float s : a.value()) REQUIRE(std::fabs(s) <= 0.51f * 1.1f);
}

TEST_CASE("polyBLEP residual is zero away from the discontinuity") {
  CHECK(dsp::polyBlep(0.5, 0.01) == 0.0);
  CHECK(dsp::polyBlep(0.0, 0.01) == -1.0);
  CHECK(dsp::polyBlep(0.999999, 0.01) > 0.9);
}

TEST_CASE("flushDenormal") {
  CHECK(dsp::flushDenormal(1e-20f) == 0.0f);
  CHECK(dsp::flushDenormal(-1e-20) == 0.0);
  CHECK(dsp::flushDenormal(1e-3f) == 1e-3f);
}
