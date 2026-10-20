#pragma once

#include <cmath>
#include <cstdint>

// JavaScript number semantics used by the legacy (TypeScript) pipeline port.
// The port mirrors the TS code operation by operation: arithmetic in double,
// intermediate buffers in float (TS Float32Array), so output stays within
// float rounding of the reference implementation.

namespace makesfx::legacy::js {

// Float32Array element read: float -> double.
inline double rd(float v) noexcept { return static_cast<double>(v); }
// Float32Array element write: double -> float (round to nearest).
inline float wr(double v) noexcept { return static_cast<float>(v); }

// ToInt32: truncate toward zero, wrap modulo 2^32 (`x | 0`).
inline std::int32_t toInt32(double x) noexcept {
  if (!std::isfinite(x)) return 0;
  const double t = std::trunc(x);
  const double m = std::fmod(t, 4294967296.0);
  const double u = m < 0.0 ? m + 4294967296.0 : m;
  const auto bits = static_cast<std::uint32_t>(u);
  return static_cast<std::int32_t>(bits);
}

// ToUint32 (`x >>> 0`).
inline std::uint32_t toUint32(double x) noexcept { return static_cast<std::uint32_t>(toInt32(x)); }

// Math.round: nearest, ties toward +infinity.
inline double round(double x) noexcept {
  const double r = std::floor(x);
  return (x - r >= 0.5) ? r + 1.0 : r;
}

// `a % b` for numbers (sign of the dividend).
inline double mod(double a, double b) noexcept { return std::fmod(a, b); }

inline double sign(double v) noexcept { return v < 0.0 ? -1.0 : 1.0; }

inline double clamp(double v, double lo, double hi) noexcept { return std::fmax(lo, std::fmin(hi, v)); }

// `x || fallback` for numbers: 0 and NaN are falsy.
inline double orElse(double x, double fallback) noexcept { return (x == 0.0 || std::isnan(x)) ? fallback : x; }

inline bool truthy(double x) noexcept { return !(x == 0.0 || std::isnan(x)); }

}  // namespace makesfx::legacy::js
