import { WASM_BASE64 } from "./generated/wasm-binary.js";

/**
 * Loader and call bridge for the C++ engine (makesfx.wasm, built from engine/).
 * Every DSP function of this package runs through `callEngine`.
 *
 * The module compiles synchronously on first use (Node, workers and browser
 * main threads alike; it is far below Chrome's 8 MB synchronous limit). In a
 * page, `await init()` at startup compiles it off the critical path instead,
 * so the first play() does not stall.
 */

export interface EngineDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  /** JSON Pointer into the config (`/params/frequency`), or `options:/…` for call options. */
  path: string;
  message: string;
  hint?: string;
}

/** Thrown when the engine rejects a config or call; `diagnostics` lists every problem. */
export class MakeSfxError extends Error {
  readonly diagnostics: EngineDiagnostic[];

  constructor(operation: string, diagnostics: EngineDiagnostic[]) {
    const problems = diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => `${d.code}${d.path ? ` at ${d.path}` : ""}: ${d.message}${d.hint ? ` (${d.hint})` : ""}`);
    super(`make-sfx ${operation}: ${problems.join("; ") || "engine call failed"}`);
    this.name = "MakeSfxError";
    this.diagnostics = diagnostics;
  }
}

interface EngineExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  msfx_version(): number;
  msfxw_alloc(size: number): number;
  msfxw_free(ptr: number): void;
  msfxw_call(
    op: number,
    opLen: number,
    config: number,
    configLen: number,
    options: number,
    optionsLen: number,
    in0: number,
    n0: number,
    in1: number,
    n1: number,
  ): number;
  msfxw_ok(call: number): number;
  msfxw_diagnostics(call: number): number;
  msfxw_buffer_count(call: number): number;
  msfxw_buffer_data(call: number, index: number): number;
  msfxw_buffer_length(call: number, index: number): number;
  msfxw_bytes_data(call: number): number;
  msfxw_bytes_length(call: number): number;
  msfxw_json(call: number): number;
  msfxw_number(call: number): number;
  msfxw_release(call: number): void;
}

let engine: EngineExports | undefined;
let loading: Promise<void> | undefined;

function wasmBytes(): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== "undefined") {
    const b = Buffer.from(WASM_BASE64, "base64");
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength) as Uint8Array<ArrayBuffer>;
  }
  const text = atob(WASM_BASE64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function instantiate(module: WebAssembly.Module): void {
  const instance = new WebAssembly.Instance(module, {
    env: { emscripten_notify_memory_growth() {} },
  });
  const exports = instance.exports as unknown as EngineExports;
  exports._initialize();
  engine = exports;
}

/** Loads the engine asynchronously; optional, since first use loads it synchronously. */
export function init(): Promise<void> {
  if (engine) return Promise.resolve();
  loading ??= WebAssembly.compile(wasmBytes()).then((module) => {
    if (!engine) instantiate(module);  // a synchronous first use may have won the race
  });
  return loading;
}

/** True once the engine is loaded (always true after the first render in Node). */
export function isReady(): boolean {
  return engine !== undefined;
}

function loaded(): EngineExports {
  if (engine) return engine;
  try {
    instantiate(new WebAssembly.Module(wasmBytes()));
  } catch (cause) {
    throw new Error(
      "make-sfx: the audio engine is not loaded yet. Call `await init()` (from make-sfx-core) once before rendering.",
      { cause },
    );
  }
  return engine!;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function readString(e: EngineExports, ptr: number): string {
  const heap = new Uint8Array(e.memory.buffer);
  let end = ptr >>> 0;
  while (heap[end] !== 0) end++;
  return decoder.decode(heap.subarray(ptr >>> 0, end));
}

function copyIn(e: EngineExports, data: Uint8Array | Float32Array | undefined): number {
  if (!data || data.length === 0) return 0;
  const ptr = e.msfxw_alloc(data.byteLength) >>> 0;
  // A fresh view per copy: allocation may have grown (and replaced) the buffer.
  new Uint8Array(e.memory.buffer, ptr, data.byteLength).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
  return ptr;
}

export interface EngineResult {
  buffers: Float32Array[];
  bytes?: Uint8Array;
  json?: string;
  number: number;
}

/** Engine call options; keys match the C++ bridge (snake_case). */
export interface EngineOptions {
  seed?: number;
  category?: string;
  preset_id?: string;
  normalize?: boolean;
  sample_rate?: number;
  factor?: number;
  ceiling_dbtp?: number;
  tolerance_lufs?: number;
  gain?: number;
}

/**
 * Runs one pipeline stage in the engine (engine/src/legacy/bridge.hpp).
 * `config` is SoundConfig-shaped JSON holding the blocks the stage reads.
 */
export function callEngine(
  op: string,
  config?: object,
  options?: EngineOptions,
  in0?: Float32Array,
  in1?: Float32Array,
): EngineResult {
  const e = loaded();
  const opBytes = encoder.encode(op);
  const configBytes = config ? encoder.encode(JSON.stringify(config)) : undefined;
  const optionBytes = options ? encoder.encode(JSON.stringify(options)) : undefined;

  const pointers = [
    copyIn(e, opBytes),
    copyIn(e, configBytes),
    copyIn(e, optionBytes),
    copyIn(e, in0),
    copyIn(e, in1),
  ];
  let call: number;
  try {
    call = e.msfxw_call(
      pointers[0]!,
      opBytes.length,
      pointers[1]!,
      configBytes?.length ?? 0,
      pointers[2]!,
      optionBytes?.length ?? 0,
      pointers[3]!,
      in0?.length ?? 0,
      pointers[4]!,
      in1?.length ?? 0,
    );
  } finally {
    for (const ptr of pointers) if (ptr) e.msfxw_free(ptr);
  }

  try {
    if (!e.msfxw_ok(call)) {
      throw new MakeSfxError(op, JSON.parse(readString(e, e.msfxw_diagnostics(call))) as EngineDiagnostic[]);
    }
    const buffers: Float32Array[] = [];
    const count = e.msfxw_buffer_count(call);
    for (let i = 0; i < count; i++) {
      const length = e.msfxw_buffer_length(call, i);
      const ptr = e.msfxw_buffer_data(call, i) >>> 0;
      buffers.push(length ? new Float32Array(e.memory.buffer, ptr, length).slice() : new Float32Array(0));
    }
    const byteLength = e.msfxw_bytes_length(call);
    const bytes = byteLength
      ? new Uint8Array(e.memory.buffer, e.msfxw_bytes_data(call) >>> 0, byteLength).slice()
      : undefined;
    const json = readString(e, e.msfxw_json(call));
    return { buffers, bytes, json: json || undefined, number: e.msfxw_number(call) };
  } finally {
    e.msfxw_release(call);
  }
}

/** Engine version string, e.g. "2.0.0". */
export function engineVersion(): string {
  const e = loaded();
  return readString(e, e.msfx_version());
}
