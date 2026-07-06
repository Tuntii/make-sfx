/** Game SFX loudness categories — single source for presets, MCP, mastering. */
export type SfxCategory = "ui" | "combat" | "pickup" | "ambient" | "stinger";

export interface CategorySpec {
  id: SfxCategory;
  label: string;
  labelTr: string;
  /** Integrated loudness target (LUFS). */
  targetLufs: number;
  description: string;
}

export const SFX_CATEGORIES: CategorySpec[] = [
  {
    id: "ui",
    label: "UI",
    labelTr: "Arayüz",
    targetLufs: -14,
    description: "Clicks, blinks, menu ticks — sit under music.",
  },
  {
    id: "combat",
    label: "Combat",
    labelTr: "Savaş",
    targetLufs: -9,
    description: "Hits, jumps, lasers — punch through mix.",
  },
  {
    id: "pickup",
    label: "Pickup",
    labelTr: "Toplama",
    targetLufs: -12,
    description: "Coins, collectibles — bright but not harsh.",
  },
  {
    id: "ambient",
    label: "Ambient",
    labelTr: "Ortam",
    targetLufs: -18,
    description: "Footsteps, swoosh, engine — background layer.",
  },
  {
    id: "stinger",
    label: "Stinger",
    labelTr: "Vurgu",
    targetLufs: -11,
    description: "Game over, alarms, powerups — emotional accent.",
  },
];

export const PRESET_CATEGORY_MAP: Record<string, SfxCategory> = {
  jump: "combat",
  blink: "ui",
  coin: "pickup",
  hit: "combat",
  explosion: "combat",
  click: "ui",
  powerup: "stinger",
  gameover: "stinger",
  laser: "combat",
  swoosh: "ambient",
  footstep: "ambient",
  alarm: "stinger",
  shield: "combat",
  success: "ui",
  error: "ui",
  menu: "ui",
  door: "ambient",
  reload: "combat",
  engine: "ambient",
};

export function getCategorySpec(category: SfxCategory): CategorySpec {
  const spec = SFX_CATEGORIES.find((c) => c.id === category);
  if (!spec) throw new Error(`Unknown category: ${category}`);
  return spec;
}

export function getPresetCategory(presetId: string): SfxCategory {
  return PRESET_CATEGORY_MAP[presetId] ?? "ui";
}

export function getTargetLufs(category: SfxCategory): number {
  return getCategorySpec(category).targetLufs;
}