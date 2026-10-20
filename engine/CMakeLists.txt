cmake_minimum_required(VERSION 3.24)

project(makesfx
  VERSION 2.0.0
  DESCRIPTION "make-sfx engine: deterministic SFX and music rendering"
  LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
# Executables and shared libraries side by side, so tests find makesfx.dll on Windows.
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

if(EMSCRIPTEN)
  set(_msfx_default_shared OFF)
  set(_msfx_default_noexcept ON)
else()
  set(_msfx_default_shared ON)
  set(_msfx_default_noexcept OFF)
endif()

option(MAKESFX_BUILD_TESTS "Build unit and golden tests" ON)
option(MAKESFX_BUILD_CLI "Build the makesfx CLI" ON)
option(MAKESFX_BUILD_SHARED "Build the C ABI as a shared library (Unity, Unreal)" ${_msfx_default_shared})
option(MAKESFX_NO_EXCEPTIONS "Compile with exceptions disabled (GCC/Clang only)" ${_msfx_default_noexcept})
option(MAKESFX_WERROR "Treat warnings as errors" OFF)
set(MAKESFX_SANITIZE "" CACHE STRING "Comma-separated sanitizers, e.g. address,undefined")

include(cmake/MakesfxCompilerFlags.cmake)

# ── Core library ────────────────────────────────────────────────────────────
add_library(makesfx_core STATIC
  src/math/dmath.cpp
  src/math/sha256.cpp
  src/render/wav.cpp
  src/render/probe.cpp
  src/engine/params.cpp
  src/golden/golden_file.cpp
  src/util/json_writer.cpp
  src/util/diagnostics.cpp)
target_include_directories(makesfx_core
  PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_compile_definitions(makesfx_core PUBLIC
  MAKESFX_VERSION_STRING="${PROJECT_VERSION}")
makesfx_apply_flags(makesfx_core)

# ── C ABI ───────────────────────────────────────────────────────────────────
if(MAKESFX_BUILD_SHARED)
  add_library(makesfx SHARED src/capi/makesfx_c.cpp)
  target_compile_definitions(makesfx PRIVATE MSFX_BUILDING_SHARED)
  target_compile_definitions(makesfx PUBLIC MSFX_SHARED)
else()
  add_library(makesfx STATIC src/capi/makesfx_c.cpp)
endif()
target_link_libraries(makesfx PRIVATE makesfx_core)
target_include_directories(makesfx
  PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
  PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
set_target_properties(makesfx PROPERTIES
  C_VISIBILITY_PRESET hidden
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN ON)
makesfx_apply_flags(makesfx)

# ── CLI ─────────────────────────────────────────────────────────────────────
if(MAKESFX_BUILD_CLI AND NOT EMSCRIPTEN)
  add_executable(makesfx_cli tools/cli/main.cpp)
  set_target_properties(makesfx_cli PROPERTIES OUTPUT_NAME makesfx-cli)
  target_link_libraries(makesfx_cli PRIVATE makesfx_core)
  target_include_directories(makesfx_cli PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
  makesfx_apply_flags(makesfx_cli)
endif()

# ── WASM module ─────────────────────────────────────────────────────────────
if(EMSCRIPTEN)
  add_subdirectory(wasm)
endif()

# ── Tests ───────────────────────────────────────────────────────────────────
if(MAKESFX_BUILD_TESTS)
  enable_testing()
  add_subdirectory(tests)
endif()
