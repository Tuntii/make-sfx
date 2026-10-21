#pragma once

#include <cstddef>
#include <span>
#include <vector>

namespace makesfx::dsp {

// Band-limited resampling with a Kaiser-windowed sinc (16 zero crossings per
// side, β = 8.6, about −90 dB stopband). `ratio` = output rate / input rate:
// 0.5 halves the length (an octave up when played at the original rate),
// 2 doubles it. When shortening, the cutoff follows the new Nyquist so no
// aliasing folds back. Output length is floor(input × ratio).
std::vector<float> resample(std::span<const float> input, double ratio);

}  // namespace makesfx::dsp
