import { test, expect } from "bun:test";
import { evalFlowRate } from "./flow-edge.ts";
import type { EdgeDef } from "../types.ts";
import type { CompiledEdgeBehavior } from "../compile/compile-behavior.ts";

const makeEdge = (config: Record<string, unknown> = {}): EdgeDef => ({
  id: "e1",
  source: { node: "n1" },
  target: { node: "n2" },
  kind: "flow",
  config,
  meta: {},
});

const noRand = () => 0;

test("compiled rate: source.value * config.annualReturn", () => {
  const compiled: CompiledEdgeBehavior = {
    rate: ({ source, config }) => (source.value as number) * (config.annualReturn as number),
  };
  const result = evalFlowRate(makeEdge({ annualReturn: 0.05 }), compiled, {
    sourceValue: 100,
    tick: 0,
    rand: noRand,
  });
  expect(result.status).toBe("ok");
  if (result.status === "ok") expect(result.value).toBeCloseTo(5);
});

test("no compiled rate, constantRate=2", () => {
  const result = evalFlowRate(
    makeEdge({ constantRate: 2 }),
    {},
    { sourceValue: 0, tick: 0, rand: noRand },
  );
  expect(result.status).toBe("ok");
  if (result.status === "ok") expect(result.value).toBe(2);
});

test("no compiled rate, no config returns 0", () => {
  const result = evalFlowRate(makeEdge(), {}, { sourceValue: 0, tick: 0, rand: noRand });
  expect(result.status).toBe("ok");
  if (result.status === "ok") expect(result.value).toBe(0);
});

test("compiled rate throws returns err flow_rate_threw", () => {
  const compiled: CompiledEdgeBehavior = {
    rate: () => {
      throw new Error("boom");
    },
  };
  const result = evalFlowRate(makeEdge(), compiled, { sourceValue: 0, tick: 0, rand: noRand });
  expect(result.status).toBe("error");
  if (result.status === "error") expect(result.error.code).toBe("flow_rate_threw");
});

test("compiled rate returns NaN returns err flow_rate_nan", () => {
  const compiled: CompiledEdgeBehavior = {
    rate: () => NaN,
  };
  const result = evalFlowRate(makeEdge(), compiled, { sourceValue: 0, tick: 0, rand: noRand });
  expect(result.status).toBe("error");
  if (result.status === "error") expect(result.error.code).toBe("flow_rate_nan");
});
