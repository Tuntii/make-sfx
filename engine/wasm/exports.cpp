// WASM-only exports for make-sfx-core (TypeScript). The C ABI functions in
// makesfx.h are exported as well (see CMakeLists.txt); everything here is
// private to the npm package and versioned with it, not with MSFX_ABI_VERSION.

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <span>
#include <string>
#include <string_view>

#include "legacy/bridge.hpp"
#include "makesfx/makesfx.h"

namespace {

struct Call {
  makesfx::legacy::BridgeResult result;
  std::string diagnostics;
};

std::string_view view(const char* data, std::size_t len) {
  return data != nullptr ? std::string_view(data, len) : std::string_view();
}

std::span<const float> span(const float* data, std::size_t len) {
  return data != nullptr ? std::span<const float>(data, len) : std::span<const float>();
}

}  // namespace

extern "C" {

MSFX_API void* msfxw_alloc(std::size_t size) { return std::malloc(size); }

MSFX_API void msfxw_free(void* ptr) { std::free(ptr); }

// Never returns null; check msfxw_ok() and read msfxw_diagnostics().
MSFX_API Call* msfxw_call(const char* op, std::size_t op_len, const char* config, std::size_t config_len,
                          const char* options, std::size_t options_len, const float* in0, std::size_t n0,
                          const float* in1, std::size_t n1) {
  auto* call = new Call{makesfx::legacy::bridgeCall(view(op, op_len), view(config, config_len),
                                                    view(options, options_len), span(in0, n0), span(in1, n1)),
                        {}};
  call->diagnostics = makesfx::toJson(call->result.diagnostics);
  return call;
}

MSFX_API int msfxw_ok(const Call* c) { return c->result.ok ? 1 : 0; }

MSFX_API const char* msfxw_diagnostics(const Call* c) { return c->diagnostics.c_str(); }

MSFX_API std::size_t msfxw_buffer_count(const Call* c) { return c->result.buffers.size(); }

MSFX_API const float* msfxw_buffer_data(const Call* c, std::size_t i) { return c->result.buffers[i].data(); }

MSFX_API std::size_t msfxw_buffer_length(const Call* c, std::size_t i) { return c->result.buffers[i].size(); }

MSFX_API const std::uint8_t* msfxw_bytes_data(const Call* c) { return c->result.bytes.data(); }

MSFX_API std::size_t msfxw_bytes_length(const Call* c) { return c->result.bytes.size(); }

MSFX_API const char* msfxw_json(const Call* c) { return c->result.json.c_str(); }

MSFX_API double msfxw_number(const Call* c) { return c->result.number; }

MSFX_API void msfxw_release(Call* c) { delete c; }

}  // extern "C"
