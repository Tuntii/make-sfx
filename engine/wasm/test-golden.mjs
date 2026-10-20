// Checks the golden corpus through the JS-facing C ABI of the WASM module.
// usage: node test-golden.mjs <path/to/makesfx.mjs> <path/to/golden.txt>

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [modulePath, goldenPath] = process.argv.slice(2);
if (!modulePath || !goldenPath) {
  console.error("usage: node test-golden.mjs <makesfx.mjs> <golden.txt>");
  process.exit(2);
}

const { default: createMakesfx } = await import(pathToFileURL(modulePath).href);
const m = await createMakesfx();

if (m._msfx_abi_version() !== 1) {
  console.error(`unexpected ABI version ${m._msfx_abi_version()}`);
  process.exit(1);
}

const hexPtr = m._malloc(65);
const signalPtr = m._malloc(32);

function hashOf(signal, freq, rate, seconds) {
  const status =
    signal === "mathgrid"
      ? m._msfx_math_grid_sha256(hexPtr)
      : (m.stringToUTF8(signal, signalPtr, 32), m._msfx_probe_sha256(signalPtr, freq, rate, seconds, hexPtr));
  return status === 0 ? m.UTF8ToString(hexPtr) : `status ${status}`;
}

let failures = 0;
let count = 0;
for (const line of readFileSync(goldenPath, "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  const [name, signal, freq, rate, seconds, expected] = line.trim().split(/\s+/);
  const actual = hashOf(signal, Number(freq), Number(rate), Number(seconds));
  count++;
  if (actual !== expected) {
    failures++;
    console.error(`MISMATCH ${name}: expected ${expected}, actual ${actual}`);
  }
}

m._free(hexPtr);
m._free(signalPtr);
console.log(`wasm golden: ${count} entries, ${failures} mismatched (engine ${m.UTF8ToString(m._msfx_version())})`);
process.exit(failures === 0 && count > 0 ? 0 : 1);
