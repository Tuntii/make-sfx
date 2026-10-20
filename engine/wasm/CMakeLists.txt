# Standalone makesfx.wasm for make-sfx-core (spec §15.3): no Emscripten JS
# glue, so the npm package loads it with its own ~100-line loader, synchronously
# in Node and with `await init()` in browsers.
#
# This module serves offline rendering only, so memory may grow. The realtime
# AudioWorklet module (M6) is a separate target with fixed memory: growth
# detaches the ArrayBuffer under JS views while audio is running.

add_executable(makesfx_wasm exports.cpp)
set_target_properties(makesfx_wasm PROPERTIES OUTPUT_NAME makesfx SUFFIX ".wasm")
target_link_libraries(makesfx_wasm PRIVATE makesfx makesfx_core)
target_include_directories(makesfx_wasm PRIVATE ${CMAKE_SOURCE_DIR}/src)
makesfx_apply_flags(makesfx_wasm)

set(_msfx_exports
  _msfx_version _msfx_abi_version _msfx_parameters_json
  _msfx_probe_frames _msfx_probe_render _msfx_probe_sha256 _msfx_math_grid_sha256
  _msfx_legacy_render _msfx_render_frames _msfx_render_channels _msfx_render_sample_rate
  _msfx_render_channel _msfx_render_wav _msfx_render_report _msfx_render_free
  _msfxw_alloc _msfxw_free _msfxw_call _msfxw_ok _msfxw_diagnostics
  _msfxw_buffer_count _msfxw_buffer_data _msfxw_buffer_length
  _msfxw_bytes_data _msfxw_bytes_length _msfxw_json _msfxw_number _msfxw_release)
list(JOIN _msfx_exports "," _msfx_exports_csv)

target_link_options(makesfx_wasm PRIVATE
  -sSTANDALONE_WASM=1
  --no-entry
  -sINITIAL_MEMORY=16777216
  -sALLOW_MEMORY_GROWTH=1
  -sFILESYSTEM=0
  "-sEXPORTED_FUNCTIONS=${_msfx_exports_csv}")

# The JS loader and golden check run against the same artifact npm ships.
add_test(NAME wasm_golden
  COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/test-golden.mjs
          $<TARGET_FILE:makesfx_wasm>
          ${CMAKE_SOURCE_DIR}/tests/golden/golden.txt)
