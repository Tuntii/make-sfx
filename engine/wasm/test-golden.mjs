// Checks the golden corpus through the JS-facing C ABI of the WASM module.
// usage: node test-golden.mjs <path/to/makesfx.mjs> <path/to/golden.txt>

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

function withString(text, fn) {
  const size = m.lengthBytesUTF8(text) + 1;
  const ptr = m._malloc(size);
  m.stringToUTF8(text, ptr, size);
  try {
    return fn(ptr, size - 1);
  } finally {
    m._free(ptr);
  }
}

function hexOf(call) {
  const hexPtr = m._malloc(65);
  try {
    const status = call(hexPtr);
    return status === 0 ? m.UTF8ToString(hexPtr) : `status ${status}`;
  } finally {
    m._free(hexPtr);
  }
}

// Mirrors golden::legacyOptionsJson() in src/golden/golden_file.cpp.
function legacyOptions(seed, category) {
  const parts = [];
  if (seed !== "-") parts.push(`"seed":${seed}`);
  if (category !== "-") parts.push(`"category":"${category}"`);
  return `{${parts.join(",")}}`;
}

function legacyHash(configPath, seed, category) {
  const config = readFileSync(configPath, "utf8");
  return withString(config, (cfgPtr, cfgLen) =>
    withString(legacyOptions(seed, category), (optPtr) => {
      const outPtr = m._malloc(4);
      const diagPtr = m._malloc(4);
      try {
        const status = m._msfx_legacy_render(cfgPtr, cfgLen, optPtr, outPtr, diagPtr);
        if (status !== 0) return `status ${status}: ${m.UTF8ToString(m.getValue(diagPtr, "i32"))}`;
        const render = m.getValue(outPtr, "i32");
        const report = JSON.parse(m.UTF8ToString(m._msfx_render_report(render)));
        m._msfx_render_free(render);
        return report.pcm_sha256;
      } finally {
        m._free(outPtr);
        m._free(diagPtr);
      }
    }),
  );
}

function hashOf(kind, a1, a2, a3) {
  if (kind === "mathgrid") return hexOf((hex) => m._msfx_math_grid_sha256(hex));
  if (kind === "legacy") return legacyHash(join(dirname(goldenPath), a1), a2, a3);
  return withString(kind, (signal) =>
    hexOf((hex) => m._msfx_probe_sha256(signal, Number(a1), Number(a2), Number(a3), hex)),
  );
}

let failures = 0;
let count = 0;
for (const line of readFileSync(goldenPath, "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  const [name, kind, a1, a2, a3, expected] = line.trim().split(/\s+/);
  const actual = hashOf(kind, a1, a2, a3);
  count++;
  if (actual !== expected) {
    failures++;
    console.error(`MISMATCH ${name}: expected ${expected}, actual ${actual}`);
  }
}

console.log(`wasm golden: ${count} entries, ${failures} mismatched (engine ${m.UTF8ToString(m._msfx_version())})`);
process.exit(failures === 0 && count > 0 ? 0 : 1);
