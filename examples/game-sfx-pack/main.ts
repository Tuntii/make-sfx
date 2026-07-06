import { play } from "make-sfx-core/browser";
import { gameSounds, type GameSoundId } from "./sounds";

const labels: Record<GameSoundId, string> = {
  jump: "Jump / Zıplama",
  blink: "Blink (tiz)",
  coin: "Coin",
  hit: "Hit",
  powerup: "Power Up",
};

const procButtons = document.getElementById("proc-buttons")!;
const wavButtons = document.getElementById("wav-buttons")!;
const codeBlock = document.getElementById("code-block")!;

for (const id of Object.keys(gameSounds) as GameSoundId[]) {
  const procBtn = document.createElement("button");
  procBtn.textContent = labels[id];
  procBtn.onclick = () => play(gameSounds[id]);
  procButtons.appendChild(procBtn);

  const wavBtn = document.createElement("button");
  wavBtn.textContent = `${labels[id]} .wav`;
  wavBtn.onclick = () => {
    const audio = new Audio(`/assets/sfx/${id}.wav`);
    audio.play();
  };
  wavButtons.appendChild(wavBtn);
}

codeBlock.textContent = `import { play } from "make-sfx-core/browser";
import { gameSounds } from "./sounds";

// Procedural — GAME_PACK_DESIGNS = MCP sfx_design_batch
play(gameSounds.jump);
play(gameSounds.blink);

// veya önceden export edilmiş WAV
new Audio("./assets/sfx/jump.wav").play();`;