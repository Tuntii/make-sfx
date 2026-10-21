// Checks the golden corpus through the JS-facing C ABI of makesfx.wasm, the
// same standalone module make-sfx-core ships.
// usage: node test-golden.mjs <path/to/makesfx.wasm> <path/to/golden.txt>

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [wasmPath, goldenPath] = process.argv.slice(2);
if (!wasmPath || !goldenPath) {
  console.error("usage: node test-golden.mjs <makesfx.wasm> <golden.txt>");
  process.exit(2);
}

const instance = new WebAssembly.Instance(new WebAssembly.Module(readFileSync(wasmPath)), {
  env: { emscripten_notify_memory_growth() {} },
});
const m = instance.exports;
m._initialize();

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

function UTF8ToString(ptr) {
  const heap = new Uint8Array(m.memory.buffer);
  let end = ptr;
  while (heap[end] !== 0) end++;
  return fromUtf8.decode(heap.subarray(ptr, end));
}

if (m.msfx_abi_version() !== 1) {
  console.error(`unexpected ABI version ${m.msfx_abi_version()}`);
  process.exit(1);
}

function withString(text, fn) {
  const bytes = utf8.encode(text);
  const ptr = m.msfxw_alloc(bytes.length + 1);
  const heap = new Uint8Array(m.memory.buffer);
  heap.set(bytes, ptr);
  heap[ptr + bytes.length] = 0;
  try {
    return fn(ptr, bytes.length);
  } finally {
    m.msfxw_free(ptr);
  }
}

function hexOf(call) {
  const hexPtr = m.msfxw_alloc(65);
  try {
    const status = call(hexPtr);
    return status === 0 ? UTF8ToString(hexPtr) : `status ${status}`;
  } finally {
    m.msfxw_free(hexPtr);
  }
}

const readPointer = (ptr) => new Uint32Array(m.memory.buffer, ptr, 1)[0];

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
      const outPtr = m.msfxw_alloc(4);
      const diagPtr = m.msfxw_alloc(4);
      try {
        const status = m.msfx_legacy_render(cfgPtr, cfgLen, optPtr, outPtr, diagPtr);
        if (status !== 0) return `status ${status}: ${UTF8ToString(readPointer(diagPtr))}`;
        const render = readPointer(outPtr);
        const report = JSON.parse(UTF8ToString(m.msfx_render_report(render)));
        m.msfx_render_free(render);
        return report.pcm_sha256;
      } finally {
        m.msfxw_free(outPtr);
        m.msfxw_free(diagPtr);
      }
    }),
  );
}

// Copies `bytes` into WASM memory for the call, then frees it.
function withBytes(bytes, fn) {
  const ptr = m.msfxw_alloc(bytes.length);
  new Uint8Array(m.memory.buffer).set(bytes, ptr);
  try {
    return fn(ptr, bytes.length);
  } finally {
    m.msfxw_free(ptr);
  }
}

// Mirrors edit::clipsSha256(): every clip in order, interleaved float32 LE.
function editHash(wavPath, programPath) {
  const wav = readFileSync(wavPath);
  const program = readFileSync(programPath, "utf8");
  return withString("editAudio", (opPtr, opLen) =>
    withString(program, (cfgPtr, cfgLen) =>
      withBytes(wav, (wavPtr, wavLen) => {
        const call = m.msfxw_call(opPtr, opLen, cfgPtr, cfgLen, 0, 0, 0, 0, 0, 0, wavPtr, wavLen);
        try {
          if (!m.msfxw_ok(call)) return `error ${UTF8ToString(m.msfxw_diagnostics(call))}`;
          const { clips } = JSON.parse(UTF8ToString(m.msfxw_json(call)));
          const hash = createHash("sha256");
          let buffer = 0;
          for (const clip of clips) {
            const channels = [];
            for (let c = 0; c < clip.channels; c++, buffer++) {
              const ptr = m.msfxw_buffer_data(call, buffer);
              channels.push(new Float32Array(m.memory.buffer, ptr, m.msfxw_buffer_length(call, buffer)));
            }
            const interleaved = new Float32Array(clip.frames * clip.channels);
            for (let i = 0; i < clip.frames; i++) {
              for (let c = 0; c < clip.channels; c++) interleaved[i * clip.channels + c] = channels[c][i];
            }
            hash.update(new Uint8Array(interleaved.buffer));  // all supported hosts are little-endian
          }
          return hash.digest("hex");
        } finally {
          m.msfxw_release(call);
        }
      }),
    ),
  );
}

function hashOf(kind, a1, a2, a3) {
  if (kind === "mathgrid") return hexOf((hex) => m.msfx_math_grid_sha256(hex));
  if (kind === "legacy") return legacyHash(join(dirname(goldenPath), a1), a2, a3);
  if (kind === "edit") return editHash(join(dirname(goldenPath), a1), join(dirname(goldenPath), a2));
  return withString(kind, (signal) =>
    hexOf((hex) => m.msfx_probe_sha256(signal, Number(a1), Number(a2), Number(a3), hex)),
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

console.log(`wasm golden: ${count} entries, ${failures} mismatched (engine ${UTF8ToString(m.msfx_version())})`);
process.exit(failures === 0 && count > 0 ? 0 : 1);
