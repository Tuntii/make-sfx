import {
  GAME_PACK_DESIGNS,
  findPresetsByTag,
  listPresets,
  type SoundDesignInput,
} from "make-sfx-core";

export interface DescribeResult {
  description: string;
  segments: string[];
  designs: SoundDesignInput[];
  notes: string[];
}

const SEGMENT_SPLIT = /\s+(?:ve|and|,|\+|&|;|\/)\s+|\s*,\s*/i;

type ModifierRule = {
  test: (text: string) => boolean;
  apply: () => Partial<SoundDesignInput>;
  note: string;
};

const MODIFIER_RULES: ModifierRule[] = [
  {
    test: (t) => /tiz|high[\s-]?pitch|yüksek/i.test(t),
    apply: () => ({ pitchShift: 1.5 }),
    note: "tiz → pitchShift 1.5",
  },
  {
    test: (t) => /çok\s*tiz|very\s*high/i.test(t),
    apply: () => ({ pitchShift: 2 }),
    note: "çok tiz → pitchShift 2",
  },
  {
    test: (t) => /kalın|kalin|low[\s-]?pitch|derin|bass/i.test(t),
    apply: () => ({ pitchShift: 0.7 }),
    note: "kalın → pitchShift 0.7",
  },
  {
    test: (t) => /yankılı|yankili|reverb|echo|uzaylı|uzayli|spacious/i.test(t),
    apply: () => ({ space: 0.2, fx: { reverbMix: 0.2 } }),
    note: "yankılı → space + reverbMix",
  },
  {
    test: (t) => /kısa|kisa|short|quick|snappy/i.test(t),
    apply: () => ({ master: { duration: 0.08 } }),
    note: "kısa → master.duration 0.08",
  },
  {
    test: (t) => /uzun|long|sustained/i.test(t),
    apply: () => ({ master: { duration: 0.4 } }),
    note: "uzun → master.duration 0.4",
  },
  {
    test: (t) => /punchy|güçlü|guclu|sert|darbe|impact/i.test(t),
    apply: () => ({ punch: 0.6, texture: { transient: 0.4 } }),
    note: "punchy → punch + transient",
  },
  {
    test: (t) => /parlak|bright|crisp/i.test(t),
    apply: () => ({ brightness: 0.35 }),
    note: "parlak → brightness",
  },
  {
    test: (t) => /yumuşak|yumusak|soft|gentle/i.test(t),
    apply: () => ({ warmth: 0.4, master: { fadeIn: 0.02 } }),
    note: "yumuşak → warmth",
  },
  {
    test: (t) => /8[\s-]?bit|chiptune|retro/i.test(t),
    apply: () => ({ grit: 0.3, params: { shape: 5, bitCrush: 0.05 } }),
    note: "retro → grit + square wave",
  },
  {
    test: (t) => /stereo|geniş|genis|wide/i.test(t),
    apply: () => ({ fx: { stereoWidth: 0.5 } }),
    note: "stereo → stereoWidth",
  },
];

const PRESET_ALIASES: Record<string, string> = {
  zıplama: "jump",
  ziplama: "jump",
  jump: "jump",
  blink: "blink",
  tık: "click",
  tik: "click",
  click: "click",
  coin: "coin",
  altın: "coin",
  altin: "coin",
  pickup: "coin",
  toplama: "coin",
  hit: "hit",
  hasar: "hit",
  damage: "hit",
  çarpma: "hit",
  carpma: "hit",
  powerup: "powerup",
  güç: "powerup",
  guc: "powerup",
  boost: "powerup",
  upgrade: "powerup",
  explosion: "explosion",
  patlama: "explosion",
  boom: "explosion",
  laser: "laser",
  lazer: "laser",
  swoosh: "swoosh",
  whoosh: "swoosh",
  footstep: "footstep",
  adım: "footstep",
  adim: "footstep",
  alarm: "alarm",
  uyarı: "alarm",
  uyari: "alarm",
  shield: "shield",
  kalkan: "shield",
  success: "success",
  başarı: "success",
  basari: "success",
  error: "error",
  hata: "error",
  menu: "menu",
  menü: "menu",
  menu_select: "menu",
  door: "door",
  kapı: "door",
  kapi: "door",
  reload: "reload",
  engine: "engine",
  motor: "engine",
  gameover: "gameover",
  kaybet: "gameover",
};

function scorePresetMatch(segment: string, presetId: string, tags: string[]): number {
  const lower = segment.toLowerCase();
  let score = 0;
  if (lower.includes(presetId)) score += 10;
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (lower.includes(t)) score += 5;
    if (t.length > 3 && lower.split(/\s+/).some((w) => w.includes(t) || t.includes(w))) {
      score += 2;
    }
  }
  return score;
}

function resolvePresetForSegment(segment: string): string | undefined {
  const lower = segment.toLowerCase().trim();

  for (const [alias, id] of Object.entries(PRESET_ALIASES)) {
    if (lower.includes(alias)) return id;
  }

  const presets = listPresets();
  let best: { id: string; score: number } | undefined;

  for (const p of presets) {
    const score = scorePresetMatch(segment, p.id, p.tags);
    if (score > 0 && (!best || score > best.score)) {
      best = { id: p.id, score };
    }
  }

  if (best && best.score >= 5) return best.id;

  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  for (const word of words) {
    const matches = findPresetsByTag(word);
    if (matches.length === 1) return matches[0]!.id;
    if (matches.length > 1) {
      const ranked = matches
        .map((m) => ({ id: m.id, score: scorePresetMatch(segment, m.id, m.tags) }))
        .sort((a, b) => b.score - a.score);
      if (ranked[0]!.score > 0) return ranked[0]!.id;
    }
  }

  return best?.id;
}

function mergeDesign(base: SoundDesignInput, patch: Partial<SoundDesignInput>): SoundDesignInput {
  return {
    ...base,
    ...patch,
    master: { ...base.master, ...patch.master },
    fx: { ...base.fx, ...patch.fx },
    texture: { ...base.texture, ...patch.texture },
    params: { ...base.params, ...patch.params },
  };
}

function applyModifierRules(
  text: string,
  base: SoundDesignInput,
  notes: string[],
  prefix = "",
): SoundDesignInput {
  let design: SoundDesignInput = { ...base };

  for (const rule of MODIFIER_RULES) {
    if (!rule.test(text)) continue;
    const patch = rule.apply();
    notes.push(prefix ? `${prefix}${rule.note}` : rule.note);
    design = mergeDesign(design, patch);
  }

  return design;
}

function slugify(segment: string, preset: string, index: number): string {
  const words = segment
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ\s]/gi, "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !Object.keys(PRESET_ALIASES).includes(w))
    .slice(0, 2);
  if (words.length > 0) return words.join("-").replace(/[ğüşıöç]/g, (c) => ({ ğ: "g", ü: "u", ş: "s", ı: "i", ö: "o", ç: "c" })[c] ?? c);
  return index > 0 ? `${preset}-${index + 1}` : preset;
}

/** Parse natural-language SFX description into ready-to-run SoundDesignInput[]. */
export function parseDescription(description: string): DescribeResult {
  const trimmed = description.trim();
  const notes: string[] = [];

  if (/game\s*pack|oyun\s*paket|sfx\s*pack/i.test(trimmed)) {
    notes.push("Matched game pack intent → GAME_PACK_DESIGNS");
    return {
      description: trimmed,
      segments: GAME_PACK_DESIGNS.map((d) => d.name!),
      designs: GAME_PACK_DESIGNS.map((d) => ({ ...d })),
      notes,
    };
  }

  const segments = trimmed.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) {
    throw new Error("Empty description. Example: 'zıplama ve tiz blink'");
  }

  const designs: SoundDesignInput[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const preset = resolvePresetForSegment(segment);

    if (!preset) {
      if (designs.length > 0 && MODIFIER_RULES.some((r) => r.test(segment))) {
        const last = designs[designs.length - 1]!;
        designs[designs.length - 1] = applyModifierRules(segment, last, notes);
        notes.push(`"${segment}" → modifiers applied to ${last.name}`);
        continue;
      }
      notes.push(`Could not match preset for: "${segment}" — skipped`);
      continue;
    }

    let design: SoundDesignInput = {
      name: slugify(segment, preset, i),
      preset,
    };

    const catalog = listPresets().find((p) => p.id === preset);
    if (catalog?.master) design.master = { ...catalog.master };
    if (catalog?.texture) design.texture = { ...catalog.texture };

    design = applyModifierRules(segment, design, notes);
    designs.push(design);
    notes.push(`"${segment}" → preset:${preset}, name:${design.name}`);
  }

  if (designs.length === 0) {
    throw new Error(
      `No presets matched for: "${trimmed}". Try sfx_list_presets or sfx_help.`,
    );
  }

  return { description: trimmed, segments, designs, notes };
}