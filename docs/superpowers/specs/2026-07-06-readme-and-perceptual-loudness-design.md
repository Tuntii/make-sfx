# Design: README rewrite + perceptually-accurate loudness

Date: 2026-07-06
Scope: `make-sfx` monorepo — root `README.md` and `packages/core/src/loudness.ts`

## Goal

Two coupled deliverables in one plan:

1. **README** — shorten (~229 → ~120 lines) and lead with the "wow": describe→sound,
   category LUFS mastering, deterministic seed variation. Move build/publish/demo noise
   below the fold into one compact "Development" section (kept in README, not moved out).
2. **DSP — perceptual accuracy** — upgrade loudness measurement/limiting from plain RMS +
   hard-clip to **K-weighted LUFS (ITU-R BS.1770)** and **oversampled true-peak** limiting.

Non-goals this session (YAGNI): biquad EQ rework, allpass reverb, dithering. These are
real follow-ups but out of scope; user chose "perceptual accuracy" which is LUFS + true-peak.

## Current state (facts)

- Signal chain: `layers → modulators → texture → master envelope` (dry) →
  `FX: EQ → saturation → compression → delay → reverb → limiter` → LUFS normalize +
  true-peak → stereo (Haas) → WAV.
- `SAMPLE_RATE = 44100`; WAV output is 16-bit PCM (mono + interleaved stereo).
- `measureLufs` = `20·log10(rms) − 0.691` — plain RMS, no K-weighting, no gating.
- `measureTruePeak` = sample peak in dBFS (no inter-sample detection).
- `applyTruePeakLimit` = hard clip at ceiling (default −1 dBFS).
- Category LUFS targets: ui −14, combat −9, pickup −12, ambient −18, stinger −11.
- Normalization loop (`normalizeLoudness` / `normalizeLoudnessStereo`) is **self-referential**:
  it measures with `measureLufs` and targets `getTargetLufs`, iterating ≤12 passes to ±2 LUFS.
- Tests (`loudness.test.ts`) assert, per category/seed:
  - `measureLufs(mono)` within `target ± 2`,
  - `isWithinLoudnessTarget(mono, category)` true,
  - `measureTruePeak(mono) <= -0.99`.

## Part 1 — README rewrite

New outline (target ~120 lines):

1. **Hero** — one-line positioning + badges + demo GIF + live-demo link.
   Positioning: "Code-driven procedural SFX with broadcast-style loudness mastering —
   Remotion for game audio."
2. **60-second start** — two side-by-side minimal blocks: `describe → WAV` (MCP) and
   `preset → WAV` (code). Highest-impact paths first.
3. **Why it's different** (3 bullets): (a) natural-language → sound via MCP,
   (b) category-based LUFS mastering — sounds auto-sit in the mix,
   (c) deterministic seed variation.
4. **Install** — short.
5. **Sound engineering** — 70+ params collapsed into one foldable table; call out
   K-weighted LUFS + true-peak.
6. **MCP tools** — keep the table.
7. **Presets + links.**
8. **Development** — one compact section (build/test/playground/publish/demo GIF collapsed).

Constraints: keep all existing links/badges/anchors that people may rely on; keep the
core code example accurate against the shipped API.

## Part 2 — DSP: perceptual accuracy (`packages/core/src/loudness.ts`)

Backward-compatible: **function names and signatures unchanged**; only internals upgraded.

### 2a. K-weighted LUFS (`measureLufs`)

Add ITU-R BS.1770 two-stage K-weighting prefilter before mean-square:

- **Stage 1** — high-shelf, ~+4 dB above ~1.5 kHz (biquad).
- **Stage 2** — high-pass, ~38 Hz (biquad).
- Then mean-square over the filtered buffer, `10·log10(ms)` (equivalently keep the
  existing `20·log10(rms)`), minus the `−0.691` absolute offset.
- Coefficients: BS.1770 tabulates them at 48 kHz. Derive 44.1 kHz coefficients from the
  analog prototype via bilinear transform (preferred) so the filter is sample-rate correct.
  Implement as a small `kWeightBiquad` helper with the two stages hardcoded from the
  analog spec, evaluated at `SAMPLE_RATE`.
- **No gating** — SFX are ≥10ms and often <150ms; BS.1770 −70/−10 LUFS gating would drop
  almost everything. Intentional; document with a comment. Keep the existing
  `padForMeasurement` for very short buffers.

Effect: bright (coin) and dark (thud) sounds that read equal in RMS now read closer in
LUFS → normalization makes them perceptually equal-loud. Category targets stay the same
numbers (loop is self-referential, so `expectWithinTarget` still passes); what changes is
the actual output RMS per category, which is the intended perceptual correction.

### 2b. Oversampled true-peak (`measureTruePeak` + `applyTruePeakLimit`)

- **`measureTruePeak`** — 4× upsample (linear or short polyphase FIR), take max |sample|
  over the upsampled signal → dBTP. Reads inter-sample overshoots the current sample-peak
  misses.
- **`applyTruePeakLimit`** — detect the true (oversampled) peak; if above the ceiling
  (−1 dBTP default), apply the single gain reduction needed to bring the true peak under
  ceiling, then a soft-clip guard for any residual. Not just a per-sample hard clip.
  Per-buffer constant gain reduction is sufficient for short SFX (no lookahead window).
- This keeps `measureTruePeak` and `applyTruePeakLimit` **consistent**: a buffer limited by
  `applyTruePeakLimit(x, -1)` measures `<= -0.99` dBTP under the same oversampled metric,
  so the existing true-peak test remains meaningful (and genuinely true-peak, not sample-peak).

Coupling note: 2a and 2b ship together. If `measureTruePeak` became oversampled while the
limiter stayed hard-clip, inter-sample peaks would exceed −1 dBTP and the true-peak test
would fail. They must land in the same change.

## Test strategy

- All existing `loudness.test.ts` cases must stay green.
- Add: K-weighting sanity — a bright tone (high freq) and a dark tone (low freq) at equal RMS
  measure closer in `measureLufs` after normalization than their raw RMS suggests
  (assert the bright/dark LUFS gap is smaller than the RMS gap, or both hit target ±tol).
- Add: oversampled true-peak — a signal engineered to have an inter-sample peak above its
  sample peak (e.g. near-Nyquist half-amplitude tone) reads higher under `measureTruePeak`
  than plain sample-peak, and after `applyTruePeakLimit(-1)` measures `<= -0.99` dBTP.
- `pnpm --filter make-sfx-core test` and full `pnpm build` must pass.

## Risks

- 44.1 kHz K-weighting coefficient derivation is the trickiest bit; verify against a known
  reference level (e.g. a 1 kHz sine at −20 dBFS should read ≈ −20 LUFS after the −0.691
  offset, since K-weighting is ~0 dB at 1 kHz).
- Changing per-category output RMS could subtly alter the demo/example WAVs; regenerate
  example assets if they are committed and compared.

## Sequence

1. `loudness.ts` — K-weighting biquads + `measureLufs` (2a).
2. `loudness.ts` — oversampled `measureTruePeak` + `applyTruePeakLimit` (2b).
3. New tests; run core test suite; fix calibration until green.
4. README rewrite.
5. Full `pnpm build` + `pnpm test`; regenerate example assets if needed.
