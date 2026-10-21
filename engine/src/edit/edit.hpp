#pragma once

#include <string>
#include <string_view>
#include <vector>

#include "makesfx/result.hpp"
#include "render/report.hpp"

// Sample editing: trim, silence trim, slicing (explicit times or onset
// detection), fades, gain, loudness/peak normalization, reverse, varispeed
// pitch/speed, sample-rate conversion and downmix. Works on any decoded WAV
// (render/wav_read.hpp) and is deterministic like the renderer.

namespace makesfx::edit {

struct Clip {
  RenderedAudio audio;
  // Where the clip's material sits in the input, in input seconds. `scale` is
  // input seconds per clip second (changed by pitch/speed); `reversed` flips
  // the direction.
  double sourceStart = 0.0;
  double sourceEnd = 0.0;
  double scale = 1.0;
  bool reversed = false;
};

struct OnsetOptions {
  double thresholdDb = -40.0;  // quietest onset level (dBFS, 10 ms RMS)
  double riseDb = 10.0;        // jump over the previous 20 ms that counts as a hit
  double minGap = 0.05;        // seconds between onsets
  double preRoll = 0.003;      // seconds kept before each onset
};

// Onset times in seconds, ascending.
std::vector<double> detectOnsets(const RenderedAudio& audio, const OnsetOptions& options);

// {"sample_rate","channels","frames","duration_s","peak_dbfs","true_peak_dbtp",
//  "lufs","integrated_lufs","lead_silence_s","tail_silence_s","onsets_s":[...]}
// `options` (may be empty): {"silence_db":-60,"onsets":{threshold_db,rise_db,min_gap,pre_roll}}.
Result<std::string> inspectJson(const RenderedAudio& audio, std::string_view optionsJson);

// Runs an edit program:
//   {"ops":[{"op":"trim","start":0.1,"end":0.5}, {"op":"slice","onsets":true}, ...]}
// Ops apply in order to every clip; "slice" splits each clip into several.
Result<std::vector<Clip>> applyEdits(const RenderedAudio& input, std::string_view programJson);

// {"clips":[{"index","source_start_s","source_end_s","sample_rate","channels",
//            "frames","duration_s","peak_dbfs","true_peak_dbtp","lufs"}]}
std::string clipsJson(const std::vector<Clip>& clips);

// SHA-256 over every clip in order, each as interleaved float32 LE (golden corpus).
std::string clipsSha256(const std::vector<Clip>& clips);

}  // namespace makesfx::edit
