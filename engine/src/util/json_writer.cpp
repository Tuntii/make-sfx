#include "util/json_writer.hpp"

#include <cmath>
#include <cstdio>

namespace makesfx {

void appendJsonString(std::string& out, std::string_view s) {
  static constexpr char kHex[] = "0123456789abcdef";
  out.push_back('"');
  for (const char ch : s) {
    const auto c = static_cast<unsigned char>(ch);
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          out += "\\u00";
          out.push_back(kHex[c >> 4]);
          out.push_back(kHex[c & 0x0f]);
        } else {
          out.push_back(ch);
        }
    }
  }
  out.push_back('"');
}

void JsonWriter::separator() {
  if (afterKey_) {
    afterKey_ = false;
    return;
  }
  if (!hasItems_.empty()) {
    if (hasItems_.back()) out_.push_back(',');
    hasItems_.back() = true;
  }
}

JsonWriter& JsonWriter::beginObject() {
  separator();
  out_.push_back('{');
  hasItems_.push_back(false);
  return *this;
}

JsonWriter& JsonWriter::endObject() {
  out_.push_back('}');
  hasItems_.pop_back();
  return *this;
}

JsonWriter& JsonWriter::beginArray() {
  separator();
  out_.push_back('[');
  hasItems_.push_back(false);
  return *this;
}

JsonWriter& JsonWriter::endArray() {
  out_.push_back(']');
  hasItems_.pop_back();
  return *this;
}

JsonWriter& JsonWriter::key(std::string_view k) {
  separator();
  appendJsonString(out_, k);
  out_.push_back(':');
  afterKey_ = true;
  return *this;
}

JsonWriter& JsonWriter::value(std::string_view v) {
  separator();
  appendJsonString(out_, v);
  return *this;
}

JsonWriter& JsonWriter::value(double v) {
  separator();
  if (!std::isfinite(v)) {
    out_ += "null";  // JSON has no inf/NaN
    return *this;
  }
  char buf[32];
  const int n = std::snprintf(buf, sizeof buf, "%.15g", v);
  for (int i = 0; i < n; ++i) {
    out_.push_back(buf[i] == ',' ? '.' : buf[i]);
  }
  return *this;
}

JsonWriter& JsonWriter::value(long long v) {
  separator();
  out_ += std::to_string(v);
  return *this;
}

JsonWriter& JsonWriter::value(bool v) {
  separator();
  out_ += v ? "true" : "false";
  return *this;
}

JsonWriter& JsonWriter::null() {
  separator();
  out_ += "null";
  return *this;
}

}  // namespace makesfx
