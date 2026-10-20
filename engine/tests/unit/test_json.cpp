#include <doctest.h>

#include <limits>
#include <string>

#include "makesfx/result.hpp"
#include "util/json_writer.hpp"

using namespace makesfx;

// Expected strings live outside CHECK(): MSVC's preprocessor mishandles raw
// string literals inside macro arguments.

TEST_CASE("JsonWriter separators and nesting") {
  JsonWriter w;
  w.beginObject();
  w.key("a").value(1.5);
  w.key("b").beginArray().value(true).value(false).null().endArray();
  w.key("c").beginObject().endObject();
  w.key("n").value(static_cast<long long>(-3));
  w.endObject();
  const std::string expected = R"({"a":1.5,"b":[true,false,null],"c":{},"n":-3})";
  CHECK(w.str() == expected);
}

TEST_CASE("JsonWriter escapes strings and maps non-finite numbers to null") {
  JsonWriter w;
  w.beginArray();
  w.value("q\"b\\n\n\x01");
  w.value(std::numeric_limits<double>::infinity());
  w.endArray();
  const std::string expected = R"(["q\"b\\n\n\u0001",null])";
  CHECK(w.str() == expected);
}

TEST_CASE("diagnostics serialize to JSON") {
  Diagnostics d = {{Severity::Error, "E_OUT_OF_RANGE", "/x", "too big", "use 1"},
                   {Severity::Warning, "W_UNKNOWN", "/y", "ignored", {}}};
  CHECK(hasErrors(d));
  const std::string expected =
      R"([{"severity":"error","code":"E_OUT_OF_RANGE","path":"/x","message":"too big","hint":"use 1"},)"
      R"({"severity":"warning","code":"W_UNKNOWN","path":"/y","message":"ignored"}])";
  CHECK(toJson(d) == expected);
  CHECK_FALSE(hasErrors({d[1]}));
}

TEST_CASE("Result carries a value or diagnostics") {
  auto ok = Result<int>::success(5);
  CHECK(ok.ok());
  CHECK(ok.value() == 5);
  auto bad = Result<int>::failure(Diagnostic{Severity::Error, "E", "/", "m", {}});
  CHECK_FALSE(bad.ok());
  CHECK(bad.diagnostics().size() == 1);
}
