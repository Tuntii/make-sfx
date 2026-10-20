#include "makesfx/result.hpp"
#include "util/json_writer.hpp"

namespace makesfx {

bool hasErrors(const Diagnostics& diagnostics) {
  for (const Diagnostic& d : diagnostics) {
    if (d.severity == Severity::Error) return true;
  }
  return false;
}

std::string toJson(const Diagnostics& diagnostics) {
  JsonWriter w;
  w.beginArray();
  for (const Diagnostic& d : diagnostics) {
    w.beginObject();
    w.key("severity").value(d.severity == Severity::Error     ? "error"
                            : d.severity == Severity::Warning ? "warning"
                                                              : "info");
    w.key("code").value(d.code);
    w.key("path").value(d.path);
    w.key("message").value(d.message);
    if (!d.hint.empty()) w.key("hint").value(d.hint);
    w.endObject();
  }
  w.endArray();
  return w.str();
}

}  // namespace makesfx
