#pragma once

#include <cstdint>

namespace makesfx::legacy {

// Mulberry32, bit-identical to createSeededRng() in variation.ts.
class Mulberry32 {
public:
  explicit Mulberry32(std::uint32_t seed) noexcept : s_(seed) {}

  double next() noexcept {
    s_ += 0x6d2b79f5u;
    std::uint32_t t = (s_ ^ (s_ >> 15)) * (1u | s_);
    t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
    return static_cast<double>(t ^ (t >> 14)) / 4294967296.0;
  }

private:
  std::uint32_t s_;
};

// The dry-synthesis RNG stream: TS seeds it with `seed ^ 0x9e3779b9`. Unseeded
// TS renders use Math.random(); the C++ engine is always deterministic and
// uses seed 0 instead.
inline Mulberry32 drySynthRng(std::uint32_t seed) noexcept { return Mulberry32(seed ^ 0x9e3779b9u); }

}  // namespace makesfx::legacy
