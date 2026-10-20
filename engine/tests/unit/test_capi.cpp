#include <doctest.h>

#include <cstring>
#include <string>
#include <vector>

#include "makesfx/makesfx.h"
#include "render/probe.hpp"

TEST_CASE("C ABI version info") {
  CHECK(msfx_abi_version() == MSFX_ABI_VERSION);
  CHECK(std::string(msfx_version()) == MAKESFX_VERSION_STRING);
  CHECK(std::string(msfx_parameters_json()).find("probe.level_db") != std::string::npos);
}

TEST_CASE("C ABI probe render matches the C++ path") {
  const std::size_t frames = msfx_probe_frames(48000.0, 0.1);
  REQUIRE(frames == 4800);
  std::vector<float> out(frames);
  std::size_t written = 0;
  CHECK(msfx_probe_render("saw", 440.0, 48000.0, 0.1, out.data(), out.size(), &written) == MSFX_OK);
  CHECK(written == frames);

  char hex[65] = {};
  CHECK(msfx_probe_sha256("saw", 440.0, 48000.0, 0.1, hex) == MSFX_OK);
  CHECK(std::strlen(hex) == 64);
  CHECK(std::string(hex) == makesfx::pcmSha256(out));
}

TEST_CASE("C ABI rejects bad arguments without crashing") {
  std::vector<float> out(10);
  std::size_t written = 123;
  char hex[65] = {};
  CHECK(msfx_probe_render(nullptr, 440.0, 48000.0, 0.1, out.data(), out.size(), &written) ==
        MSFX_ERR_INVALID_ARGUMENT);
  CHECK(written == 0);
  CHECK(msfx_probe_render("square", 440.0, 48000.0, 0.1, out.data(), out.size(), nullptr) ==
        MSFX_ERR_INVALID_ARGUMENT);
  CHECK(msfx_probe_render("saw", 440.0, 48000.0, 0.1, out.data(), out.size(), nullptr) ==
        MSFX_ERR_BUFFER_TOO_SMALL);
  CHECK(msfx_probe_render("saw", 440.0, 48000.0, 0.1, nullptr, 0, nullptr) == MSFX_ERR_INVALID_ARGUMENT);
  CHECK(msfx_probe_sha256("sine", 1e9, 48000.0, 1.0, hex) == MSFX_ERR_INVALID_ARGUMENT);
  CHECK(msfx_probe_sha256("sine", 440.0, 48000.0, 1.0, nullptr) == MSFX_ERR_INVALID_ARGUMENT);
  CHECK(msfx_math_grid_sha256(nullptr) == MSFX_ERR_INVALID_ARGUMENT);
}
