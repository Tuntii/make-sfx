#pragma once

#include <string>
#include <string_view>
#include <vector>

#include "makesfx/result.hpp"

// Golden corpus file (spec §5.3, §13.3). One render per line:
//
//   # comment
//   <name> <signal> <frequency_hz> <sample_rate> <seconds> <sha256>
//
// `signal` is a probe signal ("sine", "saw") or "mathgrid" (numeric fields are "-").
// The same file is checked by the native tests, the WASM tests and `makesfx-cli golden`.

namespace makesfx::golden {

struct Entry {
  std::string name;
  std::string signal;
  double frequencyHz = 0.0;
  double sampleRate = 0.0;
  double seconds = 0.0;
  std::string sha256;
};

Result<std::vector<Entry>> parse(std::string_view text);
std::string serialize(const std::vector<Entry>& entries);

// Renders the entry and returns its hash ("" when the entry is invalid).
std::string compute(const Entry& entry);

}  // namespace makesfx::golden
