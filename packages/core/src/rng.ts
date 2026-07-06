/** Pluggable RNG — defaults to Math.random; swap for seed-deterministic renders. */
let rng: () => number = () => Math.random();

export function setRng(fn: () => number): void {
  rng = fn;
}

export function resetRng(): void {
  rng = () => Math.random();
}

export function random(): number {
  return rng();
}

export function withRng<T>(fn: () => number, work: () => T): T {
  setRng(fn);
  try {
    return work();
  } finally {
    resetRng();
  }
}