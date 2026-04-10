import { test, expect } from "bun:test";
import { initTickContext, runTick } from "./tick.ts";
import type { NodeDef } from "../types.ts";
import type { CompiledNodeBehavior } from "../compile/compile-behavior.ts";

const makeNode = (config: Record<string, unknown> = {}): NodeDef => ({
  id: "n1",
  kind: "tick",
  schema: { config: {} },
  config,
  meta: {},
});

const noRand = () => 0;

test("no compiled.tick passes through prevContext with empty outputs", () => {
  const result = runTick(
    makeNode(),
    {},
    { prevContext: { x: 1 }, inputs: {}, tick: 0, rand: noRand },
  );
  expect(result.status).toBe("ok");
  if (result.status === "ok")
    expect(result.value).toEqual({ kind: "tick", context: { x: 1 }, outputs: {} });
});

test("initTickContext with init fn", () => {
  const compiled: CompiledNodeBehavior = {
    init: (config) => ({ count: config.start }),
  };
  const result = initTickContext(makeNode({ start: 3 }), compiled);
  expect(result.status).toBe("ok");
  if (result.status === "ok") expect(result.value).toEqual({ count: 3 });
});

test("initTickContext with no init returns null", () => {
  const result = initTickContext(makeNode(), {});
  expect(result.status).toBe("ok");
  if (result.status === "ok") expect(result.value).toBeNull();
});

test("compiled tick increments state across calls", () => {
  const compiled: CompiledNodeBehavior = {
    tick: ({ state }) => ({ state: ((state as number) ?? 0) + 1, outputs: { out: state } }),
  };
  const first = runTick(makeNode(), compiled, {
    prevContext: null,
    inputs: {},
    tick: 0,
    rand: noRand,
  });
  expect(first.status).toBe("ok");
  if (first.status === "ok")
    expect(first.value).toEqual({ kind: "tick", context: 1, outputs: { out: null } });

  const second = runTick(makeNode(), compiled, {
    prevContext: 1,
    inputs: {},
    tick: 1,
    rand: noRand,
  });
  expect(second.status).toBe("ok");
  if (second.status === "ok")
    expect(second.value).toEqual({ kind: "tick", context: 2, outputs: { out: 1 } });
});

test("compiled tick throws returns err tick_threw", () => {
  const compiled: CompiledNodeBehavior = {
    tick: () => {
      throw new Error("oops");
    },
  };
  const result = runTick(makeNode(), compiled, {
    prevContext: null,
    inputs: {},
    tick: 0,
    rand: noRand,
  });
  expect(result.status).toBe("error");
  if (result.status === "error") expect(result.error.code).toBe("tick_threw");
});

test("initTickContext init throws returns err tick_init_threw", () => {
  const compiled: CompiledNodeBehavior = {
    init: () => {
      throw new Error("bad init");
    },
  };
  const result = initTickContext(makeNode(), compiled);
  expect(result.status).toBe("error");
  if (result.status === "error") expect(result.error.code).toBe("tick_init_threw");
});
