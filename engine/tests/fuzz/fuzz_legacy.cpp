// libFuzzer target for the JSON → render path (spec §13.6). AI agents generate
// this input; every document must either render or return diagnostics.
//
// Build with Clang: cmake --preset fuzz && cmake --build --preset fuzz
// Run:              build/fuzz/bin/fuzz_legacy -max_total_time=300 <corpus-dir> tests/golden/legacy

#include <cstddef>
#include <cstdint>
#include <string_view>

#include "legacy/api.hpp"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
  const std::string_view config(reinterpret_cast<const char*>(data), size);
  (void)makesfx::legacy::renderJson(config, R"({"seed": 1})");
  return 0;
}
