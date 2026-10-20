#include "math/dmath.hpp"

#include <cmath>
#include <limits>

namespace makesfx::dmath {
namespace {

constexpr double kInf = std::numeric_limits<double>::infinity();
constexpr double kNaN = std::numeric_limits<double>::quiet_NaN();

// ln(2) split so that k·kLn2Hi is exact for |k| < 2^20.
constexpr double kLn2Hi = 6.93147180369123816490e-01;
constexpr double kLn2Lo = 1.90821492927058770002e-10;
constexpr double kLog2Of10 = 3.32192809488736234787;
constexpr double kLog10Of2 = 0.301029995663981195214;
constexpr double kHalfSqrt2 = 0.707106781186547524401;

// fdlibm __kernel_sin / __kernel_cos minimax coefficients, |x| <= π/4.
constexpr double S1 = -1.66666666666666324348e-01;
constexpr double S2 = 8.33333333332248946124e-03;
constexpr double S3 = -1.98412698298579493134e-04;
constexpr double S4 = 2.75573137070700676789e-06;
constexpr double S5 = -2.50507602534068634195e-08;
constexpr double S6 = 1.58969099521155010221e-10;

constexpr double C1 = 4.16666666666666019037e-02;
constexpr double C2 = -1.38888888888741095749e-03;
constexpr double C3 = 2.48015872894767294178e-05;
constexpr double C4 = -2.75573143513906633035e-07;
constexpr double C5 = 2.08757232129817482790e-09;
constexpr double C6 = -1.13596475577881948265e-11;

// fdlibm __ieee754_exp coefficients.
constexpr double P1 = 1.66666666666666019037e-01;
constexpr double P2 = -2.77777777770155933842e-03;
constexpr double P3 = 6.61375632143793436117e-05;
constexpr double P4 = -1.65339022054652515390e-06;
constexpr double P5 = 4.13813679705723846039e-08;

// fdlibm __ieee754_log coefficients.
constexpr double Lg1 = 6.666666666666735130e-01;
constexpr double Lg2 = 3.999999999940941908e-01;
constexpr double Lg3 = 2.857142874366239149e-01;
constexpr double Lg4 = 2.222219843214978396e-01;
constexpr double Lg5 = 1.818357216161805012e-01;
constexpr double Lg6 = 1.531383769920937332e-01;
constexpr double Lg7 = 1.479819860511658591e-01;

double kernelSin(double x) {
  const double z = x * x;
  const double r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + x * z * (S1 + z * r);
}

double kernelCos(double x) {
  const double z = x * x;
  const double r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  return 1.0 - (0.5 * z - z * r);
}

}  // namespace

double sinTurns(double t) {
  if (!std::isfinite(t)) return kNaN;
  t -= std::floor(t);                      // [0, 1)
  const double q = std::floor(t * 4.0 + 0.5);  // nearest quadrant, 0..4
  const double r = (t - q * 0.25) * kTwoPi;    // |r| <= π/4
  switch (static_cast<int>(q) & 3) {
    case 0: return kernelSin(r);
    case 1: return kernelCos(r);
    case 2: return -kernelSin(r);
    default: return -kernelCos(r);
  }
}

double cosTurns(double t) {
  if (!std::isfinite(t)) return kNaN;
  return sinTurns(t - std::floor(t) + 0.25);
}

double sin(double x) { return sinTurns(x / kTwoPi); }
double cos(double x) { return cosTurns(x / kTwoPi); }
double tan(double x) { return sin(x) / cos(x); }

double exp(double x) {
  if (std::isnan(x)) return x;
  if (x > 709.78) return kInf;
  if (x < -708.0) return 0.0;
  const double k = std::floor(x * kInvLn2 + 0.5);
  const double hi = x - k * kLn2Hi;
  const double lo = k * kLn2Lo;
  const double r = hi - lo;
  const double z = r * r;
  const double c = r - z * (P1 + z * (P2 + z * (P3 + z * (P4 + z * P5))));
  const double y = 1.0 - ((lo - (r * c) / (2.0 - c)) - hi);
  return std::ldexp(y, static_cast<int>(k));
}

double exp2(double x) {
  if (std::isnan(x)) return x;
  if (x >= 1024.0) return kInf;
  if (x < -1021.0) return 0.0;
  const double k = std::floor(x + 0.5);
  const double f = x - k;  // exact, |f| <= 0.5
  return std::ldexp(exp(f * kLn2), static_cast<int>(k));
}

double log(double x) {
  if (std::isnan(x)) return x;
  if (x < 0.0) return kNaN;
  if (x == 0.0) return -kInf;
  if (std::isinf(x)) return x;
  int e = 0;
  double m = std::frexp(x, &e);  // [0.5, 1), exact
  if (m < kHalfSqrt2) {
    m *= 2.0;
    e -= 1;
  }
  const double f = m - 1.0;  // [√2/2 − 1, √2 − 1)
  const double s = f / (2.0 + f);
  const double z = s * s;
  const double r = z * (Lg1 + z * (Lg2 + z * (Lg3 + z * (Lg4 + z * (Lg5 + z * (Lg6 + z * Lg7))))));
  const double hfsq = 0.5 * f * f;
  const double k = static_cast<double>(e);
  return k * kLn2Hi - ((hfsq - (s * (hfsq + r) + k * kLn2Lo)) - f);
}

double log2(double x) { return log(x) * kInvLn2; }
double log10(double x) { return log2(x) * kLog10Of2; }

double pow(double base, double exponent) {
  if (exponent == 0.0) return 1.0;
  if (base == 1.0) return 1.0;
  if (!(base > 0.0)) return base == 0.0 && exponent > 0.0 ? 0.0 : kNaN;
  return exp2(exponent * log2(base));
}

double tanh(double x) {
  const double a = std::fabs(x);
  if (std::isnan(x)) return x;
  if (a > 22.0) return x > 0.0 ? 1.0 : -1.0;
  if (a < 1e-9) return x;
  const double t = exp(2.0 * a);
  const double y = (t - 1.0) / (t + 1.0);
  return x < 0.0 ? -y : y;
}

double dbToGain(double db) { return exp2(db * (kLog2Of10 / 20.0)); }

double gainToDb(double gain) {
  if (gain <= 0.0) return -kInf;
  return log2(gain) * (20.0 * kLog10Of2);
}

}  // namespace makesfx::dmath
