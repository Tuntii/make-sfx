#pragma once

#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace makesfx {

enum class Severity { Error, Warning, Info };

// A machine-readable problem report (spec §14.5). `path` is a JSON Pointer into
// the input document so an AI agent can fix the exact field.
struct Diagnostic {
  Severity severity = Severity::Error;
  std::string code;     // e.g. "E_OUT_OF_RANGE"
  std::string path;     // e.g. "/instruments/1/filter/0/resonance"
  std::string message;
  std::string hint;
};

using Diagnostics = std::vector<Diagnostic>;

bool hasErrors(const Diagnostics& diagnostics);
std::string toJson(const Diagnostics& diagnostics);

// Value-or-diagnostics, usable with -fno-exceptions. A successful result may
// still carry warnings.
template <class T>
class Result {
public:
  static Result success(T value, Diagnostics warnings = {}) {
    Result r;
    r.value_.emplace(std::move(value));
    r.diagnostics_ = std::move(warnings);
    return r;
  }

  static Result failure(Diagnostics diagnostics) {
    Result r;
    r.diagnostics_ = std::move(diagnostics);
    return r;
  }

  static Result failure(Diagnostic diagnostic) {
    return failure(Diagnostics{std::move(diagnostic)});
  }

  bool ok() const noexcept { return value_.has_value(); }
  explicit operator bool() const noexcept { return ok(); }

  // Precondition: ok().
  T& value() & noexcept { return *value_; }
  const T& value() const& noexcept { return *value_; }
  T&& value() && noexcept { return std::move(*value_); }

  const Diagnostics& diagnostics() const noexcept { return diagnostics_; }

private:
  Result() = default;
  std::optional<T> value_;
  Diagnostics diagnostics_;
};

}  // namespace makesfx
