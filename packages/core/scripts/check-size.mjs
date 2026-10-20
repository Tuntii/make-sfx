// Package size budget (spec §19, M2). Run after `pnpm build`; fails when the
// engine or the published tarball grows past its budget.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KiB = 1024;
const BUDGET = {
  wasmRaw: 512 * KiB,
  wasmGzip: 192 * KiB,
  tarball: 320 * KiB,
};

const wasm = readFileSync(join(root, "wasm", "makesfx.wasm"));
const pack = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" }),
)[0];

const rows = [
  ["makesfx.wasm", wasm.length, BUDGET.wasmRaw],
  ["makesfx.wasm (gzip -9)", gzipSync(wasm, { level: 9 }).length, BUDGET.wasmGzip],
  ["npm tarball", pack.size, BUDGET.tarball],
];
let over = 0;
for (const [name, size, budget] of rows) {
  const ok = size <= budget;
  if (!ok) over++;
  console.log(`${ok ? "ok  " : "OVER"} ${name.padEnd(24)} ${(size / KiB).toFixed(1).padStart(7)} KiB / ${budget / KiB} KiB`);
}
process.exit(over ? 1 : 0);
