#include "legacy/registry.hpp"

#include <array>

namespace makesfx::legacy {
namespace {

struct Group {
  std::string_view id, label, labelTr;
};

constexpr std::array kGroups = {
    Group{"output", "Output", "Çıkış"},
    Group{"oscillator", "Oscillator", "Osilatör"},
    Group{"envelope", "Envelope (ADSR)", "Zarf (ADSR)"},
    Group{"pitch", "Pitch / Glide", "Perde / Kayma"},
    Group{"modulation", "Modulation", "Modülasyon"},
    Group{"filter", "Filter", "Filtre"},
    Group{"texture", "Texture / FX", "Doku / Efekt"},
    Group{"master", "Duration / Master", "Süre / Master"},
    Group{"layers", "Extra Oscillators", "Ek Osilatörler"},
    Group{"modulators", "LFO Modulators", "LFO Modülasyon"},
    Group{"textureFx", "Texture Processing", "Doku İşleme"},
    Group{"postFx", "Post-Processing", "Post-İşleme"},
};

struct WaveShape {
  int value;
  std::string_view label, description;
};

constexpr std::array kWaveShapes = {
    WaveShape{0, "Sine", "Soft, pure tone — UI blips, notifications"},
    WaveShape{1, "Triangle", "Buzzy, hollow — jumps, retro arcade"},
    WaveShape{2, "Saw", "Bright, aggressive — lasers, alarms"},
    WaveShape{3, "Tan", "Harsh, metallic — impacts, clangs"},
    WaveShape{4, "Noise", "Random — explosions, wind, scratches"},
    WaveShape{5, "Square", "Chiptune, 8-bit — coins, powerups. Use pulseWidth for duty cycle (12.5–50%)."},
};

struct ModTargetSpec {
  std::string_view value, label, labelTr;
};

// The engine also accepts "pan"; UIs list the three targets below.
constexpr std::array kModTargets = {
    ModTargetSpec{"amplitude", "Amplitude", "Genlik"},
    ModTargetSpec{"pitch", "Pitch", "Perde"},
    ModTargetSpec{"filter", "Filter", "Filtre"},
};

constexpr std::array kParams = {
    SfxParamSpec{"params.volume", "output", "Volume", "Ses Seviyesi", 0.0, 1.0, 0.01, 1.0, "gain",
     "Master output level before post-processing.",
     "Louder impacts: 0.8–1.0. Subtle UI: 0.3–0.5."},
    SfxParamSpec{"params.randomness", "output", "Randomness", "Rastgelelik", 0.0, 0.3, 0.01, 0.05, "",
     "Random pitch variation on each play — organic feel.",
     "0 for consistent UI. 0.05–0.15 for natural game SFX."},
    SfxParamSpec{"params.frequency", "oscillator", "Frequency", "Frekans", 40.0, 4000.0, 5.0, 220.0, "Hz",
     "Base pitch. 440 = A4 reference.",
     "Bass/explosion: 60–150. Mid UI: 400–900. Bright tick: 1000–2000."},
    SfxParamSpec{"params.shape", "oscillator", "Wave Shape", "Dalga Formu", 0.0, 5.0, 1.0, 0.0, "",
     "Oscillator waveform: 0=sine, 1=triangle, 2=saw, 3=tan, 4=noise, 5=square.",
     "Use sine for clean UI, triangle/saw for arcade, noise for impacts."},
    SfxParamSpec{"params.shapeCurve", "oscillator", "Shape Curve", "Dalga Eğrisi", 0.1, 4.0, 0.1, 1.0, "",
     "Wave shaping intensity — higher = harsher harmonics (applies to non-square shapes). For square (shape=5) use pulseWidth for duty cycle instead.",
     "1 = neutral. 2–3 for punchy hits. 0.5 for softer tones."},
    SfxParamSpec{"params.pulseWidth", "oscillator", "Pulse Width", "Pulse Genişliği", 0.05, 0.95, 0.01, 0.5, "",
     "Duty cycle for square wave (shape=5). 0.5=50% (classic), 0.25=25% (hollow retro), 0.125=12.5% (thin chiptune).",
     "Retro 8-bit: 0.12–0.3 for authentic pulse. 0.5 for standard square."},
    SfxParamSpec{"params.noise", "oscillator", "Noise Mix", "Gürültü Karışımı", 0.0, 1.0, 0.05, 0.0, "",
     "Blend noise into the oscillator — airy, gritty texture.",
     "0.2–0.6 for explosions, footsteps, mechanical sounds."},
    SfxParamSpec{"params.attack", "envelope", "Attack", "Attack", 0.0, 0.5, 0.005, 0.0, "s",
     "Fade-in time — 0 = instant transient (click).",
     "0 for snappy UI. 0.02–0.08 for soft pads. Keep low for game responsiveness."},
    SfxParamSpec{"params.decay", "envelope", "Decay", "Decay", 0.0, 0.5, 0.005, 0.0, "s",
     "Time to fall from peak to sustain level.",
     "Short decay (0.01–0.05) for punchy hits. Longer for swelling sounds."},
    SfxParamSpec{"params.sustain", "envelope", "Sustain", "Sustain", 0.0, 0.8, 0.01, 0.0, "s",
     "Hold duration at sustain volume before release.",
     "Near 0 for one-shot SFX. 0.05–0.2 for engine/hum loops."},
    SfxParamSpec{"params.sustainVolume", "envelope", "Sustain Level", "Sustain Seviyesi", 0.0, 1.0, 0.05, 1.0, "",
     "Volume held during sustain phase (0–1).",
     "0.3–0.6 for plucky sounds. 1.0 for full-body tones."},
    SfxParamSpec{"params.release", "envelope", "Release", "Release", 0.0, 1.5, 0.01, 0.1, "s",
     "Fade-out tail after sustain.",
     "0.03–0.08 for tight UI. 0.2–0.5 for cinematic tails."},
    SfxParamSpec{"params.slide", "pitch", "Pitch Slide", "Perde Kayması", -1.0, 1.0, 0.05, 0.0, "",
     "Initial pitch glide direction — positive = rising, negative = falling.",
     "+0.2–0.5 for jump/powerup swoosh. -0.2–0.4 for fall/damage."},
    SfxParamSpec{"params.deltaSlide", "pitch", "Slide Acceleration", "Kayma İvmesi", -0.5, 0.5, 0.01, 0.0, "",
     "Acceleration of pitch slide — curved pitch envelope.",
     "Negative deltaSlide with positive slide = arc that falls back."},
    SfxParamSpec{"params.pitchJump", "pitch", "Pitch Jump", "Perde Sıçraması", -2.0, 2.0, 0.05, 0.0, "",
     "Sudden pitch offset after pitchJumpTime.",
     "Use for two-tone effects: coin pickup, alert double-beep."},
    SfxParamSpec{"params.pitchJumpTime", "pitch", "Pitch Jump Time", "Sıçrama Zamanı", 0.0, 0.3, 0.005, 0.0, "s",
     "When the pitch jump triggers.",
     "0.02–0.06 for quick two-note chirps."},
    SfxParamSpec{"params.modulation", "modulation", "Frequency Mod", "Frekans Modülasyonu", 0.0, 20.0, 0.5, 0.0, "",
     "Vibrato/FM depth — wobble or metallic timbre.",
     "1–5 for subtle vibrato. 8+ for sci-fi laser wobble."},
    SfxParamSpec{"params.tremolo", "modulation", "Tremolo", "Tremolo", 0.0, 1.0, 0.05, 0.0, "",
     "Amplitude pulsing depth.",
     "0.2–0.5 with repeatTime for machine-gun or alarm pulse."},
    SfxParamSpec{"params.repeatTime", "modulation", "Repeat Cycle", "Tekrar Döngüsü", 0.0, 0.2, 0.005, 0.0, "s",
     "Reset pitch/slide every N seconds — rhythmic loops.",
     "0.03–0.08 for rapid stutter effects."},
    SfxParamSpec{"params.filter", "filter", "Filter", "Filtre", -1.0, 1.0, 0.05, 0.0, "",
     "Biquad filter. Negative = low-pass (warm/dark). Positive = high-pass (thin/bright).",
     "-0.1 to -0.4 for muffled underwater. +0.1 to +0.3 for thin telephone UI."},
    SfxParamSpec{"params.bitCrush", "texture", "Bit Crush", "Bit Crush", 0.0, 0.2, 0.005, 0.0, "",
     "Lo-fi digital degradation — retro grit.",
     "0.02–0.08 for 8-bit aesthetic. 0 for clean modern."},
    SfxParamSpec{"params.delay", "texture", "Echo Delay", "Yankı Gecikmesi", 0.0, 0.3, 0.005, 0.0, "s",
     "Built-in single echo — doubles the sound with offset.",
     "0.05–0.15 for cave/room feel before post-FX reverb."},
    SfxParamSpec{"fx.reverbMix", "postFx", "Reverb Mix", "Reverb Karışımı", 0.0, 1.0, 0.05, 0.0, "",
     "Room/hall reverb wet level.",
     "0.1–0.3 for subtle space. 0.4+ for large hall/explosion tail."},
    SfxParamSpec{"fx.reverbDecay", "postFx", "Reverb Decay", "Reverb Süresi", 0.1, 3.0, 0.1, 0.8, "s",
     "Reverb tail length.",
     "0.3 for small room. 1.5+ for cathedral/canyon."},
    SfxParamSpec{"fx.delayTime", "postFx", "Delay Time", "Delay Süresi", 0.0, 0.5, 0.005, 0.0, "s",
     "Stereo delay tap time.",
     "0.08–0.15 for slapback. 0.2+ for rhythmic echo."},
    SfxParamSpec{"fx.delayMix", "postFx", "Delay Mix", "Delay Karışımı", 0.0, 1.0, 0.05, 0.0, "",
     "Delayed signal blend.",
     "Pair with delayTime. 0.2–0.4 for sci-fi laser trails."},
    SfxParamSpec{"fx.delayFeedback", "postFx", "Delay Feedback", "Delay Geri Besleme", 0.0, 0.85, 0.05, 0.3, "",
     "Echo repeats decay — higher = more echoes.",
     "0.2–0.5 for natural echo. 0.6+ for dub-style trails."},
    SfxParamSpec{"fx.eqLow", "postFx", "EQ Low", "EQ Bas", -12.0, 12.0, 0.5, 0.0, "dB",
     "Low shelf boost/cut (~200 Hz).",
     "+3–6 dB for punchy explosions. -6 for thin UI ticks."},
    SfxParamSpec{"fx.eqMid", "postFx", "EQ Mid", "EQ Orta", -12.0, 12.0, 0.5, 0.0, "dB",
     "Mid band boost/cut (~1 kHz).",
     "Cut mids for hollow retro. Boost for presence in mix."},
    SfxParamSpec{"fx.eqHigh", "postFx", "EQ High", "EQ Tiz", -12.0, 12.0, 0.5, 0.0, "dB",
     "High shelf boost/cut (~4 kHz).",
     "+4–8 for bright sparkle UI. -6 for muffled/distant."},
    SfxParamSpec{"fx.compression", "postFx", "Compression", "Kompresyon", 0.0, 1.0, 0.05, 0.0, "",
     "Dynamic range compression — louder perceived body.",
     "0.3–0.6 to glue SFX in busy game mix."},
    SfxParamSpec{"fx.saturation", "postFx", "Saturation", "Saturasyon", 0.0, 1.0, 0.05, 0.0, "",
     "Harmonic warmth / soft clipping.",
     "0.1–0.3 for analog warmth. 0.5+ for aggressive distortion."},
    SfxParamSpec{"fx.stereoWidth", "postFx", "Stereo Width", "Stereo Genişlik", 0.0, 1.0, 0.05, 0.0, "",
     "Haas-effect width — 0 = mono, 1 = wide.",
     "0.3–0.6 for whooshes. Keep 0 for centered UI clicks."},
    SfxParamSpec{"fx.limiter", "postFx", "Limiter", "Limiter", 0.0, 1.0, 0.05, 0.8, "",
     "Output ceiling protection.",
     "0.7–0.9 default. Lower if clipping on loud presets."},
    SfxParamSpec{"master.duration", "master", "Duration", "Süre", 0.01, 3.0, 0.01, 0.0, "s",
     "Target total SFX length — scales ADSR to fit.",
     "0.05 UI tick, 0.15 jump, 0.5 explosion, 1.0+ cinematic."},
    SfxParamSpec{"master.durationScale", "master", "Duration Scale", "Süre Çarpanı", 0.1, 5.0, 0.05, 1.0, "",
     "Manual ADSR multiplier when duration not set.",
     "2 = double length. 0.5 = snappier."},
    SfxParamSpec{"master.tail", "master", "Tail Padding", "Kuyruk", 0.0, 1.0, 0.01, 0.0, "s",
     "Silence padding after sound.",
     "Use with reverb for tail room."},
    SfxParamSpec{"master.fadeIn", "master", "Fade In", "Fade In", 0.0, 0.5, 0.005, 0.0, "s",
     "Master fade-in on final mix.",
     "0.01–0.03 for soft entrances."},
    SfxParamSpec{"master.fadeOut", "master", "Fade Out", "Fade Out", 0.0, 0.5, 0.005, 0.0, "s",
     "Master fade-out on final mix.",
     "0.05–0.2 for smooth endings."},
    SfxParamSpec{"texture.chorus", "textureFx", "Chorus", "Chorus", 0.0, 1.0, 0.05, 0.0, "",
     "Detuned doubling — thick, wide.",
     "0.2–0.5 for lush pads."},
    SfxParamSpec{"texture.phaser", "textureFx", "Phaser", "Phaser", 0.0, 1.0, 0.05, 0.0, "",
     "Sweeping phase notch.",
     "0.3–0.6 sci-fi, jet sounds."},
    SfxParamSpec{"texture.crackle", "textureFx", "Crackle", "Cızırtı", 0.0, 1.0, 0.05, 0.0, "",
     "Vinyl/static crackle.",
     "0.1–0.3 lo-fi, radio."},
    SfxParamSpec{"texture.subMix", "textureFx", "Sub Layer", "Sub Katman", 0.0, 1.0, 0.05, 0.0, "",
     "Sub-harmonic oscillator blend.",
     "0.3–0.6 for heavy impacts."},
    SfxParamSpec{"texture.subOctave", "textureFx", "Sub Octave", "Sub Oktav", 0.25, 1.0, 0.05, 0.5, "",
     "Sub oscillator pitch (0.5 = -1 octave).",
     "0.5 default bass boost."},
    SfxParamSpec{"texture.transient", "textureFx", "Transient", "Transient", 0.0, 1.0, 0.05, 0.0, "",
     "Attack transient emphasis.",
     "0.4–0.8 punchy drums/hits."},
    SfxParamSpec{"texture.flutter", "textureFx", "Flutter", "Flutter", 0.0, 1.0, 0.05, 0.0, "",
     "Fast pitch flutter/warble.",
     "0.2–0.4 broken machine."},
    SfxParamSpec{"texture.gate", "textureFx", "Noise Gate", "Gate", 0.0, 1.0, 0.05, 0.0, "",
     "Cut quiet tail noise.",
     "0.2–0.4 clean tight SFX."},
    SfxParamSpec{"texture.grain", "textureFx", "Grain", "Grain", 0.0, 1.0, 0.05, 0.0, "",
     "Granular amplitude scatter.",
     "0.3–0.6 glitch texture."},
    SfxParamSpec{"texture.ringMod", "textureFx", "Ring Mod", "Ring Mod", 0.0, 1.0, 0.05, 0.0, "",
     "Ring modulation — metallic.",
     "0.3–0.7 robot, bell sounds."},
    SfxParamSpec{"texture.wow", "textureFx", "Tape Wow", "Tape Wow", 0.0, 1.0, 0.05, 0.0, "",
     "Slow tape pitch wobble.",
     "0.2–0.4 vintage, underwater."},
    SfxParamSpec{"oscillators[].mix", "layers", "OSC{n} Mix", "OSC{n} Mix", 0.0, 1.0, 0.05, 0.5, "",
     "Layer {n} blend.",
     "0.3–0.7 for detuned richness."},
    SfxParamSpec{"oscillators[].detune", "layers", "OSC{n} Detune", "OSC{n} Detune", -24.0, 24.0, 1.0, 0.0, "st",
     "Layer {n} semitone offset.",
     "+7/+12 harmonics. -12 sub."},
    SfxParamSpec{"oscillators[].delay", "layers", "OSC{n} Delay", "OSC{n} Gecikme", 0.0, 0.2, 0.005, 0.0, "s",
     "Layer {n} start offset.",
     "0.01–0.05 flam/double-hit."},
    SfxParamSpec{"oscillators[].params.frequency", "layers", "OSC{n} Freq", "OSC{n} Frekans", 40.0, 4000.0, 10.0, 220.0, "Hz",
     "Layer {n} frequency override (oscillators[].params.frequency).",
     "Set in params subobject. Or use detune for semitone shift."},
    SfxParamSpec{"oscillators[].params.shape", "layers", "OSC{n} Shape", "OSC{n} Dalga", 0.0, 5.0, 1.0, 0.0, "",
     "Layer {n} wave shape (oscillators[].params.shape).",
     "e.g. { params: { shape: 2 } } for saw layer."},
    SfxParamSpec{"oscillators[].params.noise", "layers", "OSC{n} Noise", "OSC{n} Noise", 0.0, 1.0, 0.05, 0.0, "",
     "Layer {n} noise mix (oscillators[].params.noise).",
     "0.2–0.4 adds grit to layer."},
    SfxParamSpec{"oscillators[].params.pulseWidth", "layers", "OSC{n} Pulse", "OSC{n} Pulse", 0.05, 0.95, 0.01, 0.5, "",
     "Layer {n} pulse width for square (oscillators[].params.pulseWidth).",
     "Retro layers: 0.15-0.3."},
    SfxParamSpec{"modulators[].rate", "modulators", "LFO{n} Rate", "LFO{n} Hız", 0.1, 30.0, 0.1, 4.0, "Hz",
     "LFO {n} speed.",
     "0.5–2 slow sweep. 8–20 vibrato."},
    SfxParamSpec{"modulators[].depth", "modulators", "LFO{n} Depth", "LFO{n} Derinlik", 0.0, 1.0, 0.05, 0.0, "",
     "LFO {n} intensity.",
     "0.2–0.5 subtle. 0.7+ extreme."},
    SfxParamSpec{"modulators[].shape", "modulators", "LFO{n} Shape", "LFO{n} Form", 0.0, 2.0, 1.0, 0.0, "",
     "0=sine, 1=triangle, 2=square.",
     "Sine=smooth, square=choppy."},
    SfxParamSpec{"modulators[].phase", "modulators", "LFO{n} Phase", "LFO{n} Faz", 0.0, 1.0, 0.05, 0.0, "",
     "LFO start phase.",
     "Offset for layered LFOs."},
};

}  // namespace

std::span<const SfxParamSpec> sfxParameters() noexcept { return kParams; }

void writeSfxRegistry(JsonWriter& w) {
  w.beginObject();
  w.key("groups").beginArray();
  for (const Group& g : kGroups) {
    w.beginObject().key("id").value(g.id).key("label").value(g.label).key("labelTr").value(g.labelTr).endObject();
  }
  w.endArray();
  w.key("waveShapes").beginArray();
  for (const WaveShape& s : kWaveShapes) {
    w.beginObject()
        .key("value")
        .value(static_cast<long long>(s.value))
        .key("label")
        .value(s.label)
        .key("desc")
        .value(s.description)
        .endObject();
  }
  w.endArray();
  w.key("modulatorTargets").beginArray();
  for (const ModTargetSpec& t : kModTargets) {
    w.beginObject().key("value").value(t.value).key("label").value(t.label).key("labelTr").value(t.labelTr).endObject();
  }
  w.endArray();
  w.key("params").beginArray();
  for (const SfxParamSpec& p : kParams) {
    w.beginObject();
    w.key("path").value(p.path);
    w.key("group").value(p.group);
    w.key("label").value(p.label);
    w.key("labelTr").value(p.labelTr);
    w.key("min").exact(p.min);
    w.key("max").exact(p.max);
    w.key("step").exact(p.step);
    w.key("default").exact(p.defaultValue);
    if (!p.unit.empty()) w.key("unit").value(p.unit);
    w.key("description").value(p.description);
    w.key("aiHint").value(p.aiHint);
    w.endObject();
  }
  w.endArray();
  w.endObject();
}

}  // namespace makesfx::legacy
