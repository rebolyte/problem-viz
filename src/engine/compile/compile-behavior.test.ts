import { test, expect } from "bun:test";
import { Result } from "better-result";
import { compileNodeBehavior, compileEdgeBehavior } from "./compile-behavior.ts";

test("node: empty source returns ok({})", () => {
  const res = compileNodeBehavior(undefined, "tick");
  expect(Result.isOk(res)).toBe(true);
  if (Result.isOk(res)) expect(res.value).toEqual({});
});

test("node: whitespace-only source returns ok({})", () => {
  const res = compileNodeBehavior("   ", "tick");
  expect(Result.isOk(res)).toBe(true);
});

test("node: valid tick function", () => {
  const source = `defineNode({ tick: ({ state }) => ({ state: (state ?? 0) + 1, outputs: {} }) });`;
  const res = compileNodeBehavior(source, "tick");
  expect(Result.isOk(res)).toBe(true);
  if (!Result.isOk(res)) return;
  expect(typeof res.value.tick).toBe("function");
  const out = res.value.tick!({ state: 0, inputs: {}, config: {}, tick: 0, rand: Math.random });
  expect(out).toEqual({ state: 1, outputs: {} });
});

test("node: valid init function", () => {
  const source = `defineNode({ init: (config) => ({ count: config.start }) });`;
  const res = compileNodeBehavior(source, "tick");
  expect(Result.isOk(res)).toBe(true);
  if (!Result.isOk(res)) return;
  expect(typeof res.value.init).toBe("function");
  expect(res.value.init!({ start: 5 })).toEqual({ count: 5 });
});

test("node: syntax error returns err with compile_failed", () => {
  const res = compileNodeBehavior("defineNode({ tick: (x) => { INVALID SYNTAX } });", "tick");
  expect(Result.isOk(res)).toBe(false);
  if (!Result.isOk(res)) {
    expect(res.error.code).toBe("compile_failed");
    expect(res.error.message.length).toBeGreaterThan(0);
  }
});

test("node: runtime error in factory returns err with compile_failed", () => {
  const res = compileNodeBehavior("throw new Error('boom');", "tick");
  expect(Result.isOk(res)).toBe(false);
  if (!Result.isOk(res)) {
    expect(res.error.code).toBe("compile_failed");
    expect(res.error.message).toContain("boom");
  }
});

test("node: cache hit returns same result reference", () => {
  const source = `defineNode({ init: () => ({}) });`;
  const res1 = compileNodeBehavior(source, "tick");
  const res2 = compileNodeBehavior(source, "tick");
  expect(res1).toBe(res2);
});

test("edge: empty source returns ok({})", () => {
  const res = compileEdgeBehavior(undefined, "flow");
  expect(Result.isOk(res)).toBe(true);
  if (Result.isOk(res)) expect(res.value).toEqual({});
});

test("edge: valid rate function", () => {
  const source = `defineEdge({ rate: ({ source, config }) => source.value * config.rate });`;
  const res = compileEdgeBehavior(source, "flow");
  expect(Result.isOk(res)).toBe(true);
  if (!Result.isOk(res)) return;
  expect(typeof res.value.rate).toBe("function");
  const out = res.value.rate!({
    source: { value: 100 },
    config: { rate: 0.1 },
    tick: 0,
    rand: Math.random,
  });
  expect(out).toBeCloseTo(10);
});

test("edge: syntax error returns err with compile_failed", () => {
  const res = compileEdgeBehavior("defineEdge({ rate: (x) => INVALID SYNTAX });", "flow");
  expect(Result.isOk(res)).toBe(false);
  if (!Result.isOk(res)) {
    expect(res.error.code).toBe("compile_failed");
  }
});

test("node and edge caches are independent (same source, different kinds)", () => {
  const source = `defineNode({}); defineEdge({});`;
  const nodeRes = compileNodeBehavior(source, "tick");
  const edgeRes = compileEdgeBehavior(source, "flow");
  expect(nodeRes).not.toBe(edgeRes);
});
