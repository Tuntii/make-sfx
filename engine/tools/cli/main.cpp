// makesfx CLI (M0): version, parameter registry, probe renders, golden corpus.
//
//   makesfx-cli version
//   makesfx-cli params
//   makesfx-cli probe <sine|saw> [--freq HZ] [--sr HZ] [--seconds S] [-o out.wav] [--format pcm16|pcm24|f32]
//   makesfx-cli mathgrid
//   makesfx-cli golden <golden.txt> [--update]

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include "engine/params.hpp"
#include "golden/golden_file.hpp"
#include "render/probe.hpp"
#include "render/wav.hpp"
#include "util/json_writer.hpp"

namespace {

using namespace makesfx;

int usage() {
  std::fputs(
      "usage:\n"
      "  makesfx-cli version\n"
      "  makesfx-cli params\n"
      "  makesfx-cli probe <sine|saw> [--freq HZ] [--sr HZ] [--seconds S] [-o out.wav]"
      " [--format pcm16|pcm24|f32]\n"
      "  makesfx-cli mathgrid\n"
      "  makesfx-cli golden <golden.txt> [--update]\n",
      stderr);
  return 2;
}

bool parseDouble(const char* text, double& out) {
  char* end = nullptr;
  out = std::strtod(text, &end);
  return end != text && *end == '\0';
}

int cmdProbe(int argc, char** argv) {
  if (argc < 3) return usage();
  ProbeSpec spec;
  if (!parseProbeSignal(argv[2], spec.signal)) {
    std::fprintf(stderr, "unknown signal: %s\n", argv[2]);
    return 2;
  }
  std::string outPath;
  SampleFormat format = SampleFormat::Pcm24;
  for (int i = 3; i < argc; ++i) {
    const std::string_view arg = argv[i];
    const bool hasValue = i + 1 < argc;
    if (arg == "--freq" && hasValue) {
      if (!parseDouble(argv[++i], spec.frequencyHz)) return usage();
    } else if (arg == "--sr" && hasValue) {
      if (!parseDouble(argv[++i], spec.sampleRate)) return usage();
    } else if (arg == "--seconds" && hasValue) {
      if (!parseDouble(argv[++i], spec.seconds)) return usage();
    } else if (arg == "-o" && hasValue) {
      outPath = argv[++i];
    } else if (arg == "--format" && hasValue) {
      const std::string_view f = argv[++i];
      if (f == "pcm16") format = SampleFormat::Pcm16;
      else if (f == "pcm24") format = SampleFormat::Pcm24;
      else if (f == "f32") format = SampleFormat::Float32;
      else return usage();
    } else {
      return usage();
    }
  }

  const auto result = renderProbe(spec);
  if (!result) {
    std::printf("%s\n", toJson(result.diagnostics()).c_str());
    return 1;
  }
  const std::vector<float>& pcm = result.value();

  if (!outPath.empty()) {
    const float* channels[] = {pcm.data()};
    WavFormat wf;
    wf.sampleRate = static_cast<std::uint32_t>(spec.sampleRate);
    wf.format = format;
    const auto bytes = encodeWav(channels, pcm.size(), wf);
    std::ofstream file(outPath, std::ios::binary);
    file.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    if (!file) {
      std::fprintf(stderr, "cannot write %s\n", outPath.c_str());
      return 1;
    }
  }

  JsonWriter w;
  w.beginObject();
  w.key("frames").value(static_cast<long long>(pcm.size()));
  w.key("sample_rate").value(spec.sampleRate);
  w.key("pcm_sha256").value(pcmSha256(pcm));
  if (!outPath.empty()) w.key("wav").value(outPath);
  w.endObject();
  std::printf("%s\n", w.str().c_str());
  return 0;
}

int cmdGolden(int argc, char** argv) {
  if (argc < 3) return usage();
  const std::string path = argv[2];
  const bool update = argc > 3 && std::string_view(argv[3]) == "--update";

  std::ifstream in(path);
  if (!in) {
    std::fprintf(stderr, "cannot read %s\n", path.c_str());
    return 1;
  }
  std::stringstream text;
  text << in.rdbuf();
  auto entries = golden::parse(text.str());
  if (!entries) {
    std::printf("%s\n", toJson(entries.diagnostics()).c_str());
    return 1;
  }

  int mismatches = 0;
  for (golden::Entry& e : entries.value()) {
    const std::string actual = golden::compute(e);
    if (actual != e.sha256) {
      ++mismatches;
      std::printf("%s %s -> %s\n", update ? "updated " : "MISMATCH", e.name.c_str(), actual.c_str());
      e.sha256 = actual;
    }
  }
  if (update && mismatches > 0) {
    std::ofstream out(path, std::ios::binary);
    out << golden::serialize(entries.value());
  }
  std::printf("%zu entries, %d %s\n", entries.value().size(), mismatches,
              update ? "updated" : "mismatched");
  return (!update && mismatches > 0) ? 1 : 0;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) return usage();
  const std::string_view cmd = argv[1];
  if (cmd == "version") {
    std::printf("%s\n", MAKESFX_VERSION_STRING);
    return 0;
  }
  if (cmd == "params") {
    std::printf("%s\n", parametersJson().c_str());
    return 0;
  }
  if (cmd == "probe") return cmdProbe(argc, argv);
  if (cmd == "mathgrid") {
    std::printf("%s\n", mathGridSha256().c_str());
    return 0;
  }
  if (cmd == "golden") return cmdGolden(argc, argv);
  return usage();
}
