#include <doctest.h>

#include <algorithm>
#include <cmath>
#include <limits>

#include "math/dmath.hpp"

namespace dm = makesfx::dmath;

namespace {

double relErr(double actual, double expected) {
  if (expected == 0.0) return std::fabs(actual);
  return std::fabs((actual - expected) / expected);
}

}  // namespace

// Accuracy is checked against the host libm. Thresholds sit far below the spec
// targets (sin/cos 1e-7 abs, exp2/log2 2e-7 rel, tanh 1e-6 abs) to catch any
// coefficient typo, while staying above libm's own last-bit differences.

TEST_CASE("sinTurns and cosTurns match libm") {
  double worst = 0.0;
  for (int i = -20000; i <= 20000; ++i) {
    const double t = i * 0.000731;
    worst = std::max(worst, std::fabs(dm::sinTurns(t) - std::sin(t * dm::kTwoPi)));
    worst = std::max(worst, std::fabs(dm::cosTurns(t) - std::cos(t * dm::kTwoPi)));
  }
  CHECK(worst < 1e-12);
}

TEST_CASE("sinTurns is exact at quadrant points") {
  CHECK(dm::sinTurns(0.0) == 0.0);
  CHECK(dm::sinTurns(0.25) == 1.0);
  CHECK(dm::sinTurns(0.5) == 0.0);
  CHECK(dm::sinTurns(0.75) == -1.0);
  CHECK(dm::sinTurns(1.0) == 0.0);
  CHECK(dm::sinTurns(-0.25) == -1.0);
  CHECK(dm::cosTurns(0.0) == 1.0);
}

TEST_CASE("sin, cos and tan match libm") {
  double worst = 0.0;
  for (int i = -10000; i <= 10000; ++i) {
    const double x = i * 0.01003;
    worst = std::max(worst, std::fabs(dm::sin(x) - std::sin(x)));
    worst = std::max(worst, std::fabs(dm::cos(x) - std::cos(x)));
  }
  CHECK(worst < 1e-12);
  for (int i = -1000; i <= 1000; ++i) {
    const double x = i * 0.0015;  // |x| < 1.5, away from the pole
    CHECK(relErr(dm::tan(x), std::tan(x)) < 1e-12);
  }
}

TEST_CASE("exp and exp2 match libm") {
  double worst = 0.0;
  for (int i = -7000; i <= 7090; ++i) {
    const double x = i * 0.1;
    worst = std::max(worst, relErr(dm::exp(x), std::exp(x)));
  }
  CHECK(worst < 1e-14);
  worst = 0.0;
  for (int i = -10000; i <= 10000; ++i) {
    const double x = i * 0.0731;
    worst = std::max(worst, relErr(dm::exp2(x), std::exp2(x)));
  }
  CHECK(worst < 1e-14);
}

TEST_CASE("exp edge cases") {
  CHECK(dm::exp(0.0) == 1.0);
  CHECK(dm::exp2(0.0) == 1.0);
  CHECK(dm::exp2(10.0) == 1024.0);
  CHECK(dm::exp(-1000.0) == 0.0);
  CHECK(dm::exp(1000.0) == std::numeric_limits<double>::infinity());
  CHECK(std::isnan(dm::exp(std::numeric_limits<double>::quiet_NaN())));
  // Never subnormal (spec §5.2).
  CHECK(std::fpclassify(dm::exp(-708.0)) == FP_NORMAL);
}

TEST_CASE("log family matches libm") {
  double worst = 0.0;
  for (int i = 1; i <= 20000; ++i) {
    const double x = std::ldexp(i * 0.05, (i % 200) - 100);
    worst = std::max(worst, relErr(dm::log(x), std::log(x)));
    worst = std::max(worst, relErr(dm::log2(x), std::log2(x)));
    worst = std::max(worst, relErr(dm::log10(x), std::log10(x)));
  }
  CHECK(worst < 1e-14);
  CHECK(dm::log(1.0) == 0.0);
  CHECK(dm::log2(8.0) == doctest::Approx(3.0).epsilon(1e-15));
  CHECK(dm::log(0.0) == -std::numeric_limits<double>::infinity());
  CHECK(std::isnan(dm::log(-1.0)));
}

TEST_CASE("tanh matches libm") {
  double worst = 0.0;
  for (int i = -30000; i <= 30000; ++i) {
    const double x = i * 0.001;
    worst = std::max(worst, std::fabs(dm::tanh(x) - std::tanh(x)));
  }
  CHECK(worst < 1e-14);
  CHECK(dm::tanh(0.0) == 0.0);
  CHECK(dm::tanh(50.0) == 1.0);
  CHECK(dm::tanh(-50.0) == -1.0);
}

TEST_CASE("pow and dB conversions") {
  for (int i = 1; i <= 400; ++i) {
    const double b = i * 0.05;
    const double e = (i % 40) * 0.37 - 7.0;
    CHECK(relErr(dm::pow(b, e), std::pow(b, e)) < 1e-12);
  }
  CHECK(dm::dbToGain(0.0) == 1.0);
  CHECK(dm::dbToGain(-6.0) == doctest::Approx(0.501187233627272).epsilon(1e-14));
  CHECK(dm::gainToDb(1.0) == 0.0);
  CHECK(dm::gainToDb(0.0) == -std::numeric_limits<double>::infinity());
  for (int db = -120; db <= 24; ++db) {
    CHECK(dm::gainToDb(dm::dbToGain(db)) == doctest::Approx(db).epsilon(1e-12));
  }
}
