import { describe, expect, test } from "bun:test";
import { runSimulation } from "../engine/tick-loop.ts";
import type { Trace } from "../engine/types.ts";
import { buildGraph, defaultParams, oracle } from "./dcf.ts";

const collect = async (toTick: number): Promise<Trace> => {
  const trace: Trace = [];
  for await (const snapshot of runSimulation(buildGraph(), { seed: 7, fromTick: 0, toTick })) {
    trace.push(snapshot);
  }
  return trace;
};

const stateOf = (trace: Trace, tick: number, id: string) =>
  trace[tick]!.entities.find((e) => e.id === id)?.state;

describe("dcf fixture", () => {
  test("npv stock matches spreadsheet-style oracle for 10 periods", async () => {
    const trace = await collect(10);
    for (let tick = 1; tick <= 10; tick++) {
      const state = stateOf(trace, tick, "npv");
      if (state?.kind !== "stock") throw new Error(`npv at tick ${tick}: ${JSON.stringify(state)}`);
      const expected = oracle(tick, defaultParams);
      expect(Math.abs(state.value - expected) / expected).toBeLessThan(1e-9);
    }
  });

  test("fcf chain evaluates topologically within a single tick", async () => {
    const trace = await collect(3);
    for (let tick = 0; tick <= 3; tick++) {
      const fcf = stateOf(trace, tick, "fcf");
      if (fcf?.kind !== "variable") throw new Error(`fcf at tick ${tick} not a variable`);
      const expected =
        (defaultParams.baseRevenue - defaultParams.baseOpex) * (1 + defaultParams.growth) ** tick;
      expect(Math.abs(fcf.value - expected)).toBeLessThan(1e-9);
    }
  });
});
