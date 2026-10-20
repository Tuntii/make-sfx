#include <doctest.h>

#include <string>

#include "engine/params.hpp"

using namespace makesfx;

TEST_CASE("registry entries are well formed") {
  const auto registry = parameterRegistry();
  REQUIRE(!registry.empty());
  for (const ParamDescriptor& p : registry) {
    CAPTURE(std::string(p.path));
    CHECK(!p.path.empty());
    CHECK(p.min < p.max);
    CHECK(p.defaultValue >= p.min);
    CHECK(p.defaultValue <= p.max);
    CHECK(p.smoothingMs >= 0.0);
    CHECK(findParameter(p.path) == &p);
  }
  CHECK(findParameter("does.not.exist") == nullptr);
}

TEST_CASE("parameters JSON") {
  const std::string json = parametersJson();
  CHECK(json.rfind("{\"schema\":\"makesfx-params/1\",\"params\":[", 0) == 0);
  CHECK(json.find("\"path\":\"probe.frequency_hz\"") != std::string::npos);
  CHECK(json.find("\"smoothing\":{\"type\":\"one_pole\",\"ms\":5}") != std::string::npos);
}
