include(FetchContent)

# Header-only use: SOURCE_SUBDIR points at a directory without CMakeLists.txt so
# doctest's own (CMake 4-incompatible) build script is never configured.
FetchContent_Declare(doctest
  URL https://github.com/doctest/doctest/archive/refs/tags/v2.4.11.tar.gz
  URL_HASH SHA256=632ed2c05a7f53fa961381497bf8069093f0d6628c5f26286161fbd32a560186
  SOURCE_SUBDIR do-not-configure
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_MakeAvailable(doctest)

add_executable(makesfx_tests
  main.cpp
  unit/test_dmath.cpp
  unit/test_rng.cpp
  unit/test_sha256.cpp
  unit/test_wav.cpp
  unit/test_probe.cpp
  unit/test_params.cpp
  unit/test_json.cpp
  unit/test_capi.cpp
  golden/test_golden.cpp)
target_link_libraries(makesfx_tests PRIVATE makesfx_core makesfx)
target_include_directories(makesfx_tests PRIVATE ${CMAKE_SOURCE_DIR}/src)
target_include_directories(makesfx_tests SYSTEM PRIVATE ${doctest_SOURCE_DIR}/doctest)
target_compile_definitions(makesfx_tests PRIVATE
  MAKESFX_GOLDEN_FILE="${CMAKE_CURRENT_SOURCE_DIR}/golden/golden.txt")
if(MAKESFX_NO_EXCEPTIONS)
  target_compile_definitions(makesfx_tests PRIVATE DOCTEST_CONFIG_NO_EXCEPTIONS_BUT_WITH_ALL_ASSERTS)
endif()
if(EMSCRIPTEN)
  # Tests run under Node via the toolchain's CMAKE_CROSSCOMPILING_EMULATOR and
  # read the golden file straight from disk.
  target_link_options(makesfx_tests PRIVATE -sNODERAWFS=1 -sALLOW_MEMORY_GROWTH=1 -sEXIT_RUNTIME=1)
endif()
makesfx_apply_flags(makesfx_tests)

add_test(NAME makesfx_tests COMMAND makesfx_tests)
