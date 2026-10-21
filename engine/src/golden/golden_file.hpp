#pragma once

#include <string>
#include <string_view>
#include <vector>

#include "makesfx/result.hpp"

// Golden corpus file (spec §5.3, §13.3). One render per line:
//
//   # comment
//   <name> <kind> <arg1> <arg2> <arg3> <sha256>
//
//   kind "sine" | "saw":  arg1 = frequency_hz, arg2 = sample_rate, arg3 = seconds
//   kind "mathgrid":      args are "-"
//   kind "legacy":        arg1 = SoundConfig JSON path (relative to the golden file),
//                         arg2 = seed or "-", arg3 = category or "-"
//   kind "edit":          arg1 = WAV path, arg2 = edit program JSON path (both
//                         relative), arg3 = "-"; hashes every output clip in order
//
// The same file is checked by the native tests, the WASM tests and `makesfx-cli golden`.

namespace makesfx::golden {

struct Entry {
  std::string name;
  std::string kind;
  std::string arg1, arg2, arg3;
  std::string sha256;
};

Result<std::vector<Entry>> parse(std::string_view text);
std::string serialize(const std::vector<Entry>& entries);

// Renders the entry and returns its hash ("" when the entry is invalid).
// `baseDir` resolves relative paths of legacy entries.
std::string compute(const Entry& entry, const std::string& baseDir);

// Options JSON used for a legacy entry (shared with the WASM test).
std::string legacyOptionsJson(const Entry& entry);

}  // namespace makesfx::golden
