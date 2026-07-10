import { test, expect } from "bun:test";
import { initStock, integrateStock } from "./stock.ts";
import type { NodeDef } from "../types.ts";

const makeNode = (config: Record<string, unknown>): NodeDef => ({
  id: "n1",
  kind: "stock",
  schema: { config: {} },
  config,
  meta: {},
});

const meta = { nodeId: "n1", tick: 1 };

test("initStock with initialBalance=100", () => {
  expect(initStock(makeNode({ initialBalance: 100 }), 0)).toEqual({ kind: "stock", value: 100 });
});

test("initStock with missing config defaults to 0", () => {
  expect(initStock(makeNode({}), 0)).toEqual({ kind: "stock", value: 0 });
});

test("S9: initStock with NaN initialBalance is an error state, not 0", () => {
  const state = initStock(makeNode({ initialBalance: NaN }), 0);
  expect(state).toEqual({
    kind: "error",
    archetype: "stock",
    phase: "runtime",
    message: expect.stringContaining("n1"),
    tick: 0,
  });
});

test("integrateStock with inflows and outflows", () => {
  expect(integrateStock({ kind: "stock", value: 100 }, [10, 5], [3], meta)).toEqual({
    kind: "stock",
    value: 112,
  });
});

test("integrateStock with no flows", () => {
  expect(integrateStock({ kind: "stock", value: 100 }, [], [], meta)).toEqual({
    kind: "stock",
    value: 100,
  });
});

test("S9: integrateStock with NaN inflow is an error state, not a skipped flow", () => {
  const state = integrateStock({ kind: "stock", value: 100 }, [NaN, 5], [], meta);
  expect(state).toEqual({
    kind: "error",
    archetype: "stock",
    phase: "runtime",
    message: expect.stringContaining("n1"),
    tick: 1,
  });
});
