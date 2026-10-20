/*
 * make-sfx C ABI — the single binding surface for Unity (P/Invoke), Unreal,
 * WASM/JS, Python and other hosts. See spec §15.2.
 *
 * Rules:
 *  - Only C types cross this boundary; no C++ exception ever escapes.
 *  - Every function is NULL-safe and reports failure through a status code.
 *  - Strings returned as `const char*` are owned by the library and stay valid
 *    for the lifetime of the process unless documented otherwise.
 *
 * M0 surface: version info, parameter registry and probe renders used to prove
 * cross-platform determinism. Project compilation and rendering arrive in M1.
 */
#ifndef MAKESFX_H
#define MAKESFX_H

#include <stddef.h>

#if defined(__EMSCRIPTEN__)
#  include <emscripten/emscripten.h>
#  define MSFX_API EMSCRIPTEN_KEEPALIVE
#elif defined(_WIN32) && defined(MSFX_SHARED)
#  if defined(MSFX_BUILDING_SHARED)
#    define MSFX_API __declspec(dllexport)
#  else
#    define MSFX_API __declspec(dllimport)
#  endif
#elif defined(MSFX_BUILDING_SHARED)
#  define MSFX_API __attribute__((visibility("default")))
#else
#  define MSFX_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Bumped on every incompatible ABI change. Bindings check it at load time. */
#define MSFX_ABI_VERSION 1u

typedef enum msfx_status {
  MSFX_OK = 0,
  MSFX_ERR_INVALID_ARGUMENT = -1,
  MSFX_ERR_BUFFER_TOO_SMALL = -2,
  MSFX_ERR_INTERNAL = -3
} msfx_status;

/* Thread-safe. Semantic version of the engine, e.g. "2.0.0". */
MSFX_API const char* msfx_version(void);

/* Thread-safe. Equals MSFX_ABI_VERSION of the built library. */
MSFX_API unsigned msfx_abi_version(void);

/* Thread-safe. Parameter registry as JSON (spec §6.4). */
MSFX_API const char* msfx_parameters_json(void);

/*
 * Probe renders — deterministic reference signals ("sine", "saw").
 * Thread-safe; no shared state.
 */

/* Number of frames a probe render of `seconds` at `sample_rate` produces; 0 if invalid. */
MSFX_API size_t msfx_probe_frames(double sample_rate, double seconds);

/* Renders a mono probe into `out`. `frames_written` receives the frame count. */
MSFX_API int msfx_probe_render(const char* signal, double frequency_hz, double sample_rate,
                               double seconds, float* out, size_t capacity,
                               size_t* frames_written);

/* SHA-256 (lowercase hex, NUL-terminated) of the probe's float32 little-endian PCM. */
MSFX_API int msfx_probe_sha256(const char* signal, double frequency_hz, double sample_rate,
                               double seconds, char out_hex[65]);

/* SHA-256 of the deterministic math function grid (spec §5.2). */
MSFX_API int msfx_math_grid_sha256(char out_hex[65]);

/*
 * Renders (spec §15.2). A render owns its PCM, WAV bytes and report; pointers
 * returned for a render stay valid until msfx_render_free().
 */
typedef struct msfx_render msfx_render;

/*
 * Renders a make-sfx 1.x SoundConfig (or bare SoundParams) JSON document.
 * options_json (may be NULL): {"seed", "category", "preset_id", "normalize", "sample_rate"}.
 * On return *diagnostics_json (if non-NULL) points to a JSON array of problems,
 * valid until the next msfx_* call on the same thread.
 */
MSFX_API int msfx_legacy_render(const char* config_json, size_t config_len, const char* options_json,
                                msfx_render** out, const char** diagnostics_json);

MSFX_API size_t msfx_render_frames(const msfx_render* render);
MSFX_API unsigned msfx_render_channels(const msfx_render* render);
MSFX_API double msfx_render_sample_rate(const msfx_render* render);

/* Channel samples; `stem` must be NULL (master) until stems exist. */
MSFX_API const float* msfx_render_channel(const msfx_render* render, const char* stem, unsigned channel);

/* WAV encoding; format_json (may be NULL): {"format": "pcm16"|"pcm24"|"f32", "dither": bool, "dither_seed": n}. */
MSFX_API int msfx_render_wav(msfx_render* render, const char* stem, const char* format_json,
                             const unsigned char** bytes, size_t* len);

/* Render report JSON (spec §12.5). */
MSFX_API const char* msfx_render_report(const msfx_render* render);

MSFX_API void msfx_render_free(msfx_render* render);

#ifdef __cplusplus
}
#endif

#endif /* MAKESFX_H */
