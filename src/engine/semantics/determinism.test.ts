import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { runSimulation } from "../tick-loop.ts";
import type { GraphDef, RunConfig, Trace } from "../types.ts";
import { arbGraph, arbRunConfig } from "../testing/arbitraries.ts";
import { fcParams } from "../testing/fc.ts";

const collect = async (graph: GraphDef, config: RunConfig): Promise<Trace> => {
  const trace: Trace = [];
  for await (const snapshot of runSimulation(graph, config)) {
    trace.push(snapshot);
  }
  return trace;
};

describe("semantics: determinism", () => {
  test("S1/S7: same graph + seed + config produces an identical trace", async () => {
    await fc.assert(
      fc.asyncProperty(arbGraph, arbRunConfig, async (graph, config) => {
        const first = await collect(graph, config);
        const second = await collect(graph, config);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      }),
      fcParams(),
    );
  });

  test("S1: run over [0, N] emits N+1 snapshots with matching tick fields", async () => {
    await fc.assert(
      fc.asyncProperty(arbGraph, arbRunConfig, async (graph, config) => {
        const trace = await collect(graph, config);
        expect(trace).toHaveLength(config.toTick + 1);
        for (const [index, snapshot] of trace.entries()) {
          expect(snapshot.tick).toBe(index);
        }
      }),
      fcParams(),
    );
  });
});
