#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "legacy/rng.hpp"
#include "legacy/types.hpp"
#include "makesfx/result.hpp"

// make-sfx 1.x render pipeline, ported from packages/core/src (spec §12.3).
// Offline and buffer-based like the original; the block-based `sfx`
// instrument for projects builds on these functions later.

namespace makesfx::legacy {

// synth.ts
std::vector<float> buildSamples(const SoundParams& params, Mulberry32& random, double sampleRate);

// duration.ts
double envelopeLength(const SoundParams& p);
double resolveDurationScale(const SoundParams& p, const std::optional<MasterParams>& master);
SoundParams scaleParamsDuration(const SoundParams& p, const std::optional<MasterParams>& master);
std::vector<float> applyMasterEnvelope(std::vector<float> samples, const std::optional<MasterParams>& master,
                                       double sampleRate);

// layers.ts, modulation.ts, texture.ts
std::vector<float> synthesizeLayers(const SoundParams& base, const std::vector<OscillatorLayer>& layers,
                                    const std::optional<MasterParams>& master, Mulberry32& random,
                                    double sampleRate);
std::vector<float> applyModulators(std::vector<float> samples, const std::vector<ModulatorConfig>& modulators,
                                   double sampleRate);
std::vector<float> applyTexture(std::vector<float> samples, const std::optional<TextureParams>& texture,
                                Mulberry32& random, double sampleRate);

// voice.ts
double voiceLength(const VoicePatch& patch);
VoicePatch fitVoiceDuration(const VoicePatch& patch, const std::optional<MasterParams>& master);
VoicePatch shiftVoicePitch(const VoicePatch& patch, double factor);
std::vector<float> synthesizeVoice(const VoicePatch& patch, Mulberry32& random, double sampleRate);

// fx.ts
std::vector<float> applyFx(const std::vector<float>& samples, const FxParams& fx, double sampleRate);
void applyFxStereo(const std::vector<float>& samples, const FxParams& fx, double sampleRate,
                   std::vector<float>& left, std::vector<float>& right);
// Samples the delay taps and reverb tail may add beyond the dry length.
std::size_t computeFxTailSamples(const FxParams& fx, double sampleRate);

// loudness.ts
double measureLufs(const std::vector<float>& samples, double sampleRate);            // category (momentary max)
double measureIntegratedLufs(const std::vector<float>& samples, double sampleRate);  // ungated integrated
double measureTruePeak(const std::vector<float>& samples);                            // dBTP, 4x oversampled
std::vector<float> applyTruePeakLimit(const std::vector<float>& samples, double ceilingDbTp);
std::vector<float> mixDownMono(const std::vector<float>& left, const std::vector<float>& right);
inline constexpr double kLoudnessToleranceLufs = 2.0;
// samples × gain, then the true-peak limiter at `ceilingDbTp`.
std::vector<float> applyLoudnessGain(const std::vector<float>& samples, double gain, double ceilingDbTp);
std::vector<float> normalizeLoudness(const std::vector<float>& samples, Category category, double sampleRate,
                                     double toleranceLufs = kLoudnessToleranceLufs);
void normalizeLoudnessStereo(std::vector<float>& left, std::vector<float>& right, Category category,
                             double sampleRate, double toleranceLufs = kLoudnessToleranceLufs);
// The same iteration towards any loudness target (momentary max, LUFS), with
// the true-peak limiter at -1 dBTP.
std::vector<float> normalizeLoudnessTo(const std::vector<float>& samples, double target, double sampleRate,
                                       double toleranceLufs);
void normalizeLoudnessStereoTo(std::vector<float>& left, std::vector<float>& right, double target,
                               double sampleRate, double toleranceLufs);

// variation.ts
SoundConfig applyVariation(const SoundConfig& config, std::uint32_t seed);

// render.ts
// Voice or layers → modulators → texture → master envelope (no variation, no FX).
std::vector<float> synthesizeDry(const SoundConfig& config, Mulberry32& random, double sampleRate);
MasteredBuffer renderMasteredBuffer(const SoundConfig& config, const RenderOptions& options);

// JSON input (TS SoundConfig / SoundParams shape). Unknown fields and wrong
// types are errors with JSON Pointer paths; nothing is silently ignored.
Result<SoundConfig> parseSoundConfig(std::string_view json);
Result<RenderOptions> parseRenderOptions(std::string_view json);

// Scalar arguments of a bridge call (bridge.hpp); keys are snake_case.
struct BridgeOptions {
  RenderOptions render;  // seed, category, preset_id, normalize, sample_rate
  Opt factor;            // shiftVoicePitch
  Opt ceilingDbTp;       // ceiling_dbtp
  Opt toleranceLufs;     // tolerance_lufs
  Opt gain;
  std::optional<std::string> format;  // WAV encoding: "pcm16" (default), "pcm24", "f32"
};
Result<BridgeOptions> parseBridgeOptions(std::string_view json);

// JSON output in the TS shape (json_out.cpp); unset fields are omitted.
std::string toJson(const SoundConfig& config);
std::string toJson(const SoundParams& params);
std::string toJson(const VoicePatch& voice);

}  // namespace makesfx::legacy
