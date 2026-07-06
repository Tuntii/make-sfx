# Game SFX Pack Example

Bu örnek, kullanıcının istediği senaryoyu gösterir:

> Oyunum için zıplama ve daha tiz bir blink sesi

## Üret

```bash
pnpm generate
```

Çıktı:

```
public/assets/sfx/
  jump.wav
  blink.wav      # pitchShift: 1.5 (daha tiz)
  coin.wav
  hit.wav
  powerup.wav
sounds.json      # parametreler + kod snippet'leri
```

## Demo

```bash
pnpm dev
```

- **Procedural** — `make-sfx-core` ile runtime'da ses üretir (dosya yok)
- **WAV** — `public/assets/sfx/` altındaki export edilmiş dosyaları çalar

## Kod

```typescript
import { modify, presets } from "make-sfx-core";
import { play } from "make-sfx-core/browser";

play(presets.jump);
play(modify(presets.blink, { pitchShift: 1.5 }));
```

MCP kurulunca aynı paket `sfx_batch_create` ile tek komutla üretilebilir.