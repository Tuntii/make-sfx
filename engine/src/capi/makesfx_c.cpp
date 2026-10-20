#include "makesfx/makesfx.h"

#include <cstring>
#include <string>
#include <string_view>
#include <vector>

#include <yyjson.h>

#include "engine/params.hpp"
#include "legacy/api.hpp"
#include "render/probe.hpp"
#include "render/report.hpp"

struct msfx_render {
  makesfx::RenderedAudio audio;
  std::string report;
  std::vector<std::uint8_t> wav;
};

namespace {

thread_local std::string tlsDiagnostics;

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

void setDiagnostics(const char** out, const makesfx::Diagnostics& diagnostics) {
  tlsDiagnostics = makesfx::toJson(diagnostics);
  if (out != nullptr) *out = tlsDiagnostics.c_str();
}

bool parseWavFormat(const char* json, makesfx::WavFormat& format) {
  if (json == nullptr || *json == '\0') return true;
  yyjson_doc* doc = yyjson_read(json, std::strlen(json), 0);
  if (doc == nullptr) return false;
  bool ok = true;
  yyjson_val* root = yyjson_doc_get_root(doc);
  if (!yyjson_is_obj(root)) ok = false;
  if (yyjson_val* v = yyjson_obj_get(root, "format"); ok && v != nullptr) {
    const std::string_view f = yyjson_is_str(v) ? std::string_view(yyjson_get_str(v), yyjson_get_len(v)) : "";
    if (f == "pcm16") format.format = makesfx::SampleFormat::Pcm16;
    else if (f == "pcm24") format.format = makesfx::SampleFormat::Pcm24;
    else if (f == "f32") format.format = makesfx::SampleFormat::Float32;
    else ok = false;
  }
  if (yyjson_val* v = yyjson_obj_get(root, "dither"); ok && v != nullptr) {
    if (yyjson_is_bool(v)) format.dither = yyjson_get_bool(v);
    else ok = false;
  }
  if (yyjson_val* v = yyjson_obj_get(root, "dither_seed"); ok && v != nullptr) {
    if (yyjson_is_uint(v)) format.ditherSeed = yyjson_get_uint(v);
    else ok = false;
  }
  yyjson_doc_free(doc);
  return ok;
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

MSFX_API int msfx_legacy_render(const char* config_json, size_t config_len, const char* options_json,
                                msfx_render** out, const char** diagnostics_json) {
  if (out != nullptr) *out = nullptr;
  if (config_json == nullptr || out == nullptr) {
    setDiagnostics(diagnostics_json, {});
    return MSFX_ERR_INVALID_ARGUMENT;
  }
  const std::string_view options = options_json != nullptr ? std::string_view(options_json) : std::string_view();
  auto rendered = makesfx::legacy::renderJson(std::string_view(config_json, config_len), options);
  setDiagnostics(diagnostics_json, rendered.diagnostics());
  if (!rendered) return MSFX_ERR_INVALID_ARGUMENT;

  auto* render = new msfx_render{std::move(rendered).value(), {}, {}};
  render->report = makesfx::renderReportJson(render->audio);
  *out = render;
  return MSFX_OK;
}

MSFX_API size_t msfx_render_frames(const msfx_render* render) { return render ? render->audio.frames() : 0; }

MSFX_API unsigned msfx_render_channels(const msfx_render* render) {
  return render ? static_cast<unsigned>(render->audio.channels.size()) : 0u;
}

MSFX_API double msfx_render_sample_rate(const msfx_render* render) {
  return render ? render->audio.sampleRate : 0.0;
}

MSFX_API const float* msfx_render_channel(const msfx_render* render, const char* stem, unsigned channel) {
  if (render == nullptr || stem != nullptr || channel >= render->audio.channels.size()) return nullptr;
  return render->audio.channels[channel].data();
}

MSFX_API int msfx_render_wav(msfx_render* render, const char* stem, const char* format_json,
                             const unsigned char** bytes, size_t* len) {
  if (render == nullptr || stem != nullptr || bytes == nullptr || len == nullptr) return MSFX_ERR_INVALID_ARGUMENT;
  makesfx::WavFormat format;
  format.sampleRate = static_cast<std::uint32_t>(render->audio.sampleRate);
  if (!parseWavFormat(format_json, format)) return MSFX_ERR_INVALID_ARGUMENT;
  render->wav = makesfx::encodeWav(render->audio, format);
  if (render->wav.empty()) return MSFX_ERR_INTERNAL;
  *bytes = render->wav.data();
  *len = render->wav.size();
  return MSFX_OK;
}

MSFX_API const char* msfx_render_report(const msfx_render* render) {
  return render ? render->report.c_str() : "";
}

MSFX_API void msfx_render_free(msfx_render* render) { delete render; }

}  // extern "C"
