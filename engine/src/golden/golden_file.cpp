#include "golden/golden_file.hpp"

#include <cstdlib>
#include <fstream>
#include <sstream>

#include "legacy/api.hpp"
#include "render/probe.hpp"
#include "render/report.hpp"

namespace makesfx::golden {
namespace {

bool parseNumber(const std::string& token, double& out) {
  char* end = nullptr;
  out = std::strtod(token.c_str(), &end);
  return end != token.c_str() && *end == '\0';
}

constexpr std::string_view kHeader =
    "# make-sfx golden corpus — see engine/README.md before editing.\n"
    "# name kind arg1 arg2 arg3 sha256\n"
    "#   sine|saw: frequency_hz sample_rate seconds   mathgrid: - - -\n"
    "#   legacy: <SoundConfig json, relative path> <seed|-> <category|->\n";

std::string computeProbe(const Entry& e) {
  ProbeSpec spec;
  if (!parseProbeSignal(e.kind, spec.signal)) return {};
  if (!parseNumber(e.arg1, spec.frequencyHz) || !parseNumber(e.arg2, spec.sampleRate) ||
      !parseNumber(e.arg3, spec.seconds)) {
    return {};
  }
  const auto rendered = renderProbe(spec);
  if (!rendered) return {};
  return pcmSha256(rendered.value());
}

std::string computeLegacy(const Entry& e, const std::string& baseDir) {
  std::ifstream in(baseDir + "/" + e.arg1, std::ios::binary);
  if (!in) return {};
  std::stringstream text;
  text << in.rdbuf();
  const auto rendered = legacy::renderJson(text.str(), legacyOptionsJson(e));
  if (!rendered) return {};
  return pcmSha256(rendered.value());
}

}  // namespace

std::string legacyOptionsJson(const Entry& e) {
  std::string json = "{";
  if (e.arg2 != "-") json += "\"seed\":" + e.arg2;
  if (e.arg3 != "-") json += std::string(json.size() > 1 ? "," : "") + "\"category\":\"" + e.arg3 + "\"";
  return json + "}";
}

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
    if (!(fields >> e.name >> e.kind >> e.arg1 >> e.arg2 >> e.arg3 >> e.sha256)) {
      problems.push_back({Severity::Error, "E_GOLDEN_SYNTAX", "line " + std::to_string(lineNo),
                          "expected: name kind arg1 arg2 arg3 sha256", {}});
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
    out += e.name + ' ' + e.kind + ' ' + e.arg1 + ' ' + e.arg2 + ' ' + e.arg3 + ' ' + e.sha256 + '\n';
  }
  return out;
}

std::string compute(const Entry& entry, const std::string& baseDir) {
  if (entry.kind == "mathgrid") return mathGridSha256();
  if (entry.kind == "legacy") return computeLegacy(entry, baseDir);
  return computeProbe(entry);
}

}  // namespace makesfx::golden
