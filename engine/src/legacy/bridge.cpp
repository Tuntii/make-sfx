#include "legacy/bridge.hpp"

#include <algorithm>
#include <functional>
#include <optional>
#include <utility>

#include "legacy/api.hpp"
#include "legacy/js.hpp"
#include "legacy/legacy.hpp"
#include "render/report.hpp"
#include "render/wav.hpp"

namespace makesfx::legacy {
namespace {

struct Call {
  const SoundConfig& config;
  const BridgeOptions& options;
  std::span<const float> in0;
  std::span<const float> in1;
  BridgeResult& out;

  double sr() const { return options.render.sampleRate; }

  // Unseeded calls use seed 0, like unseeded renders.
  Mulberry32 rng() const {
    return drySynthRng(options.render.seed ? js::toUint32(*options.render.seed) : 0u);
  }

  std::vector<float> input0() const { return {in0.begin(), in0.end()}; }
  std::vector<float> input1() const { return {in1.begin(), in1.end()}; }

  void buffer(std::vector<float> samples) { out.buffers.push_back(std::move(samples)); }

  void fail(std::string code, std::string path, std::string message) {
    out.diagnostics.push_back({Severity::Error, std::move(code), std::move(path), std::move(message), {}});
  }

  // Synthesis ops refuse configs that would render past the length limit.
  bool lengthOk() {
    Diagnostics d = checkRenderLength(config);
    if (d.empty()) return true;
    for (Diagnostic& x : d) out.diagnostics.push_back(std::move(x));
    return false;
  }

  std::optional<Category> category() {
    if (!options.render.category) fail("E_REQUIRED", "options:/category", "category is required");
    return options.render.category;
  }

  const VoicePatch* voice() {
    if (!config.voice) fail("E_REQUIRED", "/voice", "voice is required");
    return config.voice ? &*config.voice : nullptr;
  }
};

void encode(BridgeResult& out, const std::vector<std::vector<float>>& channels, double sampleRate) {
  RenderedAudio audio;
  audio.sampleRate = sampleRate;
  audio.channels = channels;
  WavFormat format;
  format.sampleRate = static_cast<std::uint32_t>(sampleRate);
  format.format = SampleFormat::Pcm16;
  format.dither = false;  // 1.x renderSound() quantizes without dither
  out.bytes = encodeWav(audio, format);
}

using Op = std::function<void(Call&)>;

const std::vector<std::pair<std::string_view, Op>>& ops() {
  static const std::vector<std::pair<std::string_view, Op>> table = {
      // synth.ts, layers.ts, modulation.ts, texture.ts, duration.ts
      {"buildSamples",
       [](Call& c) {
         if (!c.lengthOk()) return;
         Mulberry32 r = c.rng();
         c.buffer(buildSamples(c.config.params, r, c.sr()));
       }},
      {"synthesizeLayers",
       [](Call& c) {
         if (!c.lengthOk()) return;
         Mulberry32 r = c.rng();
         c.buffer(synthesizeLayers(c.config.params, c.config.oscillators.value_or(std::vector<OscillatorLayer>{}),
                                   c.config.master, r, c.sr()));
       }},
      {"applyModulators",
       [](Call& c) {
         c.buffer(applyModulators(c.input0(), c.config.modulators.value_or(std::vector<ModulatorConfig>{}), c.sr()));
       }},
      {"applyTexture",
       [](Call& c) {
         Mulberry32 r = c.rng();
         c.buffer(applyTexture(c.input0(), c.config.texture, r, c.sr()));
       }},
      {"applyMasterEnvelope", [](Call& c) { c.buffer(applyMasterEnvelope(c.input0(), c.config.master, c.sr())); }},
      {"envelopeLength", [](Call& c) { c.out.number = envelopeLength(c.config.params); }},
      {"resolveDurationScale",
       [](Call& c) { c.out.number = resolveDurationScale(c.config.params, c.config.master); }},
      {"scaleParamsDuration",
       [](Call& c) { c.out.json = toJson(scaleParamsDuration(c.config.params, c.config.master)); }},

      // voice.ts
      {"synthesizeVoice",
       [](Call& c) {
         const VoicePatch* v = c.voice();
         if (v == nullptr || !c.lengthOk()) return;
         Mulberry32 r = c.rng();
         c.buffer(synthesizeVoice(*v, r, c.sr()));
       }},
      {"voiceLength",
       [](Call& c) {
         if (const VoicePatch* v = c.voice()) c.out.number = voiceLength(*v);
       }},
      {"fitVoiceDuration",
       [](Call& c) {
         if (const VoicePatch* v = c.voice()) c.out.json = toJson(fitVoiceDuration(*v, c.config.master));
       }},
      {"shiftVoicePitch",
       [](Call& c) {
         const VoicePatch* v = c.voice();
         if (!c.options.factor) c.fail("E_REQUIRED", "options:/factor", "factor is required");
         if (v != nullptr && c.options.factor) c.out.json = toJson(shiftVoicePitch(*v, *c.options.factor));
       }},

      // fx.ts
      {"applyFx", [](Call& c) { c.buffer(applyFx(c.input0(), c.config.fx.value_or(FxParams{}), c.sr())); }},
      {"applyFxStereo",
       [](Call& c) {
         std::vector<float> left;
         std::vector<float> right;
         applyFxStereo(c.input0(), c.config.fx.value_or(FxParams{}), c.sr(), left, right);
         c.buffer(std::move(left));
         c.buffer(std::move(right));
       }},
      {"computeFxTailSamples",
       [](Call& c) {
         c.out.number = static_cast<double>(computeFxTailSamples(c.config.fx.value_or(FxParams{}), c.sr()));
       }},

      // loudness.ts
      {"measureLufs", [](Call& c) { c.out.number = measureLufs(c.input0(), c.sr()); }},
      {"measureIntegratedLufs", [](Call& c) { c.out.number = measureIntegratedLufs(c.input0(), c.sr()); }},
      {"measureTruePeak", [](Call& c) { c.out.number = measureTruePeak(c.input0()); }},
      {"applyTruePeakLimit",
       [](Call& c) { c.buffer(applyTruePeakLimit(c.input0(), c.options.ceilingDbTp.value_or(-1.0))); }},
      {"applyLoudnessGain",
       [](Call& c) {
         c.buffer(applyLoudnessGain(c.input0(), c.options.gain.value_or(1.0), c.options.ceilingDbTp.value_or(-1.0)));
       }},
      {"mixDownMono", [](Call& c) { c.buffer(mixDownMono(c.input0(), c.input1())); }},
      {"normalizeLoudness",
       [](Call& c) {
         if (const auto cat = c.category()) {
           c.buffer(normalizeLoudness(c.input0(), *cat, c.sr(),
                                      c.options.toleranceLufs.value_or(kLoudnessToleranceLufs)));
         }
       }},
      {"normalizeLoudnessStereo",
       [](Call& c) {
         if (const auto cat = c.category()) {
           std::vector<float> left = c.input0();
           std::vector<float> right = c.input1();
           normalizeLoudnessStereo(left, right, *cat, c.sr(),
                                   c.options.toleranceLufs.value_or(kLoudnessToleranceLufs));
           c.buffer(std::move(left));
           c.buffer(std::move(right));
         }
       }},

      // variation.ts
      {"applyVariation",
       [](Call& c) {
         if (!c.options.render.seed) c.fail("E_REQUIRED", "options:/seed", "seed is required");
         else c.out.json = toJson(applyVariation(c.config, js::toUint32(*c.options.render.seed)));
       }},

      // render.ts
      {"synthesizeDry",
       [](Call& c) {
         if (!c.lengthOk()) return;
         Mulberry32 r = c.rng();
         c.buffer(synthesizeDry(c.config, r, c.sr()));
       }},
      {"synthesizeFull",
       [](Call& c) {
         if (!c.lengthOk()) return;
         Mulberry32 r = c.rng();
         std::vector<float> dry = synthesizeDry(c.config, r, c.sr());
         c.buffer(c.config.fx ? applyFx(dry, *c.config.fx, c.sr()) : std::move(dry));
       }},
      {"renderMasteredBuffer",
       [](Call& c) {
         if (!c.lengthOk()) return;
         MasteredBuffer m = renderMasteredBuffer(c.config, c.options.render);
         c.out.json = std::string("{\"stereo\":") + (m.stereo ? "true" : "false") +
                      (m.category ? std::string(",\"category\":\"") + toString(*m.category) + "\"" : "") + "}";
         c.buffer(std::move(m.mono));
         if (m.stereo) {
           c.buffer(std::move(m.left));
           c.buffer(std::move(m.right));
         }
       }},
      {"renderSound",
       [](Call& c) {
         if (!c.lengthOk()) return;
         MasteredBuffer m = renderMasteredBuffer(c.config, c.options.render);
         if (m.stereo) encode(c.out, {std::move(m.left), std::move(m.right)}, c.sr());
         else encode(c.out, {std::move(m.mono)}, c.sr());
       }},

      // wav.ts
      {"encodeWav", [](Call& c) { encode(c.out, {c.input0()}, c.sr()); }},
      {"encodeWavStereo",
       [](Call& c) {
         // The shorter channel is padded with silence.
         std::vector<float> left = c.input0();
         std::vector<float> right = c.input1();
         const std::size_t frames = std::max(left.size(), right.size());
         left.resize(frames, 0.0f);
         right.resize(frames, 0.0f);
         encode(c.out, {std::move(left), std::move(right)}, c.sr());
       }},
  };
  return table;
}

}  // namespace

BridgeResult bridgeCall(std::string_view op, std::string_view configJson, std::string_view optionsJson,
                        std::span<const float> in0, std::span<const float> in1) {
  BridgeResult out;
  const Op* handler = nullptr;
  for (const auto& [name, fn] : ops()) {
    if (name == op) handler = &fn;
  }
  if (handler == nullptr) {
    out.diagnostics.push_back({Severity::Error, "E_UNKNOWN_OP", "", "unknown bridge op \"" + std::string(op) + "\"", {}});
    return out;
  }

  Result<SoundConfig> config = configJson.empty() ? Result<SoundConfig>::success(SoundConfig{})
                                                  : parseSoundConfig(configJson);
  Result<BridgeOptions> options = parseBridgeOptions(optionsJson);
  out.diagnostics = config.diagnostics();
  for (Diagnostic d : options.diagnostics()) {
    d.path = "options:" + d.path;
    out.diagnostics.push_back(std::move(d));
  }
  if (!config || !options) return out;

  Call call{config.value(), options.value(), in0, in1, out};
  (*handler)(call);
  out.ok = !hasErrors(out.diagnostics);
  if (!out.ok) {
    out.buffers.clear();
    out.bytes.clear();
    out.json.clear();
  }
  return out;
}

}  // namespace makesfx::legacy
