#include "render/report.hpp"

#include "legacy/legacy.hpp"
#include "math/sha256.hpp"
#include "util/json_writer.hpp"

namespace makesfx {

std::string pcmSha256(const RenderedAudio& audio) {
  Sha256 h;
  const std::size_t frames = audio.frames();
  std::vector<float> frame(audio.channels.size());
  for (std::size_t i = 0; i < frames; ++i) {
    for (std::size_t c = 0; c < audio.channels.size(); ++c) frame[c] = audio.channels[c][i];
    h.updateFloatsLE(frame);
  }
  return h.finishHex();
}

std::string renderReportJson(const RenderedAudio& audio) {
  const std::vector<float> mono = audio.channels.size() == 2
                                      ? legacy::mixDownMono(audio.channels[0], audio.channels[1])
                                      : (audio.channels.empty() ? std::vector<float>{} : audio.channels[0]);
  JsonWriter w;
  w.beginObject();
  w.key("engine_version").value(MAKESFX_VERSION_STRING);
  w.key("sample_rate").value(audio.sampleRate);
  w.key("frames").value(static_cast<long long>(audio.frames()));
  w.key("channels").value(static_cast<long long>(audio.channels.size()));
  w.key("duration_s").value(static_cast<double>(audio.frames()) / audio.sampleRate);
  if (audio.category) w.key("category").value(*audio.category);
  else w.key("category").null();
  w.key("loudness").beginObject();
  w.key("lufs").value(legacy::measureLufs(mono, audio.sampleRate));
  w.key("integrated_lufs").value(legacy::measureIntegratedLufs(mono, audio.sampleRate));
  w.key("true_peak_dbtp").value(legacy::measureTruePeak(mono));
  w.endObject();
  w.key("pcm_sha256").value(pcmSha256(audio));
  w.endObject();
  return w.str();
}

std::vector<std::uint8_t> encodeWav(const RenderedAudio& audio, const WavFormat& format) {
  std::vector<const float*> ptrs;
  for (const auto& ch : audio.channels) ptrs.push_back(ch.data());
  return encodeWav(ptrs, audio.frames(), format);
}

}  // namespace makesfx
