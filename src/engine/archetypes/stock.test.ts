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
  expect(initStock(makeNode({ initialBalance: 100 }), {}, 0)).toEqual({
    kind: "stock",
    value: 100,
  });
});

test("initStock with missing config defaults to 0", () => {
  expect(initStock(makeNode({}), {}, 0)).toEqual({ kind: "stock", value: 0 });
});

test("S9: initStock with NaN initialBalance is an error state, not 0", () => {
  const state = initStock(makeNode({ initialBalance: NaN }), {}, 0);
  expect(state).toEqual({
    kind: "error",
    archetype: "stock",
    phase: "runtime",
    message: expect.stringContaining("n1"),
    tick: 0,
  });
});

test("D9: init behavior wins over config keys", () => {
  const state = initStock(makeNode({ initialBalance: 5 }), { init: () => 42 }, 0);
  expect(state).toEqual({ kind: "stock", value: 42 });
});

test("D9: schema-declared initial key wins over initialBalance", () => {
  const node = {
    ...makeNode({ startingCash: 300, initialBalance: 5 }),
    schema: { config: {}, initial: "startingCash" },
  };
  expect(initStock(node, {}, 0)).toEqual({ kind: "stock", value: 300 });
});

test("S8: init behavior throwing is a runtime error state", () => {
  const state = initStock(
    makeNode({}),
    {
      init: () => {
        throw new Error("bad init");
      },
    },
    0,
  );
  expect(state.kind).toBe("error");
  if (state.kind === "error") expect(state.message).toContain("bad init");
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
