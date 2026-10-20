#include "golden/golden_file.hpp"

#include <cstdio>
#include <cstdlib>
#include <sstream>

#include "render/probe.hpp"

namespace makesfx::golden {
namespace {

bool parseNumber(const std::string& token, double& out) {
  if (token == "-") {
    out = 0.0;
    return true;
  }
  char* end = nullptr;
  out = std::strtod(token.c_str(), &end);
  return end != token.c_str() && *end == '\0';
}

std::string formatNumber(double v, bool isMathGrid) {
  if (isMathGrid) return "-";
  char buf[32];
  std::snprintf(buf, sizeof buf, "%.15g", v);
  return buf;
}

constexpr std::string_view kHeader =
    "# make-sfx golden corpus — see engine/README.md before editing.\n"
    "# name signal frequency_hz sample_rate seconds sha256\n";

}  // namespace

Result<std::vector<Entry>> parse(std::string_view text) {
  std::vector<Entry> entries;
  Diagnostics problems;
  std::istringstream lines{std::string(text)};
  std::string line;
  int lineNo = 0;
  while (std::getline(lines, line)) {
    ++lineNo;
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty() || line[0] == '#') continue;
    std::istringstream fields(line);
    Entry e;
    std::string freq, rate, secs;
    if (!(fields >> e.name >> e.signal >> freq >> rate >> secs >> e.sha256) ||
        !parseNumber(freq, e.frequencyHz) || !parseNumber(rate, e.sampleRate) ||
        !parseNumber(secs, e.seconds)) {
      problems.push_back({Severity::Error, "E_GOLDEN_SYNTAX", "line " + std::to_string(lineNo),
                          "expected: name signal frequency_hz sample_rate seconds sha256", {}});
      continue;
    }
    entries.push_back(std::move(e));
  }
  if (!problems.empty()) return Result<std::vector<Entry>>::failure(std::move(problems));
  return Result<std::vector<Entry>>::success(std::move(entries));
}

std::string serialize(const std::vector<Entry>& entries) {
  std::string out(kHeader);
  for (const Entry& e : entries) {
    const bool grid = e.signal == "mathgrid";
    out += e.name + ' ' + e.signal + ' ' + formatNumber(e.frequencyHz, grid) + ' ' +
           formatNumber(e.sampleRate, grid) + ' ' + formatNumber(e.seconds, grid) + ' ' + e.sha256 + '\n';
  }
  return out;
}

std::string compute(const Entry& entry) {
  if (entry.signal == "mathgrid") return mathGridSha256();
  ProbeSpec spec;
  if (!parseProbeSignal(entry.signal, spec.signal)) return {};
  spec.frequencyHz = entry.frequencyHz;
  spec.sampleRate = entry.sampleRate;
  spec.seconds = entry.seconds;
  const auto rendered = renderProbe(spec);
  if (!rendered) return {};
  return pcmSha256(rendered.value());
}

}  // namespace makesfx::golden
