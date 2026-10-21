// Browser smoke test for the GitHub Pages demo. Serves dist/ under VITE_BASE
// (as Pages does) and drives the installed Chrome:
//
//   - the page loads without errors
//   - every procedural button renders a non-silent sound through the WASM engine
//   - every WAV button's file is served and is a RIFF/WAVE file
//
// usage: VITE_BASE=/make-sfx/ pnpm build && VITE_BASE=/make-sfx/ node smoke.mjs
// Chrome is found via CHROME_PATH or the usual install locations.

import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { preview } from "vite";

const base = process.env.VITE_BASE ?? "/";
const chromePath =
  process.env.CHROME_PATH ??
  [
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => existsSync(p));
if (!chromePath) {
  console.error("smoke: Chrome not found; set CHROME_PATH");
  process.exit(2);
}

const server = await preview({ base, preview: { port: 4317, strictPort: true }, logLevel: "warn" });
const url = `http://localhost:4317${base}`;
const browser = await chromium.launch({ executablePath: chromePath, args: ["--autoplay-policy=no-user-gesture-required"] });
const failures = [];
const fail = (message) => failures.push(message);

try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => fail(`page error: ${err.message}`));
  // Failed page requests are reported with their URL by the response handler.
  // Their console echo is skipped, as is Chrome's own /favicon.ico request,
  // which logs a 404 but is not a request of the page.
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) fail(`console error: ${msg.text()}`);
  });
  page.on("response", (r) => r.status() >= 400 && fail(`${r.status()} ${r.url()}`));

  // Record what reaches the speakers instead of relying on audio output.
  await page.addInitScript(() => {
    window.__played = [];
    window.__media = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const data = this.buffer?.getChannelData(0) ?? new Float32Array(0);
      let peak = 0;
      for (const s of data) peak = Math.max(peak, Math.abs(s));
      window.__played.push({ length: data.length, peak });
      return start.apply(this, args);
    };
    HTMLMediaElement.prototype.play = function () {
      window.__media.push(this.src);
      return Promise.resolve();
    };
  });

  const response = await page.goto(url);
  if (!response?.ok()) fail(`GET ${url}: ${response?.status()}`);

  const procedural = page.locator("#proc-buttons button");
  const wavs = page.locator("#wav-buttons button");
  await procedural.first().waitFor();
  const count = await procedural.count();
  if (count === 0) fail("no procedural buttons");
  if ((await wavs.count()) !== count) fail(`${count} procedural but ${await wavs.count()} WAV buttons`);

  for (let i = 0; i < count; i++) {
    const label = await procedural.nth(i).textContent();
    await procedural.nth(i).click();
    const played = await page.evaluate((n) => window.__played[n], i);
    if (!played) fail(`${label}: nothing played`);
    else if (played.length < 1000 || played.peak < 0.01) fail(`${label}: silent render (${JSON.stringify(played)})`);
    else console.log(`ok  procedural ${label}: ${played.length} samples, peak ${played.peak.toFixed(2)}`);
  }

  for (let i = 0; i < count; i++) await wavs.nth(i).click();
  const sources = await page.evaluate(() => window.__media);
  for (const src of sources) {
    const head = await page.evaluate(async (s) => {
      const r = await fetch(s);
      const bytes = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, magic: String.fromCharCode(...bytes.slice(0, 4), ...bytes.slice(8, 12)), size: bytes.length };
    }, src);
    if (head.status !== 200 || head.magic !== "RIFFWAVE") fail(`${src}: ${JSON.stringify(head)}`);
    else console.log(`ok  wav ${new URL(src).pathname} (${head.size} bytes)`);
  }
  if (sources.length !== count) fail(`${sources.length} of ${count} WAV buttons played a file`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`smoke: ${url} ok`);
