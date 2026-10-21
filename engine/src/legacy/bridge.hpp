#pragma once

#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "makesfx/result.hpp"

// Stage-level access to the legacy pipeline for make-sfx-core (TypeScript),
// which keeps exporting the 1.x building blocks (buildSamples, applyFx,
// measureLufs, ...) on top of the WASM engine. One dispatcher instead of one
// export per function keeps the WASM surface small; it is not part of the
// stable C ABI (makesfx.h) and may change with the TS package.
//
//   op        name of the 1.x function, e.g. "applyFx"
//   config    SoundConfig-shaped JSON with the blocks the op reads
//             ({"params":{},"fx":{...}}); empty when the op reads none
//   options   scalar arguments: seed, category, preset_id, normalize,
//             sample_rate, factor, ceiling_dbtp, tolerance_lufs, gain, format
//   in0, in1  input sample buffers (mono, or left/right)
//   bytes     input file (WAV) for the audio ops
//
// Audio ops (edit/edit.hpp) take a WAV in `bytes`, or a clip in in0/in1 with
// `sample_rate` in options, and read `config` as their own JSON:
//   decodeWav     → channels in `buffers`, {"sample_rate","channels","bits","float"}
//   inspectAudio  config {"silence_db","onsets":{...}} → stats and onsets
//   editAudio     config {"ops":[...]} → every clip's channels in order, clipsJson()

namespace makesfx::legacy {

struct BridgeResult {
  bool ok = false;
  Diagnostics diagnostics;
  std::vector<std::vector<float>> buffers;  // output samples
  std::vector<std::uint8_t> bytes;          // WAV file for encode/render ops
  std::string json;                         // config-shaped output
  double number = 0.0;                      // scalar output
};

BridgeResult bridgeCall(std::string_view op, std::string_view config, std::string_view options,
                        std::span<const float> in0, std::span<const float> in1,
                        std::span<const std::uint8_t> bytes = {});

}  // namespace makesfx::legacy
