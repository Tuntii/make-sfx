#include "makesfx/makesfx.h"

#include <cstring>
#include <string>

#include "engine/params.hpp"
#include "render/probe.hpp"

namespace {

bool buildProbe(const char* signal, double frequencyHz, double sampleRate, double seconds,
                makesfx::ProbeSpec& spec) {
  if (signal == nullptr) return false;
  if (!makesfx::parseProbeSignal(signal, spec.signal)) return false;
  spec.frequencyHz = frequencyHz;
  spec.sampleRate = sampleRate;
  spec.seconds = seconds;
  return makesfx::validateProbe(spec).empty();
}

void copyHex(const std::string& hex, char out[65]) {
  std::memcpy(out, hex.c_str(), 65);  // 64 digits + NUL
}

}  // namespace

extern "C" {

MSFX_API const char* msfx_version(void) { return MAKESFX_VERSION_STRING; }

MSFX_API unsigned msfx_abi_version(void) { return MSFX_ABI_VERSION; }

MSFX_API const char* msfx_parameters_json(void) {
  static const std::string json = makesfx::parametersJson();
  return json.c_str();
}

MSFX_API size_t msfx_probe_frames(double sample_rate, double seconds) {
  return makesfx::probeFrames(sample_rate, seconds);
}

MSFX_API int msfx_probe_render(const char* signal, double frequency_hz, double sample_rate,
                               double seconds, float* out, size_t capacity,
                               size_t* frames_written) {
  if (frames_written != nullptr) *frames_written = 0;
  makesfx::ProbeSpec spec;
  if (out == nullptr || !buildProbe(signal, frequency_hz, sample_rate, seconds, spec)) {
    return MSFX_ERR_INVALID_ARGUMENT;
  }
  const size_t frames = makesfx::probeFrames(sample_rate, seconds);
  if (capacity < frames) return MSFX_ERR_BUFFER_TOO_SMALL;
  makesfx::renderProbeInto(spec, out);
  if (frames_written != nullptr) *frames_written = frames;
  return MSFX_OK;
}

MSFX_API int msfx_probe_sha256(const char* signal, double frequency_hz, double sample_rate,
                               double seconds, char out_hex[65]) {
  makesfx::ProbeSpec spec;
  if (out_hex == nullptr || !buildProbe(signal, frequency_hz, sample_rate, seconds, spec)) {
    return MSFX_ERR_INVALID_ARGUMENT;
  }
  const auto result = makesfx::renderProbe(spec);
  if (!result) return MSFX_ERR_INTERNAL;
  copyHex(makesfx::pcmSha256(result.value()), out_hex);
  return MSFX_OK;
}

MSFX_API int msfx_math_grid_sha256(char out_hex[65]) {
  if (out_hex == nullptr) return MSFX_ERR_INVALID_ARGUMENT;
  copyHex(makesfx::mathGridSha256(), out_hex);
  return MSFX_OK;
}

}  // extern "C"
