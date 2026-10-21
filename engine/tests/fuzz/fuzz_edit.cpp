// libFuzzer target for sample editing. Inputs starting with "RIFF" are decoded
// as WAV and run through a fixed edit program; anything else is used as the
// edit program on a short fixed clip. Seeds: tests/golden/edit/.

#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

#include "edit/edit.hpp"
#include "render/wav_read.hpp"

namespace {

makesfx::RenderedAudio fixedClip() {
  makesfx::RenderedAudio a;
  a.sampleRate = 22050.0;
  a.channels = {std::vector<float>(4410), std::vector<float>(4410)};
  for (std::size_t i = 0; i < 4410; ++i) {
    const float v = (i % 2205 < 200) ? static_cast<float>(i % 37) / 37.0f - 0.5f : 0.0f;
    a.channels[0][i] = v;
    a.channels[1][i] = -v;
  }
  return a;
}

}  // namespace

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
  const std::string_view text(reinterpret_cast<const char*>(data), size);
  if (text.starts_with("RIFF")) {
    const auto decoded = makesfx::decodeWav(std::span(data, size));
    if (decoded) {
      (void)makesfx::edit::inspectJson(decoded.value().audio, "");
      (void)makesfx::edit::applyEdits(decoded.value().audio,
                                      R"({"ops":[{"op":"slice","onsets":true},{"op":"trim_silence"},)"
                                      R"({"op":"pitch","semitones":5},{"op":"normalize","category":"ui"}]})");
    }
    return 0;
  }
  static const makesfx::RenderedAudio clip = fixedClip();
  (void)makesfx::edit::applyEdits(clip, text);
  return 0;
}
