import { describe, expect, test } from "bun:test";
import { runSimulation } from "../engine/tick-loop.ts";
import type { Trace } from "../engine/types.ts";
import { buildGraph, defaultParams, oracle } from "./fire.ts";

const collect = async (toTick: number): Promise<Trace> => {
  const trace: Trace = [];
  for await (const snapshot of runSimulation(buildGraph(), { seed: 42, fromTick: 0, toTick })) {
    trace.push(snapshot);
  }
  return trace;
};

const savingsAt = (trace: Trace, tick: number): number => {
  const entity = trace[tick]!.entities.find((e) => e.id === "savings");
  if (entity?.state.kind !== "stock") {
    throw new Error(`savings at tick ${tick}: ${JSON.stringify(entity?.state)}`);
  }
  return entity.state.value;
};

describe("fire fixture", () => {
  test("savings matches closed-form annuity accumulation for 30 ticks", async () => {
    const trace = await collect(30);
    for (let tick = 0; tick <= 30; tick++) {
      const expected = oracle(tick, defaultParams);
      expect(Math.abs(savingsAt(trace, tick) - expected) / expected).toBeLessThan(1e-9);
    }
  });

  test("derived net variable evaluates to salary minus expenses every tick", async () => {
    const trace = await collect(5);
    for (const snapshot of trace) {
      const net = snapshot.entities.find((e) => e.id === "net");
      expect(net?.state).toEqual({
        kind: "variable",
        value: defaultParams.salary - defaultParams.expenses,
      });
    }
  });
});
