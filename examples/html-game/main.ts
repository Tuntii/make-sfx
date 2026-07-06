import { play, modify, presets } from "@make-sfx/core/browser";

const player = document.getElementById("player")!;
const jumpSound = presets.jump;
const blinkSound = modify(presets.blink, { pitchShift: 1.5 });

function doJump() {
  player.classList.add("jump");
  play(jumpSound);
  setTimeout(() => player.classList.remove("jump"), 350);
}

function doBlink() {
  play(blinkSound);
}

document.getElementById("jump-btn")!.onclick = doJump;
document.getElementById("click-btn")!.onclick = doBlink;

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    doJump();
  }
});