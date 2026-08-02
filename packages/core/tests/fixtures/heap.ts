/**
 * Heap measurement for the allocation tests.
 *
 * `packages/core` deliberately compiles with `types: []` so that neither Node
 * nor DOM globals are reachable from the pure core (Principle VI). The
 * allocation tests genuinely need one Node API, so it is declared locally here
 * rather than by widening the whole package's global surface.
 */

declare const process: { memoryUsage(): { heapUsed: number } };

export function heapUsed(): number {
  return process.memoryUsage().heapUsed;
}
