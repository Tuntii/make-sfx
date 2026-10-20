#pragma once

// Deterministic math (spec §5.2).
//
// The C/C++ standard library's transcendental functions (sin, exp, log, tanh,
// pow, ...) are not correctly rounded and differ between libm implementations
// (glibc, MSVC CRT, Apple libm, musl/Emscripten). Every DSP path uses these
// functions instead. They are built only from IEEE-exact operations
// (+, -, *, /, sqrt, floor, frexp, ldexp), so every platform produces the same
// bits. Kernels follow fdlibm (Sun Microsystems, freely redistributable).

namespace makesfx::dmath {

inline constexpr double kPi = 3.14159265358979323846;
inline constexpr double kTwoPi = 6.28318530717958647692;
inline constexpr double kLn2 = 0.693147180559945309417;
inline constexpr double kInvLn2 = 1.44269504088896340736;

// sin(2π·t) for t in turns. Exact range reduction for any finite t — the
// preferred form for oscillator phase accumulators.
double sinTurns(double t);
// cos(2π·t) for t in turns.
double cosTurns(double t);

double sin(double x);
double cos(double x);
double tan(double x);

double exp(double x);    // 0 below -708 (never subnormal), +inf above 709.78
double exp2(double x);
double log(double x);    // -inf at 0, NaN below 0
double log2(double x);
double log10(double x);
double pow(double base, double exponent);  // base > 0
double tanh(double x);

double dbToGain(double db);
double gainToDb(double gain);  // -inf at 0

}  // namespace makesfx::dmath
