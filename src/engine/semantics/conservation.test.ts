import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { runSimulation } from "../tick-loop.ts";
import type { GraphDef, RunConfig, Trace } from "../types.ts";
import { arbConservingGraph, arbRunConfig } from "../testing/arbitraries.ts";
import { fcParams } from "../testing/fc.ts";

const collect = async (graph: GraphDef, config: RunConfig): Promise<Trace> => {
  const trace: Trace = [];
  for await (const snapshot of runSimulation(graph, config)) {
    trace.push(snapshot);
  }
  return trace;
};

const stockSum = (trace: Trace, tick: number): number =>
  trace[tick]!.entities.reduce(
    (sum, e) => (e.state.kind === "stock" ? sum + e.state.value : sum),
    0,
  );

describe("semantics: flow conservation", () => {
  test("S10: stock→stock flows conserve total stock value across ticks", async () => {
    await fc.assert(
      fc.asyncProperty(arbConservingGraph, arbRunConfig, async (graph, config) => {
        const trace = await collect(graph, config);
        const initial = stockSum(trace, 0);
        for (let tick = 1; tick <= config.toTick; tick++) {
          for (const entity of trace[tick]!.entities) {
            expect(entity.state.kind).not.toBe("error");
          }
          expect(Math.abs(stockSum(trace, tick) - initial)).toBeLessThan(1e-6);
        }
      }),
      fcParams(),
    );
  });
});
