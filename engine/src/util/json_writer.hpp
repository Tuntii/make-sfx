#pragma once

#include <string>
#include <string_view>
#include <vector>

namespace makesfx {

// Minimal streaming JSON writer for registry, diagnostics and report output.
// Numbers use "%.15g" with a locale-independent decimal point, so output is
// stable even when a host (game engine) changes the C locale.
class JsonWriter {
public:
  JsonWriter& beginObject();
  JsonWriter& endObject();
  JsonWriter& beginArray();
  JsonWriter& endArray();

  JsonWriter& key(std::string_view k);
  JsonWriter& value(std::string_view v);
  JsonWriter& value(const char* v) { return value(std::string_view(v)); }
  JsonWriter& value(double v);
  // Shortest representation that parses back to exactly `v` (for values a
  // caller feeds back into the engine, such as varied configs).
  JsonWriter& exact(double v);
  JsonWriter& value(long long v);
  JsonWriter& value(bool v);
  JsonWriter& null();

  const std::string& str() const noexcept { return out_; }

private:
  void separator();

  std::string out_;
  std::vector<bool> hasItems_;  // one entry per open container
  bool afterKey_ = false;
};

void appendJsonString(std::string& out, std::string_view s);

}  // namespace makesfx
