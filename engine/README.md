# make-sfx engine (C++)

Deterministic SFX and music engine behind make-sfx 2.0. Design:
[`docs/superpowers/specs/2026-10-20-cpp-audio-engine-design.md`](../docs/superpowers/specs/2026-10-20-cpp-audio-engine-design.md).

Status: **M0 — infrastructure.** Deterministic math, RNG, SHA-256, WAV writer,
probe oscillators, parameter registry skeleton, C ABI, CLI, golden corpus.

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
makesfx-cli golden tests/golden/golden.txt [--update]
```

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

## Troubleshooting

- *doctest download fails with a TLS error* (some MinGW CMake builds ship without
  CA certificates): download the archive once and pass
  `-DFETCHCONTENT_SOURCE_DIR_DOCTEST=<path-to-extracted-doctest>`.
- *Tests exit with code 127 on MinGW*: add the MinGW `bin` directory to `PATH`
  so the runtime DLLs are found.
