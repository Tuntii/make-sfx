import {
  buildSoundConfig,
  GAME_PACK_DESIGNS,
  type SoundConfig,
} from "@make-sfx/core";

/** Oyun SFX paketi — MCP sfx_design_batch ile aynı tanımlar (GAME_PACK_DESIGNS). */
export const gameSounds = Object.fromEntries(
  GAME_PACK_DESIGNS.map((d) => [d.name, buildSoundConfig(d)]),
) as Record<string, SoundConfig>;

export type GameSoundId = keyof typeof gameSounds;