import { describe, expect, test } from "bun:test";
import { runSimulation } from "../engine/tick-loop.ts";
import type { Trace } from "../engine/types.ts";
import { buildGraph, defaultParams, oracle } from "./compound-interest.ts";

const collect = async (graph: ReturnType<typeof buildGraph>, toTick: number): Promise<Trace> => {
  const trace: Trace = [];
  for await (const snapshot of runSimulation(graph, { seed: 42, fromTick: 0, toTick })) {
    trace.push(snapshot);
  }
  return trace;
};

const stockValue = (trace: Trace, tick: number): number => {
  const entity = trace[tick]!.entities.find((e) => e.id === "balance");
  if (entity?.state.kind !== "stock") throw new Error("balance is not a stock");
  return entity.state.value;
};

describe("compound-interest fixture", () => {
  test("matches P(1+r)^t oracle for 20 ticks", async () => {
    const trace = await collect(buildGraph(), 20);
    expect(trace).toHaveLength(21);
    for (let tick = 0; tick <= 20; tick++) {
      const expected = oracle(tick, defaultParams);
      expect(Math.abs(stockValue(trace, tick) - expected) / expected).toBeLessThan(1e-9);
    }
  });

  test("matches oracle for non-default params", async () => {
    const params = { principal: 250, rate: 0.03 };
    const trace = await collect(buildGraph(params), 10);
    for (let tick = 0; tick <= 10; tick++) {
      const expected = oracle(tick, params);
      expect(Math.abs(stockValue(trace, tick) - expected) / expected).toBeLessThan(1e-9);
    }
  });
});
