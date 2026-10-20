# make-sfx engine (C++)

Deterministic SFX and music engine behind make-sfx 2.0. Design:
[`docs/superpowers/specs/2026-10-20-cpp-audio-engine-design.md`](../docs/superpowers/specs/2026-10-20-cpp-audio-engine-design.md).

Status: **M2 — make-sfx-core runs on this engine.** On top of the M0 infrastructure
(deterministic math, RNG, SHA-256, WAV writer, C ABI, golden corpus), `src/legacy/`
renders 1.x `SoundConfig` JSON: ZzFX core, layers, LFOs, texture, the voice synth,
post-FX and category loudness mastering. Since M2 the npm package `make-sfx-core`
has no DSP of its own; every render goes through `makesfx.wasm`.

## Build

Requirements: CMake 3.24+, Ninja, a C++20 compiler (MSVC 19.38+, GCC 12+, Clang 17+).

```bash
cmake --preset debug          # or: release, ci (warnings as errors), asan
cmake --build --preset debug
ctest --preset debug
```

WASM (needs an activated [emsdk](https://emscripten.org), `EMSDK` set):

```bash
cmake --preset wasm && cmake --build --preset wasm && ctest --preset wasm
```

Outputs land in `build/<preset>/bin`: `makesfx-cli`, the `makesfx` shared library
(C ABI for Unity/Unreal), `makesfx_tests`, and for WASM `makesfx.wasm`.

## WASM module and make-sfx-core

`makesfx.wasm` is a standalone module (no Emscripten JS glue; one import,
`env.emscripten_notify_memory_growth`). It exports the C ABI of `makesfx.h` and
the private `msfxw_*` bridge (`wasm/exports.cpp`, `src/legacy/bridge.hpp`): one
dispatcher that runs any 1.x pipeline stage (`buildSamples`, `applyFx`,
`measureLufs`, `renderSound`, ...) on JSON config plus float buffers. The bridge
is versioned with the npm package, not with `MSFX_ABI_VERSION`.

`packages/core/wasm/makesfx.wasm` is committed, so the TS packages build without
emsdk. After changing engine code that the WASM module contains:

```bash
cmake --build --preset wasm && ctest --preset wasm
cp build/wasm/bin/makesfx.wasm ../packages/core/wasm/makesfx.wasm
```

The build is reproducible (same bytes from any checkout path); CI fails when the
committed file differs from a fresh Emscripten 3.1.74 build.

The parameter registry of the `sfx` sound lives in `src/legacy/registry.cpp`.
`msfx_parameters_json()` (and `makesfx-cli params`) emits it under `"sfx"`;
make-sfx-core generates its parameter tables, the `SoundParams`/`FxParams`/
`MasterParams`/`TextureParams` types and their defaults from it at build time.

## CLI

```bash
makesfx-cli version
makesfx-cli params                                   # parameter registry (JSON)
makesfx-cli probe saw --freq 220 --seconds 0.5 -o saw.wav --format pcm24
makesfx-cli mathgrid                                 # hash of the math function grid
makesfx-cli legacy jump.json --seed 7 -o jump.wav    # render a 1.x SoundConfig, prints a report
makesfx-cli golden tests/golden/golden.txt [--update]
```

`legacy` prints the render report (spec §12.5): length, category loudness
(momentary max), integrated loudness, true peak and `pcm_sha256`. Invalid input
returns diagnostics with JSON Pointer paths instead of rendering.

## Determinism rules

Output must be bit-identical on every platform (spec §5). In practice:

- Never use `std::sin/cos/exp/log/pow/tanh` in DSP code — use `math/dmath.hpp`.
- Never add `-ffast-math`, `/fp:fast` or FMA contraction; flags live in
  `cmake/MakesfxCompilerFlags.cmake`.
- No global RNG. Derive a `Pcg32` stream with `deriveSeed(...)`.
- Don't call two RNG draws in one expression (`a() - b()`): operand order is
  unspecified in C++ and differs between compilers.
- Flush subnormals explicitly in feedback paths (`dsp::flushDenormal`).

## Golden corpus

`tests/golden/golden.txt` holds the SHA-256 of reference renders. Native tests,
the WASM tests and `makesfx-cli golden` all check it. If a change alters the
output **on purpose**, run `makesfx-cli golden tests/golden/golden.txt --update`
and describe the audible difference in the PR. An unexpected mismatch on one
platform is a determinism bug.

## Parity with the 1.x TypeScript engine

The TS engine was removed in M2. `tests/parity/reference.json` keeps its renders
of every preset and pack design (97 cases: loudness, true peak, length and
1/3-octave band levels), and `check` compares the C++ engine against them
(loudness ±0.5 LU, true peak, length ±1 ms, spectrum ±1.5 dB):

```bash
pnpm --filter make-sfx-core build
node engine/tests/parity/parity.mjs check packages/core/dist/index.js   engine/build/ci/bin/makesfx-cli engine/tests/parity/reference.json
```

The reference was written with `parity.mjs record` from make-sfx-core 1.x
(commit d355585), which only a build of that version can regenerate.

Most presets match sample for sample. Presets with ZzFX `noise` diverge after
~6 ms by design: the noise term is `sin(i^5)`, and once the argument passes 2^40
the engine switches to a deterministic hash sequence with the same distribution
(in JS those values are floating-point noise anyway). They are compared on
loudness and spectrum.

`tests/golden/legacy/*.json` are exported from the TS presets with
`node tests/golden/export-legacy.mjs <packages/core/dist/index.js>`.

## Fuzzing

```bash
cmake --preset fuzz && cmake --build --preset fuzz     # Clang only
build/fuzz/bin/fuzz_legacy -max_total_time=300 corpus tests/golden/legacy
```

## Troubleshooting

- *doctest or yyjson download fails with a TLS error* (some MinGW CMake builds ship
  without CA certificates): download the archives once and pass
  `-DFETCHCONTENT_SOURCE_DIR_DOCTEST=<dir>` / `-DFETCHCONTENT_SOURCE_DIR_YYJSON=<dir>`.
- *Tests exit with code 127 on MinGW*: add the MinGW `bin` directory to `PATH`
  so the runtime DLLs are found.
