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

test("initStock with initialBalance=100", () => {
  expect(initStock(makeNode({ initialBalance: 100 }))).toEqual({ kind: "stock", value: 100 });
});

test("initStock with missing config", () => {
  expect(initStock(makeNode({}))).toEqual({ kind: "stock", value: 0 });
});

test("initStock with NaN initialBalance", () => {
  expect(initStock(makeNode({ initialBalance: NaN }))).toEqual({ kind: "stock", value: 0 });
});

test("integrateStock with inflows and outflows", () => {
  expect(integrateStock({ kind: "stock", value: 100 }, [10, 5], [3])).toEqual({
    kind: "stock",
    value: 112,
  });
});

test("integrateStock with no flows", () => {
  expect(integrateStock({ kind: "stock", value: 100 }, [], [])).toEqual({
    kind: "stock",
    value: 100,
  });
});

test("integrateStock ignores NaN inflows", () => {
  expect(integrateStock({ kind: "stock", value: 100 }, [NaN, 5], [])).toEqual({
    kind: "stock",
    value: 105,
  });
});
