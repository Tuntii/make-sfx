# ES module + .wasm for Node, browsers and AudioWorklet (spec §15.3, §16.2).
# Memory is fixed at instantiation: growth would detach the ArrayBuffer under
# JS views while audio is running.

add_executable(makesfx_wasm entry.cpp)
set_target_properties(makesfx_wasm PROPERTIES OUTPUT_NAME makesfx SUFFIX ".mjs")
target_link_libraries(makesfx_wasm PRIVATE makesfx)
makesfx_apply_flags(makesfx_wasm)

set(_msfx_exports
  _msfx_version _msfx_abi_version _msfx_parameters_json
  _msfx_probe_frames _msfx_probe_render _msfx_probe_sha256 _msfx_math_grid_sha256
  _malloc _free)
list(JOIN _msfx_exports "," _msfx_exports_csv)

target_link_options(makesfx_wasm PRIVATE
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createMakesfx
  -sENVIRONMENT=node,web,worker
  -sINITIAL_MEMORY=33554432
  -sALLOW_MEMORY_GROWTH=0
  -sFILESYSTEM=0
  "-sEXPORTED_FUNCTIONS=${_msfx_exports_csv}"
  "-sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToUTF8,HEAPF32,HEAPU8")

add_test(NAME wasm_golden
  COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/test-golden.mjs
          $<TARGET_FILE:makesfx_wasm>
          ${CMAKE_SOURCE_DIR}/tests/golden/golden.txt)
