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
  expect(runVariable(makeNode({ amount: 5 }))).toEqual({ kind: "variable", value: 5 });
});

test("missing amount returns value 0", () => {
  expect(runVariable(makeNode({}))).toEqual({ kind: "variable", value: 0 });
});

test("string amount is coerced", () => {
  expect(runVariable(makeNode({ amount: "7" }))).toEqual({ kind: "variable", value: 7 });
});

test("NaN amount returns 0", () => {
  expect(runVariable(makeNode({ amount: NaN }))).toEqual({ kind: "variable", value: 0 });
});

test("garbage string returns 0", () => {
  expect(runVariable(makeNode({ amount: "abc" }))).toEqual({ kind: "variable", value: 0 });
});
