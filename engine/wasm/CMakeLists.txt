# ES module + .wasm for Node and browsers (spec §15.3).
#
# This module serves offline rendering only, so memory may grow. The realtime
# AudioWorklet module (M6) is a separate target with fixed memory: growth
# detaches the ArrayBuffer under JS views while audio is running.

add_executable(makesfx_wasm entry.cpp)
set_target_properties(makesfx_wasm PROPERTIES OUTPUT_NAME makesfx SUFFIX ".mjs")
target_link_libraries(makesfx_wasm PRIVATE makesfx)
makesfx_apply_flags(makesfx_wasm)

set(_msfx_exports
  _msfx_version _msfx_abi_version _msfx_parameters_json
  _msfx_probe_frames _msfx_probe_render _msfx_probe_sha256 _msfx_math_grid_sha256
  _msfx_legacy_render _msfx_render_frames _msfx_render_channels _msfx_render_sample_rate
  _msfx_render_channel _msfx_render_wav _msfx_render_report _msfx_render_free
  _malloc _free)
list(JOIN _msfx_exports "," _msfx_exports_csv)

target_link_options(makesfx_wasm PRIVATE
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createMakesfx
  -sENVIRONMENT=node,web,worker
  -sINITIAL_MEMORY=33554432
  -sALLOW_MEMORY_GROWTH=1
  -sFILESYSTEM=0
  "-sEXPORTED_FUNCTIONS=${_msfx_exports_csv}"
  "-sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToUTF8,lengthBytesUTF8,HEAPF32,HEAPU8,getValue")

add_test(NAME wasm_golden
  COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/test-golden.mjs
          $<TARGET_FILE:makesfx_wasm>
          ${CMAKE_SOURCE_DIR}/tests/golden/golden.txt)
