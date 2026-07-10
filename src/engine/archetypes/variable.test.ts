import { test, expect } from "bun:test";
import { runVariable } from "./variable.ts";
import type { NodeDef } from "../types.ts";

const makeNode = (config: Record<string, unknown>): NodeDef => ({
  id: "n1",
  kind: "variable",
  schema: { config: {} },
  config,
  meta: {},
});

test("amount=5 returns value 5", () => {
  expect(runVariable(makeNode({ amount: 5 }), 0)).toEqual({ kind: "variable", value: 5 });
});

test("missing amount defaults to 0", () => {
  expect(runVariable(makeNode({}), 0)).toEqual({ kind: "variable", value: 0 });
});

test("string amount is coerced", () => {
  expect(runVariable(makeNode({ amount: "7" }), 0)).toEqual({ kind: "variable", value: 7 });
});

test("S9: NaN amount is an error state, not 0", () => {
  const state = runVariable(makeNode({ amount: NaN }), 3);
  expect(state).toEqual({
    kind: "error",
    archetype: "variable",
    phase: "runtime",
    message: expect.stringContaining("n1"),
    tick: 3,
  });
});

test("S9: garbage string amount is an error state, not 0", () => {
  expect(runVariable(makeNode({ amount: "abc" }), 0).kind).toBe("error");
});
