#pragma once

#include <cstdint>
#include <initializer_list>

// Deterministic random numbers (spec §5.2). There is no global RNG: every
// consumer owns a Pcg32 stream derived from the project seed, so adding a
// track never changes another track's randomness.

namespace makesfx {

// SplitMix64 (Steele, Lea, Flood 2014). Used for seeding and hashing.
constexpr std::uint64_t splitmix64Mix(std::uint64_t z) noexcept {
  z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
  z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
  return z ^ (z >> 31);
}

class SplitMix64 {
public:
  explicit constexpr SplitMix64(std::uint64_t seed) noexcept : state_(seed) {}

  constexpr std::uint64_t next() noexcept {
    state_ += 0x9e3779b97f4a7c15ULL;
    return splitmix64Mix(state_);
  }

private:
  std::uint64_t state_;
};

// Derives an independent stream seed: deriveSeed(projectSeed, {instrumentId, noteIndex, purpose}).
constexpr std::uint64_t deriveSeed(std::uint64_t root, std::initializer_list<std::uint64_t> parts) noexcept {
  std::uint64_t h = splitmix64Mix(root + 0x9e3779b97f4a7c15ULL);
  for (const std::uint64_t p : parts) {
    h = splitmix64Mix(h ^ splitmix64Mix(p + 0x9e3779b97f4a7c15ULL));
  }
  return h;
}

// PCG32, XSH-RR variant (O'Neill 2014), seeded like pcg32_srandom_r.
class Pcg32 {
public:
  constexpr Pcg32(std::uint64_t seed, std::uint64_t stream) noexcept : inc_((stream << 1u) | 1u) {
    next();
    state_ += seed;
    next();
  }

  constexpr std::uint32_t next() noexcept {
    const std::uint64_t old = state_;
    state_ = old * 6364136223846793005ULL + inc_;
    const auto xorshifted = static_cast<std::uint32_t>(((old >> 18u) ^ old) >> 27u);
    const auto rot = static_cast<std::uint32_t>(old >> 59u);
    return (xorshifted >> rot) | (xorshifted << ((32u - rot) & 31u));
  }

  // [0, 1) with 24 bits of precision.
  constexpr float uniformFloat() noexcept {
    return static_cast<float>(next() >> 8u) * (1.0f / 16777216.0f);
  }

  // [0, 1) with 53 bits of precision.
  constexpr double uniformDouble() noexcept {
    const std::uint64_t hi = next() >> 5u;  // 27 bits
    const std::uint64_t lo = next() >> 6u;  // 26 bits
    return static_cast<double>((hi << 26u) | lo) * (1.0 / 9007199254740992.0);
  }

private:
  std::uint64_t state_ = 0;
  std::uint64_t inc_;
};

}  // namespace makesfx
