# make-sfx engine (C++)

Deterministic SFX and music engine behind make-sfx 2.0. Design:
[`docs/superpowers/specs/2026-10-20-cpp-audio-engine-design.md`](../docs/superpowers/specs/2026-10-20-cpp-audio-engine-design.md).

Status: **M1 — make-sfx 1.x pipeline ported.** On top of the M0 infrastructure
(deterministic math, RNG, SHA-256, WAV writer, C ABI, golden corpus), `src/legacy/`
renders 1.x `SoundConfig` JSON — ZzFX core, layers, LFOs, texture, the voice
synth, post-FX and category loudness mastering — matching the TypeScript engine.

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
(C ABI for Unity/Unreal), `makesfx_tests`, and for WASM `makesfx.mjs` + `makesfx.wasm`.

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

## Parity with the TypeScript engine

Until the TS engine is retired (M2), every preset and pack design is rendered
by both engines and compared (loudness ±0.5 LU, true peak, length ±1 ms,
1/3-octave spectrum ±1.5 dB):

```bash
pnpm --filter make-sfx-core build
node engine/tests/parity/parity.mjs packages/core/dist/index.js engine/build/ci/bin/makesfx-cli
```

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
