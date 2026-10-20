# Design: make-sfx Engine v2 — C++ ses motoru (SFX + müzik)

Tarih: 2026-10-20
Durum: Taslak (review bekliyor) — §21'deki kararlar onaylandı
Kapsam: Yeni `engine/` (C++20) dizini; `integrations/` (Unity, Unreal Engine, Roblox Studio);
`packages/core`, `packages/mcp`, `packages/playground` entegrasyonu.

---

## 0. Özet

make-sfx bugün TypeScript ile yazılmış, tüm buffer'ı tek seferde işleyen, tek ses (SFX)
odaklı bir sentez kütüphanesidir. Güçlü yanları: kodla tanımlama, deterministik seed
varyasyonu, kategori bazlı LUFS mastering ve MCP üzerinden doğal dilden ses üretimi.

v2'nin hedefi bu kimliği korurken altına **FL Studio sınıfında bir ses motoru**
koymaktır: blok tabanlı, gerçek zamanlı çalışabilen, sequencer + mixer + enstrüman
içeren, offline render'da platformlar arası **byte byte deterministik** bir C++ çekirdek.
Aynı çekirdek WASM olarak npm paketine, tarayıcıya (AudioWorklet) ve MCP sunucusuna,
native olarak CLI'ya ve gerçek zamanlı host'a gider.

Konumlandırma: **"Kodla ve AI ile yazılan, deterministik, masterlanmış müzik ve SFX"**.
FL Studio'nun GUI'sini veya plugin ekosistemini kopyalamak hedef değildir.

**Birincil kullanım yeri oyun motorlarıdır: Unity, Unreal Engine ve Roblox Studio.** Bu, mimariyi
üç noktada belirler:
1. C ABI birinci sınıf üründür; Unity (P/Invoke) ve Unreal (C++ modül) doğrudan ona bağlanır.
2. İki kullanım modu desteklenir: **asset pipeline** (editörde render → WAV → motorun kendi import'u)
   ve **runtime üretim** (oyun içinde JSON'dan ses üretimi; build'e WAV yerine KB'lık proje dosyaları girer).
3. Roblox native kod çalıştırmadığı için yalnızca asset pipeline ile desteklenir (§17.5).

**Birincil arayüz MCP'dir.** Kullanıcılar make-sfx MCP sunucusunu kendi AI ajanlarına (Claude, Cursor vb.) bağlar;
müziği ve SFX'i ajan yazar, render eder ve oyun projesine yerleştirir. Unity/Unreal SDK'ları ve CLI bu akışın
altındaki yapı taşlarıdır. Asset yükleme gibi platforma özgü dağıtım adımları kullanıcının ajanına ve araçlarına bırakılır.

---

## 1. Hedefler ve hedef dışı konular

### 1.1 Hedefler

| # | Hedef | Ölçülebilir karşılığı |
|---|-------|------------------------|
| G1 | Profesyonel DSP kalitesi | §13'teki ölçüm eşikleri (aliasing, THD, filtre tepkisi, LUFS doğruluğu) |
| G2 | Determinizm | Aynı proje + seed + sample rate → Windows/Linux/macOS/WASM'da aynı SHA-256 |
| G3 | Gerçek zamanlı güvenlik | `process()` içinde 0 allocation, 0 lock, 0 syscall (RTSan + allocation sayacı) |
| G4 | Müzik üretimi | Tempo map, pattern, playlist, polifonik enstrümanlar, mixer, otomasyon, stem export |
| G5 | SFX geriye uyumluluğu | Mevcut 25 preset ve `SoundConfig` formatı §12.3 parity kriterlerini geçer |
| G6 | Tek çekirdek, çok hedef | Native (CLI, realtime host) + WASM (Node, tarayıcı, AudioWorklet) aynı kaynaktan |
| G7 | AI dostu arayüz | JSON proje formatı, JSON Schema, yapılandırılmış diagnostics, render raporu |
| G8 | Oyun motoru entegrasyonu | Unity paketi, Unreal plugin'i ve Roblox export'u örnek projelerde aynı ses paketini çalar; Unity/Unreal içinden golden hash testi geçer (§17) |
| G9 | MCP-first iş akışı | Bir ajan yalnızca MCP araçlarıyla tariften oyun projesine hazır ses paketi üretir (§15.5, M7) |

### 1.2 Hedef dışı (v2 kapsamında yok)

- Üçüncü parti plugin **hosting** (VST3/CLAP/AU yükleme).
- Ses kaydı, audio clip düzenleme, time-stretch (élastique sınıfı).
- Tam DAW GUI. Playground'da minimal transport + piano roll var, fazlası yok.
- Surround / Atmos. Çıkış en fazla stereo.
- MP3/OGG/FLAC encode. v2'de yalnızca WAV (Unity ve Unreal kendi sıkıştırmasını uygular, Roblox WAV kabul eder).
- ASIO sürücüsü (lisans ve bakım maliyeti; WASAPI exclusive yeterli, bkz. §16).

---

## 2. Mevcut durum (gerçekler)

- Dil: TypeScript, ~5.000 satır, `packages/core/src`.
- `SAMPLE_RATE = 44100` sabit; WAV çıkışı 16-bit PCM (mono veya stereo).
- Render pipeline (`render.ts`):
  `layers (ZzFX) | voice → modulators → texture → master envelope → FX → LUFS normalize → true-peak → WAV`.
- `synth.ts`: ZzFX v1.3.2'den alınmış; band-limited değil, yüksek frekansta alias üretir. (2026-10-20'ye kadar
  perde hatası içeriyordu, bkz. §21.1 karar 11.)
- `voice.ts` (commit edilmemiş): polyBLEP osilatörlü 3-osc subtractive synth, ADSR, filtre, unison, nota listesi.
- Loudness (`loudness.ts`): BS.1770 K-weighting, **gating yok** (kısa SFX için doğru seçim),
  10 ms altı sinyaller sıfırla dolduruluyor; 4x windowed-sinc true-peak; iteratif normalize.
- Kategori hedefleri: ui −14, combat −9, pickup −12, ambient −18, stinger −11 LUFS; ≤ −1 dBTP.
- RNG: global, değiştirilebilir (`setRng`); seed'li render'da mulberry32 benzeri üreteç.
- 25 preset, 70+ parametre (synth 21, master 5, layer 4, LFO 4, texture 11, FX 12, engineer knob 6).
- MCP araçları: `sfx_help`, `sfx_get_parameters`, `sfx_list_design_profiles`, `sfx_describe`,
  `sfx_refine`, `sfx_from_description`, `sfx_game_pack`, `sfx_list_presets`, `sfx_design`, `sfx_design_batch`.
- Lisans: MIT.

---

## 3. Tasarım ilkeleri

1. **Audio thread kutsaldır.** `process()` içinde heap allocation, lock, I/O, log, exception,
   sistem çağrısı yok. Tüm bellek proje derlenirken ayrılır.
2. **Önce offline, sonra realtime.** Offline render ile realtime aynı `process()` yolunu kullanır.
   Offline mod determinizm garantisini taşır; realtime "algısal olarak aynı" sonucu verir.
3. **Tek doğruluk kaynağı.** Her parametrenin tanımı (id, birim, aralık, varsayılan, smoothing)
   C++'taki parametre registry'sinde bir kez yazılır. JSON Schema, TS tipleri, dokümantasyon ve
   MCP `sfx_get_parameters` çıktısı buradan üretilir.
4. **Hata sessizce yutulmaz.** Geçersiz proje alan yolu (JSON Pointer) ile raporlanır;
   sessiz clamp yok (lenient mod hariç, o da uyarı üretir).
5. **Ölçülmeyen kalite yoktur.** Her DSP bileşeni ölçüm testiyle gelir (§13).
6. **Bağımlılıklar MIT uyumlu ve minimal.** Copyleft (GPL/AGPL/LGPL statik) bağımlılık yok.

---

## 4. Mimari

### 4.1 Katmanlar

```
┌──────────────────────────────────────────────────────────────────────┐
│ İstemciler                                                           │
│  make-sfx-mcp (AI ajanları — birincil arayüz)                        │
│  Unity paketi (C#) · Unreal plugin'i (C++) · Roblox export'u         │
│  make-sfx-core (TS/WASM) · playground · makesfx CLI                  │
└───────────────┬──────────────────────────────────────────────────────┘
                │ C ABI (msfx_*)  — JSON in / buffers + JSON out
┌───────────────▼──────────────────────────────────────────────────────┐
│ Project katmanı (control thread)                                     │
│  JSON parse → Schema doğrulama → Legacy çeviri → Normalize           │
│  → Compile (graph planı, voice havuzları, buffer'lar, tempo map)     │
└───────────────┬──────────────────────────────────────────────────────┘
                │ CompiledProject (immutable)  ── atomik swap ──┐
┌───────────────▼──────────────────────────────────┐            │
│ Engine (audio thread, process())                 │◀── SPSC ───┤ LiveEvent kuyruğu
│  Transport → Sequencer → Voice Manager           │            │
│  → Instruments → Mixer graph → Master            │── SPSC ───▶ Garbage / telemetri
└───────────────┬──────────────────────────────────┘
                │
     ┌──────────┴───────────┐
     ▼                      ▼
 OfflineRenderer        RealtimeHost (miniaudio)  /  AudioWorklet host (WASM)
 + Mastering (LUFS)
 + WAV writer + Report
```

### 4.2 Thread modeli

| Thread | Görev | İzinli işlemler |
|--------|-------|-----------------|
| Control | Proje yükleme, derleme, canlı olay gönderme, dosya I/O | Her şey |
| Audio | `Engine::process()` | Yalnızca önceden ayrılmış bellek, atomik işlemler, SPSC push/pop |
| Worker (opsiyonel) | Sample decode, wavetable mipmap üretimi, offline'da paralel track render | Her şey; audio thread'e yalnızca derlenmiş veri verir |

İletişim:
- **Control → Audio:** `LiveEvent` SPSC kuyruğu (sabit kapasite, varsayılan 4096). Taşarsa olay
  düşürülür ve sayaç artar; control tarafı bunu telemetriden okur.
- **Proje değişimi:** Yeni `CompiledProject` control thread'de kurulur, `std::atomic<CompiledProject*>`
  ile blok sınırında değiştirilir. Çalan sesler kısa bir crossfade (varsayılan 10 ms) ile kapatılır.
- **Audio → Control:** Eski proje pointer'ı "garbage" SPSC kuyruğuna konur, silme control thread'de yapılır.
  Seviye ölçerler ve transport pozisyonu aynı yolla (veya atomiklerle) okunur.
- Kuyruk: `readerwriterqueue` (BSD) veya eşdeğer 60 satırlık kendi SPSC'miz; WASM'da tek thread
  modunda aynı arayüz kilitsiz basit diziye düşer.

### 4.3 Dizin yapısı

```
engine/
  CMakeLists.txt  CMakePresets.json
  include/makesfx/          # Public C++ API + C ABI header
    engine.hpp  project.hpp  render.hpp  host.hpp  makesfx.h
  src/
    math/       # deterministik sin/cos/exp2/log2/tanh, RNG, dB dönüşümleri
    dsp/        # osilatörler, filtreler, envelope, oversampling, delay line, FFT (test/mipmap)
    fx/         # EQ, compressor, limiter, saturator, reverb, delay, mod efektleri...
    instruments/# sfx (legacy), subtractive, drum, sampler, (wavetable, fm)
    engine/     # graph, params, modulation, voices, sequencer, transport, mixer
    project/    # JSON parse, schema, legacy translator, compiler, diagnostics
    render/     # offline renderer, mastering, wav, report
    host/       # miniaudio realtime host
    capi/       # extern "C" yüzeyi
  tools/
    cli/        # makesfx CLI
    schema-gen/ # registry → JSON Schema + TS types + docs
  tests/
    unit/  dsp/  golden/  parity/  rt/  fuzz/  bench/
  wasm/         # Emscripten giriş noktası, JS glue
integrations/
  unity/        # UPM paketi com.makesfx.unity (Runtime, Editor, Plugins/<platform>, Samples~)
  unreal/       # MakeSfx plugin'i (MakeSfxCore, MakeSfxEditor modülleri, ThirdParty)
  roblox/       # Runtime yardımcı modülü (Luau), örnek place
packages/core   # TS sarmalayıcı (WASM yükler), legacy API
packages/mcp
packages/playground
```

---

## 5. Determinizm sözleşmesi

### 5.1 Garanti

> Aynı **proje JSON'u**, aynı **seed**, aynı **sample rate**, aynı **engine sürümü** ve
> **offline** render modunda; x86-64 (Windows/MSVC, Linux/GCC-Clang), arm64 (macOS/Clang,
> Android/NDK Clang, iOS/Clang) ve WASM üzerinde çıkan PCM verisi bit bit aynıdır.
> Unity ve Unreal içinden çağrıldığında da aynı sonuç alınır (§17.2).

Realtime modda garanti yoktur (blok boyutu ve canlı olay zamanlaması değişkendir), ancak
blok boyutu sabitken ve canlı olay yokken aynı çıktı hedeflenir.

Blok boyutundan bağımsızlık: Offline render iç blok boyutunu sabit kullanır (varsayılan 128).
Kullanıcının seçtiği blok boyutu çıktıyı **değiştirmez**; sub-block bölme olay offset'lerine göre yapılır.

### 5.2 Kurallar

- **Derleyici bayrakları:** `-ffast-math` ve türevleri yasak. GCC/Clang: `-ffp-contract=off`,
  `-fno-associative-math`. MSVC: `/fp:precise` (`/fp:contract` verilmez). Emscripten: Clang ile aynı.
- **Matematik fonksiyonları:** `std::sin/cos/exp/log/pow/tanh` DSP yolunda kullanılmaz. `src/math/`
  yalnızca `+ − × ÷` ve `sqrt` (IEEE'de doğru yuvarlanır) kullanan polinom/rasyonel yaklaşımlar sağlar.
  Hedef hata: sin/cos ≤ 1e-7 mutlak; exp2/log2 ≤ 2e-7 bağıl; tanh ≤ 1e-6 mutlak.
- **Denormal:** FTZ/DAZ'a güvenilmez (WASM'da yok). Geri beslemeli tüm yollarda (filtre durumu,
  reverb, delay) açık flush: `|x| < 1e-15 → 0`. Realtime native modda ek olarak FTZ/DAZ açılır;
  açık flush sayesinde sonuç değişmez.
- **SIMD:** Yalnızca IEEE temel işlemleri; `rcp`/`rsqrt` yaklaşık komutları yasak. SIMD ve skaler
  yol aynı işlem sırasını izler. v2.0'da açık SIMD yok; derleyici auto-vectorization'a güvenilir
  (fast-math kapalıyken sırayı değiştirmez).
- **Toplama sırası:** Mixer'da kanallar sabit indeks sırasıyla toplanır. Offline paralel track
  render'ı her track'i kendi buffer'ına yazar; toplama tek thread'de, sabit sırayla yapılır.
- **Hassasiyet:** Ses verisi `float`. Faz akümülatörleri, zaman/tick dönüşümleri, filtre katsayı
  hesapları ve EQ biquad durumları `double`.
- **RNG:** Global RNG yok. Proje seed'inden SplitMix64 ile türetilmiş, her tüketiciye ayrı
  PCG32 akışı: `stream = hash(projectSeed, instrumentId, noteIndex, purpose)`. Böylece bir
  track eklemek diğer track'lerin rastgeleliğini bozmaz.
- **Kayan nokta → tamsayı:** WAV dönüşümünde yuvarlama kuralı tanımlıdır (round-half-to-even),
  dither RNG'si de seed'den türetilir.

### 5.3 Doğrulama

CI'da golden corpus (§13.3) dört platformda render edilir; hash'ler repodaki `golden.json`
ile karşılaştırılır. Kasıtlı ses değişikliği golden güncellemesi ve PR açıklamasında dinleme notu ister.

---

## 6. Ses işleme modeli

### 6.1 Buffer ve formatlar

- İç format: 32-bit float, non-interleaved, **her zaman stereo** (mono enstrümanlar panlanır).
- Sample rate: 22.05–192 kHz desteklenir; 44.1, 48, 96 kHz test matrisinde. **Varsayılan 48 kHz**,
  legacy SFX çevirisi 44.1 kHz (bkz. §12).
- Blok boyutu: 1..`maxBlockSize` (varsayılan 1024) arası herhangi bir değer; 2'nin kuvveti
  varsayılmaz. AudioWorklet için 128.
- Tüm DSP katsayıları sample rate'ten türetilir; ses karakteri sample rate'ten bağımsızdır
  (Dattorro gibi sabit uzunluklu yapılar ölçeklenir).

### 6.2 Graph ve işleme planı

- Proje derlenirken mixer ve enstrüman graph'ı topolojik sıralanıp düz bir **işleme planına**
  (`std::vector<Op>`, derleme anında sabitlenir) dönüştürülür. Audio thread planı sırayla yürütür;
  örnek başına sanal çağrı yoktur, blok başına vardır.
- Döngüler (feedback routing) v2'de yasak; derleyici `E_ROUTING_CYCLE` verir.
- Her düğüm `latencySamples()` ve `tailSamples()` bildirir.

### 6.3 Olaylar ve sub-block bölme

- Olaylar blok içinde `sampleOffset` ile gelir. Engine bloğu olay sınırlarında alt bloklara böler,
  her alt blokta olayları uygular ve DSP'yi çalıştırır. Böylece zamanlama sample-accurate olur.
- Aynı offset'teki olayların sırası: NoteOff → Parametre → NoteOn (deterministik ve tıklama yapmayan sıra).

### 6.4 Parametreler

Her parametrenin registry kaydı:

| Alan | Örnek |
|------|-------|
| `path` | `instruments.bass.filter.cutoff_hz` |
| `unit` | `hz`, `db`, `ms`, `s`, `ratio`, `percent`, `semitones`, `cents`, `bool`, `enum` |
| `range` | min, max |
| `scale` | `linear`, `log`, `db` (UI ve otomasyon interpolasyonu için) |
| `default` | 1200 |
| `smoothing` | `none`, `linear(ms)`, `one_pole(ms)` |
| `rate` | `audio` / `control` |

- Path'ler derlemede sayısal handle'a çevrilir; audio thread string görmez.
- **Smoothing varsayılanları:** gain/pan/mix 10 ms lineer; filtre cutoff 5 ms one-pole (log domain'de);
  zaman parametreleri (delay süresi) 50 ms ve "tape" davranışı yerine crossfade; enum ve bool smoothing'siz.
- **Control rate:** 32 sample. Modülasyon ve otomasyon bu aralıkla değerlendirilir, aradaki örnekler
  lineer interpolasyonla doldurulur. Pitch ve FM yolları audio-rate'tir.

### 6.5 Modülasyon

Her enstrüman ve FX kendi modülasyon matrisine sahiptir (enstrüman başına en fazla 16 slot).

- **Kaynaklar:** LFO 1–4 (sine, tri, saw up/down, square, S&H, smooth random; tempo-sync, faz, retrigger),
  ENV 1–3 (ADSR, segment eğrisi), velocity, key (note number), mod wheel, **isimli makrolar**
  (oyun parametreleri için, §17.6), random-per-note,
  aftertouch (ileride MIDI), envelope follower (sidechain girişi).
- **Hedefler:** registry'de `modulatable: true` işaretli her parametre.
- **Slot:** `{ source, destination, amount, curve, via? }` — `via` ikinci kaynakla ölçekleme (ör. LFO derinliği × mod wheel).
- Miktar hedefin `scale`'inde uygulanır: cutoff oktav cinsinden, gain dB cinsinden, pitch semiton cinsinden.

### 6.6 Otomasyon

- Otomasyon şeridi: `{ target: path, points: [{ tick, value, curve }] }`.
- Eğri tipleri: `hold`, `linear`, `exp`, `tension(-1..1)` (FL "single curve" eşdeğeri).
- Otomasyon modülasyondan önce uygulanır (modülasyon otomasyon değerinin etrafında salınır).

---

## 7. Zamanlama ve sequencer

### 7.1 Zaman tabanı

- **960 PPQ.** Tüm sequencer zamanı tamsayı tick (`int64`).
- **Tempo map:** Segmentler `{ tick, bpm, ramp: "step" | "linear" }`. Tick → sample dönüşümü
  segment başına kapalı formdan hesaplanır (birikimli hata yok), sonuç `floor` ile tamsayıya iner.
- **Time signature map:** `{ bar, numerator, denominator }`; yalnızca ızgara ve bar hesapları için.
- **Swing:** pattern başına 0–100%, 1/8 veya 1/16 ızgarada; çift sıradaki adımları geciktirir.

### 7.2 Veri modeli (FL modeline yakın)

- **Pattern:** Uzunluğu tick cinsinden, içinde enstrüman başına nota listeleri. FL'deki gibi bir pattern
  birden çok enstrümanı kapsayabilir.
- **Nota:**
  ```
  { tick, length, key (0–127), cents (−100..100), velocity (0–1),
    release_velocity?, pan? (−1..1), mod_x?, mod_y?, slide? (bool), porta? (bool) }
  ```
  `mod_x / mod_y` modülasyon matrisinde kaynak olarak kullanılabilir (FL'in note properties karşılığı).
- **Step sözdizimi:** `steps: "x...x...x..x.x.."` veya `[0, 4, 8, 12]` biçiminde şeker; derlemede notaya çevrilir.
  Davul ve SFX dizileri için hızlı yazım.
- **Playlist:** Track'lerden oluşur; track'lerde clip'ler:
  - `pattern` clip: `{ pattern, start, length?, offset? }`
  - `automation` clip: otomasyon şeridini zaman çizelgesine yerleştirir
  - `sample` clip (audio clip): bir asset'i sabit hızda çalar (time-stretch yok)
- **Loop bölgesi** ve **proje uzunluğu**; uzunluk verilmezse son clip'in sonu + tail.

### 7.3 Transport

`play`, `stop`, `locate(tick)`, `loop(on, start, end)`, `tempo` değişimi (canlı), metronom (realtime opsiyonel).
Stop'ta tüm sesler release fazına girer; "panic" tüm sesleri 5 ms içinde susturur.

### 7.4 MIDI

- SMF tip 0/1 **import** (nota, tempo, time signature, CC → otomasyon) ve **export** (pattern'lardan).
- Canlı MIDI girişi realtime host'ta (miniaudio dışı; native'de RtMidi MIT, tarayıcıda Web MIDI) — M6 sonrası.

---

## 8. Ses (voice) yönetimi

- Enstrüman başına önceden ayrılmış voice havuzu. **Polifoni** varsayılan 16, en fazla 64.
- **Voice stealing sırası:** (1) release fazındaki en eski, (2) en sessiz, (3) en eski. Çalınan ses
  3 ms'lik "kill fade" ile kapatılır, tık oluşmaz.
- **Mono modu:** `retrigger` veya `legato`; **glide** (porta) süresi ve modu (`always` / `legato_only`).
  FL'deki `slide` notaları kendi pitch eğrisini taşır.
- **Choke grupları:** Aynı gruptaki bir nota diğerlerini 3 ms fade ile keser (açık/kapalı hi-hat).
- **Note başına RNG akışı** (§5.2) varyasyon ve S&H kaynaklarını besler.

---

## 9. Jeneratörler (enstrümanlar)

Tüm enstrümanlar ortak arayüzü uygular:

```cpp
class Instrument {
public:
  virtual void prepare(const PrepareInfo&) = 0;            // allocation burada
  virtual void noteOn(const NoteEvent&, VoiceSlot&) noexcept = 0;
  virtual void noteOff(const NoteEvent&, VoiceSlot&) noexcept = 0;
  virtual void renderVoice(VoiceSlot&, StereoSpan out) noexcept = 0;
  virtual bool voiceFinished(const VoiceSlot&) const noexcept = 0;
  virtual ~Instrument() = default;
};
```

### 9.1 `sfx` — prosedürel SFX (legacy uyumlu)

Mevcut TS motorunun birebir portu, gerçek zamanlı tetiklenebilir hale getirilmiş hali.

- **Çekirdek:** ZzFX algoritması (volume, randomness, frequency, ADSR, shape 0–4, shapeCurve, pulseWidth,
  slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay,
  sustainVolume, decay, tremolo, filter). TS ile parity için bu jeneratör içeride `double` çalışır.
- **Katmanlar:** OSC 2–4 (mix, detune, delay, parametre override'ları).
- **LFO modülatörleri:** amplitude/pitch/filter hedefleri (genel modülasyon matrisine eşlenir).
- **Texture:** chorus, phaser, crackle, sub (mix, octave), transient, flutter, gate, grain, ringMod, wow.
- **Master envelope:** duration, durationScale, tail, fadeIn, fadeOut.
- **Nota ile tetikleme:** `root_key` (varsayılan 69 = A4) ile nota arasındaki fark `frequency`'yi ölçekler;
  velocity volume'u ölçekler. Böylece bir lazer SFX'i melodik çalınabilir.
- **Kalite modu:** `quality: "legacy" | "hq"`. `hq`, ZzFX osilatörlerini polyBLEP karşılıklarıyla değiştirir
  ve bitCrush dışındaki doğrusalsızlıkları oversample eder. Legacy preset'ler `legacy` ile gelir.
- Mevcut `voice` patch'i (TS `voice.ts`) `subtractive` enstrümanına çevrilir.

### 9.2 `subtractive` — analog modelleme synth

- **Osilatörler:** 3 adet; sine, triangle, saw, pulse (PWM), noise (white/pink). Band-limited:
  saw/pulse/triangle için polyBLEP (2. derece), triangle'da integre edilmiş BLEP square.
  Osilatör başına: oktav, semiton, cent, seviye, pan, faz (serbest/sabit), hard sync (OSC2 → OSC1),
  ring mod (1×2), FM (lineer, through-zero, OSC3 → OSC1/2).
- **Unison:** 1–16 ses, detune (cent), spread (stereo), blend, faz rastgeleliği (seed'li).
- **Sub osilatör:** −1/−2 oktav, sine/square.
- **Filtreler:** 2 filtre slotu, seri/paralel.
  - `svf`: TPT/ZDF state-variable (Zavalishin/Simper) — LP/HP/BP/notch/peak, 12 dB/okt.
  - `ladder`: 4-pole ZDF ladder (24 dB/okt) ve 2-pole mod, sürüş (`drive`) ve tanh doyumu; rezonans
    1.0'da kararlı self-oscillation, cutoff audio-rate modüle edilince patlamaz.
  - Keytracking (%), envelope miktarı (oktav), velocity → cutoff.
- **Envelope'lar:** amp, filtre, mod; segment eğrileri (lineer / üstel / ayarlanabilir), 0.1 ms'ye kadar
  attack (transient için), retrigger/legato davranışı.
- **LFO:** 2 adet (+ global LFO'lar modülasyon matrisinden).
- **Drive/saturation** (oversample'lı), çıkış seviye ve pan.

### 9.3 `drum` — sentezlenmiş davul makinesi

Her pad bir "voice model" + parametreler. SFX motorunun gücünü doğrudan müziğe taşır.

| Model | Yapı |
|-------|------|
| `kick` | Sine + üstel pitch envelope + click (kısa noise/transient) + drive |
| `snare` | 2 tonal sine (180/330 Hz civarı, ayarlı) + BP filtreli noise, ayrı envelope'lar |
| `hat` | 6 kare dalga metalik küme (808 frekans oranları) + HP + kısa/uzun decay; choke grubu |
| `clap` | 3–4 kısa noise burst + reverb kuyruğu |
| `tom` | Pitch envelope'lu sine + az noise |
| `perc` | FM tabanlı genel vurmalı (cowbell, rim, blip) |

### 9.4 `sampler`

- **Zone'lar:** key aralığı, velocity aralığı, root key, tune (cent), gain, pan, round-robin grubu.
- **Loop:** none, forward, ping-pong; loop crossfade (ms); loop noktaları sample cinsinden.
- **İnterpolasyon:** `linear` (önizleme), `hermite` (4 nokta, varsayılan realtime),
  `sinc` (16 nokta, Kaiser pencereli polifaz tablo; varsayılan offline). Kalite proje alanıdır,
  bu yüzden determinizmi bozmaz.
- **Modlar:** one-shot (nota uzunluğundan bağımsız), gate (nota bitince release), reverse.
- **Envelope + filtre** subtractive ile aynı modüller.
- **Asset'ler:** WAV (16/24/32f), control thread'de bellek içine decode edilir; proje dosyasında
  `sha256` ile sabitlenir (farklı dosya = farklı render, determinizm için uyarı).
- **SFZ alt kümesi import:** `<region>`, `<group>`, `sample`, `lokey/hikey/pitch_keycenter`,
  `lovel/hivel`, `loop_mode`, `loop_start/end`, `tune`, `volume`, `pan`, `seq_length/seq_position`.

### 9.5 Sonraki sürümler (v2.x)

- `wavetable`: 2048 örneklik frame'ler, 256 frame'e kadar; oktav başına FFT ile band-limited mipmap;
  frame morph; WAV'dan (`clm` bloklu) import.
- `fm`: 4 operatörlü, 8 algoritma, operatör başına envelope ve feedback.

---

## 10. Efektler (FX)

Her efekt: `prepare()`, `process(StereoSpan) noexcept`, `latencySamples()`, `tailSamples()`, `reset()`.
Doğrusalsızlık içeren her efekt oversampling seçeneği sunar (1x/2x/4x/8x; polifaz FIR half-band,
lineer faz, gecikme raporlanır).

| Efekt | Algoritma ve parametreler |
|-------|---------------------------|
| `utility` | gain (dB), pan, width (M/S), faz çevirme, mono, DC blocker |
| `eq` | 8 banda kadar. Tipler: bell, low/high shelf, notch, bandpass, LP/HP 6/12/24/48 dB/okt (Butterworth kaskad). RBJ cookbook katsayıları, **Transposed Direct Form II**, `double` durum. Nyquist yakınında bell eğrisinin bozulmaması için opsiyonel Vicanek eşlemesi. |
| `compressor` | Feed-forward; peak/RMS detektör; threshold, ratio, knee (dB), attack, release, makeup, auto-release; **sidechain girişi** ve sidechain HPF; opsiyonel lookahead (raporlanan gecikme); stereo link. |
| `gate` | threshold, range, attack/hold/release, hysteresis, sidechain |
| `limiter` | Lookahead brickwall (varsayılan 1.5 ms), 4x oversampled **true-peak** algılama, ceiling (dBTP), release; ceiling'i asla aşmaz (§13 eşiği). |
| `saturator` | Eğriler: tanh, soft clip (kübik), hard clip, asimetrik (tüp benzeri, çift harmonik), wavefolder. drive, mix, output, tilt öncesi/sonrası EQ; oversampling varsayılan 4x; DC blocker. |
| `bitcrusher` | Sample rate düşürme + bit derinliği; bilinçli alias, oversampling yok. |
| `chorus` / `flanger` | Modüle delay line, kübik interpolasyon; rate (tempo-sync), depth, feedback, voices, stereo spread |
| `phaser` | 2–12 kademe all-pass, feedback, rate, depth, stereo faz farkı |
| `delay` | Stereo / ping-pong; tempo-sync (1/32..1/1, nokta ve üçleme); feedback, geri besleme yolunda HP/LP ve saturation; en fazla 4 s önceden ayrılmış. |
| `reverb` | İki algoritma: **`plate`** — Dattorro (1997) topolojisi, sample rate'e ölçeklenmiş gecikmeler; **`hall`** — 8x8 FDN (Hadamard matris), modüle gecikmeler. Ortak: predelay, size, decay (s), damping (Hz), diffusion, modulation, early reflections seviyesi, width, mix. |
| `filter` | SVF / ladder, LFO veya envelope follower ile sweep |
| `transient` | Attack/sustain kazancı (iki envelope farkı) |
| `stereo_legacy` | Mevcut TS `stereoWidth` (Haas) davranışı, parity için |

---

## 11. Mixer ve yönlendirme

- **Kanallar dinamiktir:** Projede tanımlı kadar insert kanalı, bus ve bir master. Derlemede sayı sabitlenir,
  bellek ayrılır. Üst sınır yapılandırılabilir (varsayılan 128 kanal).
- **Kanal şeridi:** input gain → insert FX (en fazla 10 slot) → fader (dB) → pan → width → mute/solo
  → çıkışa routing.
- **Pan law:** varsayılan −3 dB constant-power; seçenekler 0, −3, −4.5, −6 dB.
- **Routing:** Her kanal bir kanala/bus'a/master'a gider (DAG). Ek olarak **send**'ler: seviye (dB),
  pre/post fader, hedef kanal.
- **Sidechain:** Bir kanalın sinyali başka bir kanaldaki efektin sidechain girişine send olarak bağlanır
  (`"sidechain_of": "kick"`).
- **Gecikme telafisi (PDC):** Derlemede her yolun toplam gecikmesi hesaplanır; birleşme noktalarında
  kısa yollar delay line ile hizalanır. Offline render başındaki toplam gecikme kırpılır, böylece
  çıktı zamanla hizalıdır. Sidechain yolları da hizalanır.
- **Solo davranışı:** Solo'lu kanal + onun gittiği yol + send hedefleri duyulur (FL davranışı).
- **Metering:** Kanal başına peak ve RMS (control thread'e atomik/SPSC ile), master'da LUFS momentary/short-term.
- **Stem export:** Seçilen kanalların post-fader çıkışları ayrı WAV olarak; master zinciri stem'lere uygulanmaz
  (opsiyon: `stems.through_master: false|true`).

---

## 12. Mastering, render ve legacy uyumluluk

### 12.1 Offline renderer

```
compile → (warmup yok) → blok döngüsü → tail politikası → mastering → dither → WAV + rapor
```

- **Uzunluk:** `project.length` verilirse o; verilmezse son olay + `tailSamples()` toplamı.
- **Tail politikası:** Son olaydan sonra çıkış 100 ms boyunca −90 dBFS altında kalana kadar devam,
  en fazla `render.max_tail_s` (varsayılan 10 s). Bu da determinizm kapsamındadır.
- **Paralel render (native):** Track'ler worker thread'lerde ayrı buffer'lara render edilir,
  mixer toplaması tek thread'de sabit sırayla yapılır (§5.2). WASM v2.0'da tek thread.
- **Kesintisiz loop render** (`render.loop: true`): Oyun müziği ve ambiyans döngüleri için. Proje uzunluğu
  tam olarak `project.length` olur; sondaki tail (reverb, delay, release) döngünün başına toplanır.
  Böylece motorun loop'u tıklamasız ve kuyruk kesilmeden döner. Mastering loop'un kendisi üzerinden ölçülür.
- **Export sample rate** (`render.sample_rate`): İç sample rate'ten farklıysa offline yüksek kaliteli
  (Kaiser pencereli sinc, polifaz) resampler ile dönüştürülür. Roblox'un ≤ 48 kHz sınırı gibi hedef
  kısıtları buradan karşılanır.

### 12.2 Mastering

Integrated LUFS tüm sinyali gerektirdiği için **yalnızca offline** yapılır. Realtime master'da yalnız limiter vardır.

| Mod | Davranış |
|-----|----------|
| `none` | Dokunulmaz (master zinciri hariç) |
| `category` | SFX davranışı: kategori LUFS hedefi (ui −14, combat −9, pickup −12, ambient −18, stinger −11), ≤ −1 dBTP. Ölçüm: K-weighted **momentary max** — 400 ms kayan penceredeki en yüksek ortalama enerji. 100 ms'den kısa sinyaller sıfırla 100 ms'ye doldurulur; 400 ms'den kısa sinyaller kendi uzunlukları üzerinden ölçülür. Uzun reverb/delay kuyrukları ölçümü seyreltmez (§21.1 karar 12). TS `measureLufs` ile aynı. |
| `music` | BS.1770-4 **gated** integrated loudness (400 ms blok, %75 örtüşme, −70 LUFS mutlak, −10 LU göreli kapı). Hedef varsayılan −14 LUFS, −1 dBTP. |
| `custom` | `target_lufs`, `ceiling_dbtp`, `gating: bool` |

Algoritma: ölç → kazanç uygula → true-peak limiter → yeniden ölç; en fazla 4 iterasyon, tolerans ±0.5 LU
(müzik) / mevcut TS toleransı (SFX). Limiter devreye girdikçe loudness hedefi sağlanamıyorsa rapor uyarı verir.

### 12.3 Legacy uyumluluk

- `SoundConfig` / `SoundParams` → v2 proje çevirmeni (C++ içinde, `project/legacy.cpp`). Tek bir `sfx`
  enstrümanı, tek nota, tek kanal, `mastering.mode = "category"`, sample rate 44.1 kHz, 16-bit WAV üretir.
- `voice` patch'i → `subtractive` enstrüman.
- `fx` alanları → kanal insert zinciri: EQ → saturator → compressor → delay → reverb → limiter → `stereo_legacy`
  (mevcut TS sırası).
- Engineer knob'ları (`pitchShift`, `brightness`, `warmth`, `punch`, `grit`, `space`), `modify()`, preset verisi ve
  `buildSoundConfig()` TS'te kalır: bunlar DSP değil config dönüşümüdür. C++ motoruna çözülmüş `SoundConfig` gelir.
- Seed varyasyonu (`applyVariation`) C++'a taşındı; TS'teki mulberry32 üreteci legacy yol için birebir korunur
  (çekim sırası dahil), yeni projeler PCG32 kullanır.

**Uygulama durumu (M1):** `engine/src/legacy/` 1.x pipeline'ını operasyon sırasıyla portlar (ara buffer'lar `float`,
hesaplama `double`, JS sayı semantiği `legacy/js.hpp`). ZzFX `noise` terimi `sin(i⁵)`, argüman 2⁴⁰'ı aşınca
(~5 ms sonra) hash tabanlı deterministik bir diziye geçer; JS'te bu bölge zaten hassasiyet gürültüsüdür. Render süresi
120 s ile sınırlıdır (`E_TOO_LONG`).

**Parity kriterleri** (25 preset × seed {yok, 1, 42} × mono/stereo):

| Ölçüt | Eşik |
|-------|------|
| Integrated loudness farkı | ≤ 0.5 LU |
| True-peak | ≤ −1 dBTP (iki motorda da) |
| Süre farkı | ≤ 1 ms |
| Log-spektral mesafe (1/3 oktav bantlar, 50 Hz–16 kHz) | ≤ 1.5 dB ortalama |
| Dinleme | Her preset için A/B kontrol listesi, PR'da işaretli |

Byte eşitliği beklenmez; TS ve C++ farklı RNG/matematik yollarına sahip olabilir. `quality: "legacy"`
yolunda farkı en aza indirmek için ZzFX çekirdeği `double` ile portlanır.

### 12.4 WAV çıkışı

- 16-bit PCM, 24-bit PCM, 32-bit float. Mono veya stereo.
- Varsayılan: legacy SFX → 16-bit (mevcut davranış), yeni projeler → 24-bit.
- Dither: TPDF, 16/24-bit'te varsayılan açık, seed'li RNG; noise shaping yok.
- Kütüphane: `dr_wav` (public domain / MIT-0) veya 200 satırlık kendi yazıcımız; okuma için `dr_wav`.

### 12.5 Render raporu

Her render bir JSON rapor döndürür (CLI'da `<out>.report.json`). AI döngüsünün geri bildirimi budur.

```json
{
  "engine_version": "2.0.0",
  "schema_version": "makesfx/1",
  "sample_rate": 48000,
  "duration_s": 8.0,
  "latency_samples": 72,
  "loudness": { "integrated_lufs": -14.1, "true_peak_dbtp": -1.0, "lra_lu": 5.2,
                "max_momentary_lufs": -10.3, "max_short_term_lufs": -11.8 },
  "mastering": { "mode": "music", "gain_db": 3.4, "limiter_max_gr_db": 1.9 },
  "stems": [{ "id": "drums", "integrated_lufs": -16.0, "peak_dbfs": -2.1 }],
  "voices": { "max_concurrent": 23, "stolen": 0 },
  "diagnostics": [],
  "pcm_sha256": "9f2c…",
  "render_time_ms": 41
}
```

---

## 13. Kalite çıtası ve test stratejisi

"FL kalitesi" şu ölçümlerle tanımlanır. Eşikler başlangıç değeridir; M0–M1'de ilk ölçümle
kalibre edilip bu dokümana sabitlenir.

### 13.1 DSP ölçüm testleri (`tests/dsp`)

| Bileşen | Test | Eşik |
|---------|------|------|
| polyBLEP saw | f0 = 1 kHz @ 48 kHz, alias bileşenlerinin toplam enerjisi / sinyal | ≤ −60 dB |
| wavetable (v2.x) | aynı test | ≤ −90 dB |
| Saturator 4x | 1 kHz sine, +12 dB drive, alias/sinyal | ≤ −70 dB |
| EQ bell | Analitik büyüklük tepkisiyle fark, 20 Hz–20 kHz | ≤ 0.1 dB |
| Butterworth HP/LP | −3 dB noktası ve eğim | ±1% frekans, ±0.5 dB/okt |
| Ladder | Rezonans 1.0'da self-oscillation genliği kararlı; cutoff 20 Hz↔20 kHz audio-rate sweep'te NaN/Inf yok | — |
| Limiter | 1.000 rastgele + kötü durum sinyalinde 4x true-peak | ≤ ceiling + 0.05 dB |
| LUFS ölçer | **EBU Tech 3341** uyumluluk sinyalleri | ±0.1 LU |
| LRA | **EBU Tech 3342** sinyalleri | ±1 LU |
| Voice steal / smoothing | Ani parametre değişimi ve voice steal'de türev tabanlı tık detektörü | Tık yok |
| Denormal | Sessiz giriş sonrası 10 s reverb kuyruğunda CPU süresi sabit | ≤ %10 artış |

### 13.2 Birim testleri

doctest (MIT). Tempo map dönüşümleri, sequencer olay sıralaması, voice allocator, routing derleyicisi,
PDC hesapları, JSON çeviri, diagnostics.

### 13.3 Golden / determinizm testleri

`tests/golden/projects/*.json` (≥ 40 proje: 25 legacy preset, davul döngüsü, polifonik pad,
sidechain, otomasyon, tempo rampası, sampler, stem export). Her biri dört platformda render edilir,
`pcm_sha256` `golden.json` ile karşılaştırılır.

### 13.4 Parity testleri

§12.3 tablosu; TS referans motoru M2 sonuna kadar repoda tutulur ve CI'da karşılaştırılır.

### 13.5 Realtime güvenlik testleri

- Test binary'sinde global `operator new/delete` override'ı; `process()` süresince allocation sayacı 0 olmalı.
- Linux CI'da Clang **RealtimeSanitizer** (`-fsanitize=realtime`, `[[clang::nonblocking]]` ile işaretli `process()`).
- ThreadSanitizer ile control/audio etkileşimi (proje swap, olay kuyruğu, garbage kuyruğu).

### 13.6 Fuzzing

libFuzzer ile proje parser'ı, legacy çevirmen ve C ABI. AI'ın ürettiği bozuk JSON'lar motoru
çökertmemeli; her girdi ya derlenir ya diagnostics döner.

### 13.7 Performans bütçeleri (başlangıç hedefleri)

| Senaryo | Native (4 çekirdek masaüstü) | WASM (Node, tek thread) |
|---------|------------------------------|--------------------------|
| Tek legacy preset render | < 5 ms | < 15 ms |
| 3 dk şarkı, 16 track, 64 ses, 2 reverb, sidechain | ≥ 50x realtime | ≥ 15x realtime |
| Realtime, 48 kHz, 128 frame, aynı şarkı | Bir çekirdeğin < %50'si, 10 dk xrun yok | AudioWorklet'te xrun yok |
| WASM paket boyutu | — | ≤ 800 KB gzip |
| Native kütüphane boyutu (strip'li, platform başına) | ≤ 1.5 MB | — |
| Tek legacy preset, orta segment Android (arm64) | < 20 ms | — |
| Runtime realtime, mobil, 48 kHz, 256 frame, 16 ses + 1 reverb | Bir çekirdeğin < %25'i | — |

Benchmark'lar `nanobench` (MIT) ile; CI'da sonuç kaydedilir, %15 gerileme uyarı üretir.

---

## 14. Proje formatı (JSON)

### 14.1 Genel kurallar

- `schema_version: "makesfx/1"` zorunlu. Uyumsuz değişiklik yeni major sürüm ister; eski sürümler için
  migration fonksiyonu yazılır.
- Birim alan adında: `_hz`, `_db`, `_ms`, `_s`, `_ticks`, `_cents`, `_semitones`. Birimsiz oranlar 0–1.
- ID'ler `[a-z0-9_]+`, proje içinde tür başına benzersiz.
- Zaman değerleri tick, ya da `"1.2.0"` (bar.beat.tick) / `"2b"` (beat) / `"500ms"` string kısayolları;
  derlemede tick'e çevrilir.
- Dosya uzantısı: `.msfx.json`.
- JSON Schema (draft 2020-12) `schema-gen` ile registry'den üretilir ve npm paketinde yayınlanır.

### 14.2 Kısa form: tek SFX

```json
{
  "schema_version": "makesfx/1",
  "sound": {
    "instrument": { "type": "sfx", "preset": "laser", "params": { "frequency": 880, "slide": -2 } },
    "category": "combat",
    "seed": 7
  }
}
```

Derlemede tek enstrüman, tek nota, tek kanal ve `category` mastering'i olan tam projeye genişler.

### 14.3 Tam proje örneği

```json
{
  "schema_version": "makesfx/1",
  "project": {
    "name": "arcade_loop",
    "sample_rate": 48000,
    "seed": 42,
    "tempo": [{ "tick": 0, "bpm": 128 }],
    "time_signature": [{ "bar": 0, "numerator": 4, "denominator": 4 }],
    "length": "8.0.0"
  },
  "assets": [
    { "id": "vox_chop", "path": "assets/vox.wav", "sha256": "3b1e…" }
  ],
  "instruments": [
    { "id": "kit", "type": "drum", "pads": {
        "36": { "model": "kick", "pitch_hz": 52, "decay_ms": 380, "click": 0.4, "drive_db": 4 },
        "38": { "model": "snare", "tone_hz": 190, "snappy": 0.7 },
        "42": { "model": "hat", "decay_ms": 45, "choke_group": 1 },
        "46": { "model": "hat", "decay_ms": 320, "choke_group": 1 } } },
    { "id": "bass", "type": "subtractive", "polyphony": 1, "mono": { "mode": "legato", "glide_ms": 40 },
      "osc": [{ "wave": "saw", "level": 1.0 }, { "wave": "pulse", "pulse_width": 0.3, "semitones": -12, "level": 0.6 }],
      "filter": [{ "type": "ladder", "cutoff_hz": 420, "resonance": 0.35, "env_amount_oct": 2.5, "keytrack": 0.5 }],
      "env": { "amp": { "attack_ms": 2, "decay_ms": 200, "sustain": 0.8, "release_ms": 80 },
               "filter": { "attack_ms": 0, "decay_ms": 160, "sustain": 0.0, "release_ms": 80 } },
      "mod": [{ "source": "lfo1", "destination": "filter.0.cutoff_hz", "amount": 0.3 }],
      "lfo": [{ "id": "lfo1", "shape": "sine", "rate": "1/8", "sync": true }] },
    { "id": "zap", "type": "sfx", "preset": "laser", "root_key": 69 }
  ],
  "patterns": [
    { "id": "beat", "length": "1.0.0", "notes": {
        "kit": { "steps": { "36": "x...x...x...x...", "38": "....x.......x...", "42": "x.x.x.x.x.x.x.x." } } } },
    { "id": "bassline", "length": "2.0.0", "notes": {
        "bass": [
          { "tick": 0,    "length": 480, "key": 36, "velocity": 0.9 },
          { "tick": 720,  "length": 240, "key": 36, "velocity": 0.7 },
          { "tick": 960,  "length": 480, "key": 39, "velocity": 0.8, "slide": true },
          { "tick": 1920, "length": 960, "key": 34, "velocity": 0.85 } ] } } },
    { "id": "fx_hits", "length": "4.0.0", "notes": {
        "zap": [{ "tick": 14400, "length": 240, "key": 81, "velocity": 1.0 }] } }
  ],
  "playlist": {
    "tracks": [
      { "id": "t_drums", "clips": [{ "pattern": "beat", "start": "0.0.0", "repeat": 8 }] },
      { "id": "t_bass",  "clips": [{ "pattern": "bassline", "start": "0.0.0", "repeat": 4 }] },
      { "id": "t_fx",    "clips": [{ "pattern": "fx_hits", "start": "4.0.0" }] }
    ],
    "automation": [
      { "target": "instruments.bass.filter.0.cutoff_hz",
        "points": [{ "tick": 0, "value": 300 }, { "tick": "8.0.0", "value": 2400, "curve": "exp" }] }
    ]
  },
  "mixer": {
    "pan_law_db": -3,
    "channels": [
      { "id": "drums", "inputs": ["kit"], "fader_db": -3,
        "fx": [{ "type": "compressor", "threshold_db": -12, "ratio": 3, "attack_ms": 10, "release_ms": 80 }] },
      { "id": "bass", "inputs": ["bass"], "fader_db": -6,
        "fx": [{ "type": "saturator", "curve": "tanh", "drive_db": 6, "mix": 0.5, "oversampling": 4 },
               { "type": "compressor", "threshold_db": -20, "ratio": 8, "attack_ms": 1, "release_ms": 120,
                 "sidechain_of": "kick_sc" }] },
      { "id": "fx", "inputs": ["zap"], "fader_db": -8,
        "sends": [{ "to": "verb", "level_db": -10, "pre_fader": false }] },
      { "id": "kick_sc", "inputs": ["kit:36"], "output": "none" },
      { "id": "verb", "type": "bus",
        "fx": [{ "type": "reverb", "algorithm": "plate", "decay_s": 1.8, "predelay_ms": 20, "damping_hz": 6000, "mix": 1.0 }] }
    ],
    "master": {
      "fx": [{ "type": "eq", "bands": [{ "type": "highpass", "freq_hz": 25, "slope_db": 24 }] },
             { "type": "limiter", "ceiling_dbtp": -1.0, "lookahead_ms": 1.5 }]
    }
  },
  "mastering": { "mode": "music", "target_lufs": -14, "ceiling_dbtp": -1 },
  "render": { "bit_depth": 24, "dither": true, "stems": ["drums", "bass", "fx"], "max_tail_s": 6 }
}
```

`"kit:36"` sözdizimi bir drum pad'inin sinyalini ayrı bir kanala da besler; pad enstrümanın ana çıkışından
çalmaya devam eder (FL'deki "pad başına mixer track"). Örnekte `kick_sc` kanalı duyulmaz (`"output": "none"`),
yalnızca bass kompresörünün sidechain kaynağıdır.

### 14.4 Düzenleme (patch)

Projeyi değiştirmek için **JSON Patch (RFC 6902)** desteklenir. AI ajanı tüm projeyi yeniden yazmak yerine
`[{ "op": "replace", "path": "/instruments/1/filter/0/cutoff_hz", "value": 600 }]` gönderir.

### 14.5 Diagnostics

```json
{
  "severity": "error",
  "code": "E_OUT_OF_RANGE",
  "path": "/instruments/1/filter/0/resonance",
  "message": "resonance 1.4 aralık dışında",
  "expected": { "min": 0, "max": 1 },
  "hint": "Self-oscillation için 1.0 kullanın"
}
```

- Tüm hatalar toplanır (ilk hatada durmaz).
- **Strict** (varsayılan): bilinmeyen alan ve aralık dışı değer hata.
- **Lenient**: bilinmeyen alan uyarı, aralık dışı değer clamp + uyarı.
- Kod listesi registry ile birlikte üretilir ve dokümante edilir.

---

## 15. API'ler

### 15.1 C++ (iç ve gömülü kullanım)

```cpp
// include/makesfx/engine.hpp
#pragma once
#include <cstdint>
#include <memory>
#include <span>
#include <string_view>
#include "makesfx/result.hpp"   // Result<T>, Diagnostics

namespace makesfx {

enum class RenderMode : uint8_t { Offline, Realtime };

struct EngineConfig {
  double   sampleRate   = 48000.0;
  uint32_t maxBlockSize = 1024;
  uint32_t numOutputs   = 2;
  RenderMode mode       = RenderMode::Realtime;
};

struct AudioBlock {
  std::span<float* const> outputs;   // non-interleaved
  uint32_t numFrames;
};

struct LiveEvent {
  enum class Type : uint8_t { NoteOn, NoteOff, Param, Transport, Panic } type;
  uint32_t target;        // instrument / param handle
  uint32_t sampleOffset;  // blok içi; 0 = hemen
  float    a, b;          // key/velocity veya değer
};

class CompiledProject;    // immutable, paylaşılabilir

Result<std::shared_ptr<const CompiledProject>>
compileProject(std::string_view json, const EngineConfig&, const CompileOptions& = {});

class Engine {
public:
  static Result<std::unique_ptr<Engine>> create(const EngineConfig&);
  ~Engine();

  // ── Control thread ──
  void setProject(std::shared_ptr<const CompiledProject>);  // blok sınırında atomik swap
  bool postEvent(const LiveEvent&);                          // false: kuyruk dolu
  ParamHandle resolveParam(std::string_view path) const;
  TransportState transport() const;                          // atomik okuma
  void collectGarbage();                                     // eski projeleri serbest bırakır

  // ── Audio thread ──
  void process(const AudioBlock&) noexcept [[clang::nonblocking]];

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace makesfx
```

```cpp
// include/makesfx/render.hpp
namespace makesfx {

struct RenderOptions {
  std::optional<uint64_t> seed;            // proje seed'ini ezer
  std::vector<std::string> stems;          // boş: yalnız master
  bool applyMastering = true;
  uint32_t threads = 0;                    // 0: otomatik, WASM'da 1
};

struct RenderResult {
  StereoBuffer master;                     // float32
  std::vector<std::pair<std::string, StereoBuffer>> stems;
  RenderReport report;                     // §12.5
};

Result<RenderResult> renderOffline(const CompiledProject&, const RenderOptions& = {});
Result<std::vector<uint8_t>> encodeWav(const StereoBuffer&, const WavFormat&, uint64_t ditherSeed);

} // namespace makesfx
```

Notlar:
- `Result<T>` kendi tipimizdir (C++23 `std::expected` benzeri). Çekirdek `-fno-exceptions` ile derlenebilir;
  bu WASM boyutu için önemlidir.
- WAV yazma ve dosya I/O motorun dışındadır (`encodeWav` byte döndürür, dosyaya yazmak çağıranın işi).

### 15.2 C ABI (tüm binding'lerin tek yüzeyi)

```c
/* include/makesfx/makesfx.h */
typedef struct msfx_project msfx_project;
typedef struct msfx_engine  msfx_engine;
typedef struct msfx_render  msfx_render;

/* JSON çıktılar (diagnostics, rapor) motora ait bellekte; *_free ile bırakılır. */
int  msfx_compile(const char* json, size_t len, const char* options_json,
                  msfx_project** out, const char** diagnostics_json);
void msfx_project_free(msfx_project*);

int  msfx_render_offline(const msfx_project*, const char* options_json, msfx_render** out);
size_t       msfx_render_frames(const msfx_render*);
const float* msfx_render_channel(const msfx_render*, const char* stem /*NULL=master*/, int channel);
int  msfx_render_wav(const msfx_render*, const char* stem, const char* format_json,
                     const uint8_t** bytes, size_t* len);
const char*  msfx_render_report(const msfx_render*);
void msfx_render_free(msfx_render*);

msfx_engine* msfx_engine_create(double sample_rate, unsigned max_block, unsigned outputs);
void msfx_engine_set_project(msfx_engine*, const msfx_project*);
int  msfx_engine_post(msfx_engine*, int type, unsigned target, unsigned offset, float a, float b);
void msfx_engine_process(msfx_engine*, float** outputs, unsigned frames);
void msfx_engine_free(msfx_engine*);

/* Oyun motorları interleaved float buffer verir (Unity OnAudioFilterRead, Unreal ISoundGenerator). */
void msfx_engine_process_interleaved(msfx_engine*, float* interleaved, unsigned frames, unsigned channels);
int  msfx_engine_set_macro(msfx_engine*, unsigned macro_handle, float value);   /* oyun parametresi bağlama */
unsigned msfx_engine_resolve(const msfx_engine*, const char* path);             /* path/macro → handle */

/* Render'ı çağıranın buffer'ına yazar (kopyasız; Unity AudioClip.SetData, Unreal PCM buffer). */
int  msfx_render_into(const msfx_project*, const char* options_json,
                      float* interleaved, size_t capacity_frames, unsigned channels, size_t* frames_written);

/* Gömme kancaları: motorun allocator'ı ve log sistemi kullanılır (Unreal FMemory, Unity Debug.Log). */
typedef void* (*msfx_alloc_fn)(size_t size, size_t align, void* user);
typedef void  (*msfx_free_fn)(void* ptr, void* user);
typedef void  (*msfx_log_fn)(int level, const char* message, void* user);
void msfx_set_allocator(msfx_alloc_fn, msfx_free_fn, void* user);   /* ilk çağrıdan önce */
void msfx_set_log_callback(msfx_log_fn, void* user);                /* audio thread'den asla çağrılmaz */

const char* msfx_schema_json(void);       /* JSON Schema */
const char* msfx_parameters_json(void);   /* registry: MCP sfx_get_parameters için */
const char* msfx_version(void);
unsigned    msfx_abi_version(void);       /* binding'ler yüklemede kontrol eder */
```

ABI kuralları:
- Yalnızca C tipleri; C++ exception'ı sınırı asla geçmez; tüm fonksiyonlar NULL-güvenlidir ve hata kodu döner.
- `msfx_abi_version()` uyumsuz değişiklikte artar; Unity/Unreal binding'leri yüklemede kontrol eder, uyuşmazsa açık hata verir.
- Her fonksiyonun thread güvenliği header'da belgelenir. `msfx_compile` ve `msfx_render_*` farklı projeler
  üzerinde farklı thread'lerden aynı anda çağrılabilir (oyun motorlarında arka plan render'ı için).
- `msfx_engine_process*` yalnızca tek bir audio thread'den çağrılır.

Bu yüzey C# (Unity P/Invoke), Unreal C++ modülü, Python (ctypes), Godot (GDExtension) ve Rust (FFI) için ortak kapıdır.

### 15.3 TypeScript (`make-sfx-core` 2.0)

```ts
import { init, renderProject, renderSound, presets } from "make-sfx-core";

await init();                      // tarayıcıda zorunlu; Node'da import anında senkron hazırlanır

// Yeni API
const { wav, report, stems } = renderProject(project, { stems: ["drums"] });

// Legacy API — imza değişmez, arkada WASM motoru
writeFileSync("jump.wav", renderSound(presets.jump));
```

- WASM modülü Node'da senkron derlenir (`new WebAssembly.Module`), böylece mevcut senkron `renderSound`
  kırılmaz. Tarayıcıda ana thread'de büyük modül senkron derlenemediği için `await init()` gerekir; init
  edilmeden çağrılırsa açıklayıcı hata verilir.
- WASM belleği derleme/yükleme anında büyütülür; `process()` sırasında **büyüme yasaktır**
  (`ArrayBuffer` detach olup JS view'ları geçersizleşmesin diye). Başlangıç belleği projeye göre hesaplanır.
- Geçiş süresince `engine: "wasm" | "ts"` opsiyonu; TS motoru M2 sonunda kaldırılır (major sürüm).

### 15.4 CLI

```
makesfx render  <project.msfx.json> -o out.wav [--stems] [--seed N] [--bit-depth 16|24|32f] [--lenient]
makesfx validate <project.msfx.json>          # diagnostics JSON, çıkış kodu 0/1
makesfx schema                                 # JSON Schema'yı yazdırır
makesfx params [--filter sfx]                  # parametre registry'si
makesfx legacy  <soundconfig.json> -o project.msfx.json
makesfx midi-import <song.mid> -o project.msfx.json
makesfx play <project.msfx.json>               # realtime host (M6)
makesfx export <pack.msfx.json> --engine unity|unreal|roblox -o <dir>
makesfx analyze <file.wav>                     # LUFS, true-peak, LRA raporu
```

Mevcut `packages/core/src/cli.ts` komutları (pack, variants) TS tarafında kalır, WASM motorunu kullanır.

### 15.5 MCP (`make-sfx-mcp`)

Mevcut `sfx_*` araçları korunur, motor WASM'a geçer. Yeni araçlar:

| Araç | Görev |
|------|-------|
| `project_validate` | Proje JSON'unu doğrular, diagnostics döner |
| `project_render` | Render + WAV + stem'ler + rapor |
| `project_patch` | RFC 6902 patch uygular, doğrular, opsiyonel render |
| `music_compose` | Tarif ("lo-fi, 90 bpm, 16 bar, Dm") → proje iskeleti (instrument + pattern + mixer şablonları) |
| `music_add_part` | Var olan projeye bölüm/enstrüman ekler (ör. "drop'tan önce 2 bar riser") |
| `audio_analyze` | WAV veya render için loudness/spektral özet |
| `params_get` | Registry'den parametre açıklamaları (enstrüman/efekt bazında) |
| `game_export` | Paketi hedef motora hazır biçimde yazar: `engine: unity` → `Assets/…` altına WAV + `.msfx.json` + import ayarları; `engine: unreal` → `Content/…` altına WAV + `.msfx.json`; `engine: roblox` → WAV + `manifest.json` + `SfxIds.luau` + `MakeSfx.luau` (§17.5) |
| `game_detect` | Çalışma dizinindeki oyun projesini tanır (Unity `ProjectSettings/`, Unreal `.uproject`, Rojo `default.project.json`) ve `game_export` için varsayılan yolları önerir |

AI döngüsü: `compose → validate → render → rapora bak → patch → render → game_export`. Rapor ve diagnostics
makine tarafından okunacak şekilde tasarlandığı için ajan kendi hatasını düzeltebilir.

**MCP-first ilkeleri:**
- Her araç yapılandırılmış JSON döner (yol, hash, LUFS, diagnostics); serbest metin yalnızca açıklama alanında.
- Araçlar idempotent'tir: aynı girdi aynı dosyaları üretir (determinizm), ajan güvenle tekrar çalıştırabilir.
- Platform dağıtımı (Roblox yüklemesi, Unity/Unreal'da sahneye yerleştirme) make-sfx'in işi değildir; ajan bunu
  diğer MCP sunucularıyla (ör. Roblox Studio MCP, Unity/Unreal MCP araçları) birleştirir. make-sfx bu birleşimi
  kolaylaştırmak için manifest'te kararlı yollar ve hash'ler verir.
- `sfx_help` / `instructions.ts` ajan için oyun motoru başına kısa iş akışı tarifleri içerir.

---

## 16. Realtime host'lar

### 16.1 Native (`src/host/`, miniaudio)

- Backend'ler: WASAPI (shared/exclusive), CoreAudio, ALSA, PulseAudio, JACK.
- miniaudio thread önceliğini ayarlar; Windows'ta MMCSS "Pro Audio" görevine kayıt.
- Cihaz blok boyutu değişirse `Engine` bunu `maxBlockSize` içinde karşılar; aşarsa iç bölme yapılır.
- **ASIO** v2'de yok: miniaudio desteklemez, Steinberg SDK lisansı ayrıca değerlendirilmeli.
  WASAPI exclusive ile 48 kHz'de 128 frame (~2.7 ms) hedeflenir.

### 16.2 Tarayıcı (`wasm/`, AudioWorklet)

- WASM modülü AudioWorkletGlobalScope'ta yüklenir; render quantum 128 frame.
- Olaylar varsayılan olarak `MessagePort` ile gelir (worklet tarafında kuyruğa alınır, allocation yok).
- `SharedArrayBuffer` ring buffer yalnızca `crossOriginIsolated` ise kullanılır. **GitHub Pages COOP/COEP
  header'ı ayarlayamaz**; playground için `coi-serviceworker` yaklaşımı ya da MessagePort yolu kullanılır.
- Proje derleme worklet dışında (bir Worker'da) yapılır, derlenmiş proje worklet'e aktarılır.

### 16.3 Playground hedefi (M6)

Transport, tempo, pattern seçimi, minimal piano roll, kanal fader'ları, parametre düzenleme ve canlı dinleme.
Tam DAW arayüzü hedef değildir.

---

## 17. Oyun motoru entegrasyonları

### 17.1 Kullanım modları

| Mod | Ne yapar | Unity | Unreal | Roblox |
|-----|----------|:-----:|:------:|:------:|
| **A. Asset pipeline** | Editörde render → WAV → motorun import'u. Oyun build'i make-sfx'i içermez. | ✓ | ✓ | ✓ |
| **B. Runtime render** | Oyun içinde proje JSON'u + seed → arka planda offline render → motorun ses nesnesi. Build'e WAV yerine KB'lık JSON girer; sınırsız seed varyasyonu. | ✓ | ✓ | — |
| **C. Runtime realtime** | `Engine::process()` motorun audio thread'inde çalışır; notalar ve makrolar oyun kodundan canlı gelir (motor sesi, adaptif müzik). | ✓ | ✓ | — |

A ve B M3'te, C realtime aşamasında (M6) gelir.

### 17.2 Native SDK dağıtımı

| Platform | Çıktı | Unity | Unreal |
|----------|-------|-------|--------|
| Windows x64 | `makesfx.dll` | ✓ | ✓ |
| macOS (arm64 + x86-64 universal) | `makesfx.bundle` (Unity) / `libmakesfx.dylib` | ✓ | ✓ |
| Linux x64 | `libmakesfx.so` | ✓ | ✓ |
| Android arm64-v8a, x86_64 | `libmakesfx.so` | ✓ | ✓ |
| iOS arm64 | `libmakesfx.a` (statik, `__Internal`) | ✓ | ✓ |
| Unity WebGL | C/C++ **kaynak** olarak pakette; Unity'nin kendi Emscripten'i derler (sürüm uyuşmazlığı riskini ortadan kaldırır) | ✓ | — |
| Konsollar | NDA nedeniyle v2 kapsamı dışında; lisanslı geliştiricilere kaynak dağıtımı ileride | — | — |

- Tüm binary'ler CI'da üretilir, imzalanır (macOS notarization dahil) ve GitHub Release'e artefakt olarak eklenir.
- **Determinizm motor içinde de geçerlidir.** Unity ve Unreal entegrasyon testleri golden corpus'un bir
  alt kümesini motor içinden render eder ve hash'leri karşılaştırır. Unreal'ın UBT'si kendi derleyici bayraklarını
  uygular (bazı sürüm/platformlarda gevşek float modları); bu yüzden Unreal'da çekirdek, bayrakları bizim
  kontrolümüzde olan **önceden derlenmiş ThirdParty kütüphane** olarak bağlanır. Kaynaktan derleme yalnızca
  konsol lisanslıları için, kendi bayrak override'ımızla.

### 17.3 Unity

- **Paket:** `com.makesfx.unity`, UPM (git URL + OpenUPM). Hedef Unity 2022.3 LTS ve Unity 6.x.
- **Assembly'ler:** `MakeSfx.Native` (P/Invoke; iOS/WebGL'de `"__Internal"`), `MakeSfx.Runtime`, `MakeSfx.Editor`.
- **Asset tipleri:** `.msfx.json` için ScriptedImporter → `MsfxProject` asset'i (Inspector'da önizleme düğmesi,
  diagnostics listesi, seed alanı).
- **Mod A — Bake:** "Bake to WAV" ve toplu "Generate Pack". Üretilen WAV'ların import ayarları kategoriye göre
  atanır: `ui`/`pickup`/`combat` → Decompress On Load, `ambient` ve müzik → Streaming; loop render'larda loop
  bayrağı açık.
- **Mod B — Runtime:**
  ```csharp
  var clip = await MakeSfx.RenderClipAsync(project, seed: Random.Range(0, int.MaxValue));
  audioSource.PlayOneShot(clip);

  // Önceden ısıtılmış varyant havuzu: N seed arka planda render edilir, sırayla/rastgele dağıtılır
  var pool = new MsfxVariantPool(project, variants: 8);
  await pool.WarmUpAsync();
  audioSource.PlayOneShot(pool.Next());
  ```
  Render `msfx_render_into` ile arka plan thread'inde yapılır (Unity API'sine dokunmaz). `AudioClip.Create` +
  `SetData` ana thread'de çağrılır. Önbellek anahtarı: `(proje hash'i, seed, sample rate)`.
- **Mod C — Realtime:** `MsfxLiveSource` bileşeni `OnAudioFilterRead` içinde `msfx_engine_process_interleaved`
  çağırır. Callback'te GC allocation yasak (pinned buffer, önceden ayrılmış event dizisi). Makrolar
  `liveSource.SetMacro("rpm", value)` ile thread-safe kuyruğa yazılır. Sample rate `AudioSettings.outputSampleRate`.
- **IL2CPP:** Log callback'i `[MonoPInvokeCallback]` ile işaretli statik metot; managed stripping için `link.xml`.
- **Mixer:** Kategori → `AudioMixerGroup` eşleme tablosu (proje ayarlarında).
- **Sonrası (v2.x):** Unity Native Audio Plugin SDK ile make-sfx efektlerinin Audio Mixer efekti olarak sunulması.

### 17.4 Unreal Engine

- **Plugin:** `MakeSfx`, hedef UE 5.4+ (5.x boyunca bakım). Fab üzerinden dağıtıma uygun yapı.
- **Modüller:** `MakeSfxCore` (Runtime; ThirdParty kütüphaneyi bağlar, `msfx_set_allocator` ile `FMemory`'yi,
  `msfx_set_log_callback` ile `UE_LOG`'u kullanır), `MakeSfxEditor` (Editor).
- **Asset tipleri:** `UMakeSfxProject` (`.msfx.json` import factory'si, reimport desteği, diagnostics Message Log'a).
- **Mod A — Bake:** Sağ tık "Bake to Sound Wave" → `USoundWave` asset'i; kategori → `USoundClass`/`USoundSubmix` eşlemesi;
  loop render'larda `bLooping`.
- **Mod B — Runtime:** `UMakeSfxSubsystem::RenderSoundAsync(Project, Seed)` → arka plan task'ında render, game
  thread'de ses nesnesi oluşturulur. Blueprint'ten çağrılabilir; varyant havuzu Unity'deki gibi.
- **Mod C — Realtime:** `UMakeSfxSynthComponent` (`USynthComponent` / `ISoundGenerator` tabanlı) audio render
  thread'inde `msfx_engine_process_interleaved` çağırır. Blueprint: `NoteOn`, `NoteOff`, `SetMacro`, `PlayPattern`.
  Bu aynı zamanda Unreal'ın spatialization, attenuation ve submix efektlerinden yararlanmayı sağlar.
- **Sonrası (v2.x):** MetaSounds custom node ("MakeSfx Instrument"); MetaSounds node API'si sürümler arasında
  değiştiği için ilk sürüme alınmaz.

### 17.5 Roblox Studio

**Kısıt:** Roblox oyunları yalnızca Luau çalıştırır; native kütüphane ya da WASM yüklenemez ve bu tarih itibarıyla
Luau'dan örnek düzeyinde PCM üretmeye yarayan herkese açık bir API yoktur. Bu yüzden Roblox **yalnızca Mod A** ile
desteklenir. Roblox ileride böyle bir API açarsa bu bölüm yeniden ele alınır.

**Sorumluluk sınırı:** make-sfx, Roblox'un kabul ettiği formatta dosyaları ve bunları kullanacak Luau kodunu üretir.
**Yükleme (Open Cloud, moderasyon, kota, creator hesabı) make-sfx'in kapsamında değildir.** Bu adımı kullanıcının
AI ajanı kendi araçlarıyla yapar (Roblox Studio MCP sunucusu, Studio'nun import'u veya kendi Open Cloud akışı).
Böylece make-sfx hiçbir Roblox kimlik bilgisini görmez veya saklamaz.

Export'un uyduğu Roblox ses kısıtları (resmi doküman, 2026-10 itibarıyla; tek bir yapılandırma dosyasında tutulur):
`.mp3/.ogg/.wav/.flac`, < 20 MB, ≤ 7 dakika, ≤ 48 kHz, mono veya stereo. Kısıtı aşan render
(ör. 8 dakikalık müzik) diagnostics ile reddedilir veya bölünme önerisiyle döner.

**Export (`makesfx export --engine roblox` / MCP `game_export`):**
1. WAV dosyaları: ≤ 48 kHz'e zorlanır (`render.sample_rate`), müzik ve ambiyans için `render.loop: true`.
2. `manifest.json`: her ses için dosya yolu, `pcm_sha256`, kategori, LUFS, süre, loop bilgisi ve boş
   `asset_ids` alanı. Ajan yüklemeden sonra ID'leri buraya yazar. Hash alanı sayesinde ajan değişmeyen sesleri
   tekrar yüklemeyebilir (determinizmin doğal faydası).
3. `SfxIds.luau` ModuleScript'i manifest'ten üretilir; ID'ler doldurulunca yeniden üretilebilir:
   ```lua
   return {
     coin = { ids = { "rbxassetid://…", "rbxassetid://…" }, category = "pickup",
              lufs = -12.0, durationS = 0.31 },
     arcade_loop = { ids = { "rbxassetid://…" }, category = "music", looped = true, durationS = 30.0 },
   }
   ```
4. Runtime yardımcısı `MakeSfx.luau`: varyantlar arasında rastgele seçim, `PlaybackSpeed` ile ek pitch varyasyonu,
   kategori → `SoundGroup` eşlemesi, `Sound` nesne havuzu (her çalışta yeni instance oluşturmaz).

Varyasyon stratejisi: runtime sentez olmadığı için ses başına K seed varyantı render edilir (varsayılan 4) ve
Roblox tarafında `PlaybackSpeed` ile genişletilir.

### 17.6 Ortak oyun özellikleri

- **Makrolar (RTPC benzeri):** Proje, oyunun bağlayabileceği isimli makrolar tanımlar:
  ```json
  "macros": [
    { "id": "rpm", "range": [800, 7000], "default": 800, "smoothing_ms": 30,
      "targets": [{ "destination": "instruments.motor.pitch_semitones", "amount": 24, "curve": "log" },
                  { "destination": "mixer.motor.fx.0.cutoff_hz", "amount": 1.0 }] },
    { "id": "intensity", "range": [0, 1], "targets": [{ "destination": "playlist.layer.drums.gain_db", "amount": 9 }] }
  ]
  ```
  Mod B'de makrolar render parametresidir (seed gibi önbellek anahtarına girer); Mod C'de canlı değişir.
- **Kategori eşleme:** `ui`, `combat`, `pickup`, `ambient`, `stinger`, `music` → Unity `AudioMixerGroup`,
  Unreal `USoundClass`, Roblox `SoundGroup`.
- **Variant pack'leri:** Mevcut `sfx_game_pack` çıktısı motorun yerel pack formatına export edilir
  (`makesfx export --engine unity|unreal|roblox`).
- **Kesintisiz loop'lar** (§12.1) ve **export sample rate** tüm motorlarda kullanılır.
- **Bellek:** Mod B'de render edilen klipler motorun ses belleğindedir; varyant havuzu boyutu ve önbellek üst sınırı
  (MB) yapılandırılabilir. Mod C'de bellek proje derlemesinde sabittir ve rapordan okunur (`report.memory_bytes`).

---

## 18. Build, araçlar ve bağımlılıklar

### 18.1 Toolchain

- C++20; MSVC 19.38+ (VS 2022), Clang 17+, GCC 12+, Emscripten 3.1.50+.
- CMake 3.24+, `CMakePresets.json` (debug, release, asan, rtsan, wasm).
- Bağımlılıklar `FetchContent` ile **sabit commit**'e pinlenir; `third_party/` lisans dosyaları dağıtılır.
- Uyarılar: `-Wall -Wextra -Wpedantic -Wconversion -Wshadow` (MSVC `/W4`), CI'da hata olarak.
- clang-format + clang-tidy (modernize, bugprone, performance).

### 18.2 Bağımlılıklar

| Paket | Kullanım | Lisans |
|-------|----------|--------|
| miniaudio | Realtime ses I/O | Public domain / MIT-0 |
| dr_wav | WAV okuma (yazma opsiyonel) | Public domain / MIT-0 |
| yyjson | JSON parse (exception'sız, hata konumu verir) | MIT |
| readerwriterqueue | SPSC kuyruk (veya kendi implementasyonumuz) | BSD-2 |
| pffft veya KissFFT | Wavetable mipmap, test ölçümleri | BSD benzeri / BSD-3 |
| doctest | Birim testleri | MIT |
| nanobench | Benchmark | MIT |
| picosha2 | Rapor hash'i | MIT |

**Bilinçli olarak dışarıda:** JUCE (AGPLv3/ticari, MIT ile uyumsuz ve WASM'a zor derlenir),
libsndfile (LGPL), nlohmann/json (exception'a dayalı, WASM boyutu).

### 18.3 CI matrisi

| İş | Platform |
|----|----------|
| build + unit + dsp + golden | windows-latest (MSVC), ubuntu-latest (GCC, Clang), macos-latest (arm64 Clang) |
| Android (NDK, arm64-v8a + x86_64) build + golden (emülatör) | ubuntu-latest |
| iOS (arm64) build + golden (simülatör) | macos-latest |
| wasm build + golden (Node) + TS testleri | ubuntu-latest |
| Unity paketi: EditMode/PlayMode testleri, golden alt kümesi motor içinden | GameCI (Unity lisans secret'ı ile) |
| Unreal plugin'i: derleme + Automation testleri | self-hosted runner (UE kurulumu büyük olduğu için) |
| Roblox: Luau testleri (Lune), export çıktısının Roblox kısıtlarına uygunluğu | ubuntu-latest |
| MCP: araç sözleşme testleri (şema, idempotentlik, `game_export` çıktı yapısı) | ubuntu-latest |
| Release: binary imzalama, macOS notarization, UPM/Fab paketleri, npm (`make-sfx-core`, `make-sfx-mcp`) | tag push'ta |
| ASan/UBSan, TSan, RTSan | ubuntu-latest (Clang) |
| fuzz (kısa, PR başına 5 dk) | ubuntu-latest |
| bench (main'e merge'de) | ubuntu-latest |

WASM artefaktı `packages/core/dist/engine.wasm` olarak paketlenir; mevcut `pack:check` kontrolü genişletilir.

---

## 19. Kilometre taşları

Her taşın kabul kriteri sağlanmadan sonraki başlamaz.

### M0 — Altyapı
CMake iskeleti, CI matrisi, Emscripten build, `src/math` (deterministik fonksiyonlar + PCG32), WAV yazıcı,
parametre registry iskeleti, `Result`/diagnostics tipleri.
**Kabul:** 1 kHz sine + polyBLEP saw projeleri dört platformda aynı SHA-256'yı üretir; math fonksiyonları hata eşiklerini sağlar.

### M1 — SFX parity (offline)
1.x pipeline'ın offline portu (`engine/src/legacy/`): ZzFX çekirdek, katmanlar, LFO, texture, master envelope,
voice synth (`voice.ts`), legacy FX zinciri, `category` mastering, seed varyasyonu; JSON girdi + diagnostics;
C ABI `msfx_legacy_render` ve render handle'ları; CLI `legacy`; parity harness; fuzz hedefi.
Proje formatındaki `sfx` enstrümanı bu fonksiyonların üzerine M4'te (proje motoruyla) kurulur. EBU 3341
uyumluluğu BS.1770 gated ölçerle birlikte M4'e taşındı; M1'de K-weighting referans testi var.
**Kabul:** 25 preset + 11 pack tasarımı × seed'ler §12.3 parity eşiklerini geçer; golden corpus (legacy render'lar
dahil) tüm platformlarda yeşil; fuzz CI'da PR başına 5 dk çökme yok (1 saatlik koşu release öncesi).

### M2 — TypeScript entegrasyonu
`make-sfx-core` 2.0 WASM üzerinde; mevcut TS test suite'i WASM backend'e karşı geçer; MCP ve playground WASM kullanır;
registry'den TS tipleri ve `sfx_get_parameters` üretilir.
**Kabul:** Tüm mevcut testler yeşil; paket boyutu bütçesi; `renderSound` imzası değişmeden çalışır. TS motoru kaldırılır.

### M3 — Oyun motoru SDK'ları (Mod A + B)
C ABI'nin oyun motoru ekleri (§15.2: `msfx_render_into`, allocator/log kancaları, ABI sürümü), §17.2'deki tüm
platform binary'leri, kesintisiz loop render, export resampler, Unity paketi (importer, bake, `RenderClipAsync`,
varyant havuzu), Unreal plugin'i (import factory, bake, `RenderSoundAsync`, Blueprint), Roblox export'u
(`manifest.json`, `SfxIds.luau`, `MakeSfx.luau`), `makesfx export --engine`, MCP `game_export` ve `game_detect`.
**Kabul:**
- Unity örnek sahnesi, Unreal örnek haritası ve Roblox örnek place'i aynı 25 preset'lik paketi çalar.
- Golden alt kümesi Unity ve Unreal içinden render edildiğinde hash'ler native ile aynıdır.
- `game_export` aynı girdiyle iki kez çalıştırıldığında byte olarak aynı dosyaları üretir; Roblox export'u kısıtları ihlal etmez.
- Loop render edilen bir ambiyans, motorların loop oynatmasında tık detektörünü temiz geçer.
- Mobil performans bütçesi (§13.7) Android referans cihazda sağlanır.

### M4 — Müzik çekirdeği
Tempo/time signature map, pattern/playlist, step sözdizimi, voice manager (polifoni, stealing, mono/legato/glide, choke),
`subtractive` tam sürüm, `drum`, mixer (dinamik kanallar, send, sidechain, PDC, pan law), modülasyon matrisi,
makrolar (§17.6), otomasyon, stem export, `music` mastering, MIDI import/export.
**Kabul:** EBU Tech 3341/3342 uyumluluk sinyalleri geçer; §14.3 örnek projesi render edilir ve golden'a girer; PDC null testi (gecikmeli ve gecikmesiz paralel yol
toplamı → −120 dB altı fark); tık detektörü temiz; performans bütçesi (native) sağlanır; makrolu bir proje Unity ve
Unreal'da Mod B ile render edilir.

### M5 — Sampler ve FX genişlemesi
`sampler` + SFZ alt kümesi, `compressor` tam sürüm, `gate`, `hall` reverb, chorus/flanger/phaser,
8 bant EQ, transient, oversampling altyapısı tüm doğrusalsız efektlerde.
**Kabul:** §13.1 tablosunun tamamı yeşil.

### M6 — Realtime (Mod C dahil)
`Engine` realtime modu, miniaudio host, `makesfx play`, AudioWorklet host, playground transport + piano roll,
Unity `MsfxLiveSource`, Unreal `UMakeSfxSynthComponent`.
**Kabul:**
- RTSan ve allocation sayacı temiz.
- Referans projede 128 frame / 48 kHz ile 10 dk xrun yok (native ve tarayıcı).
- Unity Profiler'da `OnAudioFilterRead` içinde GC allocation sıfır.
- Unreal'da makro ile sürülen motor sesi demosu (araç RPM'i) xrun'sız çalışır.

### M7 — AI ile beste
MCP `project_*`, `music_*`, `audio_analyze` araçları; JSON Patch; tarif → proje şablon kütüphanesi (tür başına
davul kalıpları, akor ilerlemeleri, enstrüman patch'leri, oyun türü başına müzik/SFX paketleri).
**Kabul:**
- 10 farklı tariften üretilen projeler hatasız derlenir ve render edilir; ajan diagnostics ile en fazla 2 turda düzeltir.
- Uçtan uca senaryo, her motor için: ajan yalnızca MCP araçlarıyla tariften ("platformer için 3 bölüm müziği + 20 SFX")
  oyun projesine hazır paket üretir ve proje açıldığında sesler çalar.

### Sonrası (v2.x)
`wavetable`, `fm`, canlı MIDI giriş, açık SIMD, MetaSounds node'u, Unity Native Audio Plugin efektleri,
Wwise/FMOD plugin'leri, Godot GDExtension, konsol desteği, CLAP instrument olarak dağıtım (CLAP MIT lisanslı),
WASM thread'leri.

---

## 20. Riskler

| Risk | Etki | Önlem |
|------|------|-------|
| Platformlar arası float farkı | Determinizm sözü bozulur | §5.2 kuralları, M0'da erken kanıt, golden CI |
| TS ↔ C++ parity yakalanamaz | Mevcut kullanıcıların sesleri değişir | `quality: "legacy"` yolu, double port, parity eşikleri, major sürüm + değişiklik notu |
| İki motorun aynı anda bakımı | Hız kaybı | TS motoru M2 sonunda kaldırılır; M1–M2 arası yeni özellik yalnızca C++'a |
| WASM boyutu ve senkron yükleme | Tarayıcıda yavaş açılış | `-fno-exceptions`, `-Oz`, bütçe CI'da; `init()` ile async yükleme |
| Kapsam büyümesi (DAW'a dönüşme) | Bitmeyen proje | §1.2 hedef dışı listesi; M'ler kabul kriterine bağlı |
| GitHub Pages header kısıtı | SAB kullanılamaz | MessagePort yolu varsayılan |
| AI'ın ürettiği geçersiz projeler | Kötü deneyim | Strict diagnostics + hint, JSON Schema, fuzzing, `project_patch` |
| Roblox ses kısıtlarının değişmesi | Export edilen dosyalar reddedilir | Kısıtlar tek yapılandırma dosyasında; release öncesi resmi dokümanla doğrulama adımı |
| Ajanın MCP araçlarını yanlış sırada/eksik kullanması | Yarım paketler | `instructions.ts`'te motor başına iş akışı tarifleri, `game_detect`, idempotent araçlar, M7 uçtan uca senaryo testleri |
| Unreal sürüm değişimleri ve UBT bayrakları | Derleme kırılır veya determinizm bozulur | Önceden derlenmiş ThirdParty kütüphane, desteklenen UE sürümleri CI'da, motor içi golden testi |
| Unity IL2CPP / platform farkları | Mobilde veya WebGL'de çökme | Platform başına PlayMode testleri, WebGL için kaynak dağıtımı, `link.xml` |
| Platform binary bakım yükü | Release yavaşlar | Tek CMake preset matrisi, tamamen otomatik release iş akışı |
| Mobil CPU ve pil | Runtime modlar mobilde ağır kalır | Mod B varsayılan (önceden render + önbellek), Mod C mobil için bütçeli ve opt-in |

---

## 21. Kararlar ve açık sorular

### 21.1 Kararlar (2026-10-20)

1. **Legacy sample rate:** Legacy SFX 44.1 kHz'de kalır; 48 kHz opt-in. Yeni projeler 48 kHz.
2. **TS motoru:** M2 sonunda kaldırılır; `make-sfx-core` 2.0 major sürüm olarak çıkar.
3. **Oyun motorları kapsamda:** Unity, Unreal Engine ve Roblox Studio birincil hedeflerdir (§17, M3 ve M6).
   Godot ileriye kalır.
4. **Proje formatı:** Yalnızca JSON. YAML yok; tek format JSON Schema, AI üretimi ve motor importer'ları için daha güvenli.
5. **Lisans:** MIT. Unity Asset Store, Fab ve Roblox dağıtımıyla uyumlu.
6. **Minimum motor sürümleri:** Unity 2022.3 LTS, Unreal Engine 5.4. Daha eski sürümler desteklenmez.
7. **MCP birincil arayüzdür.** Kullanıcılar make-sfx'i MCP ile kendi ajanlarına bağlar; müziği ve SFX'i ajan üretir.
8. **Roblox yüklemesi kapsam dışıdır.** make-sfx dosya + manifest + Luau kodu üretir; yükleme, kota ve creator hesabı
   kullanıcının ajanının ve araçlarının sorumluluğundadır. make-sfx Roblox kimlik bilgisi tutmaz.

9. **Mobil:** Android/iOS binary'leri M3'te gelir. M0'dan itibaren CI'da yalnızca derleme kontrolü yapılır.
10. **Konsollar:** Talep olana kadar kapsam dışı.
11. **ZzFX perde hatası düzeltildi (TS ve C++).** TS portunda `startFrequency` satırındaki parantez yüzünden faz örnek
    başına `f` tam tur ilerliyordu; sine/triangle/saw şekillerinde duyulan perde `frac(f) × sample rate` idi
    (ör. 441.3 Hz → 13.230 Hz, tam sayı frekanslarda ~sessizlik). Upstream ZzFX davranışına dönüldü. Eşdeğerlik
    testleri düzeltilmiş TS'e karşı yapılır. Mevcut preset'lerin sesi değişir; 2.0 sürüm notuna girer.
12. **Kategori loudness'ı momentary max ile ölçülür** (§12.2). Düzeltmeden sonra uzun kuyruklu sesler gating'siz
    integrated ölçümle hedefe ulaşamıyordu. TS'te `measureLufs` bu ölçümü yapar, eski ölçüm `measureIntegratedLufs`
    olarak kalır.

### 21.2 Açık sorular

1. **Dağıtım kanalları:** Unity Asset Store ve Fab'de ücretsiz listeleme mi, yalnızca GitHub/OpenUPM mi? (M3'e kadar karar gerekmez.)
