#include <doctest.h>

#include <cstdint>

#include "math/rng.hpp"

using makesfx::deriveSeed;
using makesfx::Pcg32;
using makesfx::SplitMix64;

TEST_CASE("PCG32 matches the reference implementation (seed 42, stream 54)") {
  // Output of pcg32-demo from pcg-c-basic.
  Pcg32 rng(42u, 54u);
  CHECK(rng.next() == 0xa15c02b7u);
  CHECK(rng.next() == 0x7b47f409u);
  CHECK(rng.next() == 0xba1d3330u);
  CHECK(rng.next() == 0x83d2f293u);
  CHECK(rng.next() == 0xbfa4784bu);
  CHECK(rng.next() == 0xcbed606eu);
}

TEST_CASE("SplitMix64 matches the reference implementation") {
  SplitMix64 rng(1234567u);
  CHECK(rng.next() == 6457827717110365317ULL);
  CHECK(rng.next() == 3203168211198807973ULL);
  CHECK(rng.next() == 9817491932198370423ULL);
}

TEST_CASE("uniform values stay in [0, 1)") {
  Pcg32 rng(7u, 1u);
  for (int i = 0; i < 100000; ++i) {
    const float f = rng.uniformFloat();
    const double d = rng.uniformDouble();
    REQUIRE(f >= 0.0f);
    REQUIRE(f < 1.0f);
    REQUIRE(d >= 0.0);
    REQUIRE(d < 1.0);
  }
}

TEST_CASE("derived seeds are stable and independent") {
  constexpr std::uint64_t a = deriveSeed(42, {1, 0, 7});
  static_assert(a == deriveSeed(42, {1, 0, 7}), "deriveSeed is a pure function");
  CHECK(a != deriveSeed(42, {1, 1, 7}));
  CHECK(a != deriveSeed(43, {1, 0, 7}));
  CHECK(deriveSeed(42, {1, 2}) != deriveSeed(42, {2, 1}));
}
