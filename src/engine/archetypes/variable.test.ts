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

const ctx = (tick = 0) => ({ inputs: {}, tick, rand: () => 0.5 });

test("amount=5 returns value 5", () => {
  expect(runVariable(makeNode({ amount: 5 }), {}, ctx())).toEqual({ kind: "variable", value: 5 });
});

test("missing amount defaults to 0", () => {
  expect(runVariable(makeNode({}), {}, ctx())).toEqual({ kind: "variable", value: 0 });
});

test("string amount is coerced", () => {
  expect(runVariable(makeNode({ amount: "7" }), {}, ctx())).toEqual({ kind: "variable", value: 7 });
});

test("S9: NaN amount is an error state, not 0", () => {
  const state = runVariable(makeNode({ amount: NaN }), {}, ctx(3));
  expect(state).toEqual({
    kind: "error",
    archetype: "variable",
    phase: "runtime",
    message: expect.stringContaining("n1"),
    tick: 3,
  });
});

test("S9: garbage string amount is an error state, not 0", () => {
  expect(runVariable(makeNode({ amount: "abc" }), {}, ctx()).kind).toBe("error");
});

test("value() behavior computes from inputs", () => {
  const compiled = {
    value: ({ inputs }: { inputs: Record<string, unknown> }) => Number(inputs.a) * 2,
  };
  const state = runVariable(makeNode({}), compiled, {
    inputs: { a: 21 },
    tick: 0,
    rand: () => 0.5,
  });
  expect(state).toEqual({ kind: "variable", value: 42 });
});

test("S9: value() returning NaN is an error state", () => {
  const compiled = { value: () => NaN };
  expect(runVariable(makeNode({}), compiled, ctx(2))).toEqual({
    kind: "error",
    archetype: "variable",
    phase: "runtime",
    message: expect.stringContaining("n1"),
    tick: 2,
  });
});

test("S8: value() throwing is a runtime error state", () => {
  const compiled = {
    value: () => {
      throw new Error("boom");
    },
  };
  const state = runVariable(makeNode({}), compiled, ctx(1));
  expect(state.kind).toBe("error");
  if (state.kind === "error") expect(state.message).toContain("boom");
});
