#include <doctest.h>

#include <fstream>
#include <sstream>
#include <string>

#include "golden/golden_file.hpp"

// Determinism gate (spec §5.3). Every platform in CI renders the same corpus;
// a mismatch here means the bits differ from the committed reference. If the
// change is intentional, run `makesfx-cli golden tests/golden/golden.txt --update`
// and describe the audible difference in the PR.

TEST_CASE("golden corpus renders bit-identically") {
  std::ifstream in(MAKESFX_GOLDEN_FILE);
  REQUIRE(in.good());
  std::stringstream text;
  text << in.rdbuf();
  const auto entries = makesfx::golden::parse(text.str());
  REQUIRE(entries.ok());
  REQUIRE(entries.value().size() >= 8);

  for (const auto& e : entries.value()) {
    const std::string actual = makesfx::golden::compute(e);
    INFO("entry: ", e.name, "  actual: ", actual);
    CHECK(actual == e.sha256);
  }
}
