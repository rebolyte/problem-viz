import { Result } from "better-result";
import type { NodeKind, EdgeKind } from "../types.ts";
import type { LoomError } from "../errors.ts";
import { loomError } from "../errors.ts";
import { hash } from "./hash.ts";

export type TickCtx = {
  state: unknown;
  inputs: Record<string, unknown>;
  config: Record<string, unknown>;
  tick: number;
  rand: () => number;
};

export type CompiledNodeBehavior = {
  init?: (config: Record<string, unknown>) => unknown;
  tick?: (ctx: TickCtx) => { state: unknown; outputs: Record<string, unknown> };
};

export type FlowRateCtx = {
  source: { value: number };
  config: Record<string, unknown>;
  tick: number;
  rand: () => number;
};

export type CompiledEdgeBehavior = {
  rate?: (ctx: FlowRateCtx) => number;
};

const unavailable = (name: string) =>
  function unavailableCapability(): never {
    throw new Error(`${name} is unavailable in behaviors: use rand from context`);
  };

const mathShadow = Object.freeze(
  Object.defineProperties(
    {},
    {
      ...Object.getOwnPropertyDescriptors(Math),
      random: { value: unavailable("Math.random") },
    },
  ),
);

const dateShadow = Object.assign(unavailable("Date"), { now: unavailable("Date.now") });

const performanceShadow = Object.freeze({ now: unavailable("performance.now") });

const cryptoShadow = Object.freeze({
  getRandomValues: unavailable("crypto.getRandomValues"),
  randomUUID: unavailable("crypto.randomUUID"),
});

const SHADOW_PARAMS = ["Math", "Date", "performance", "crypto"] as const;
const SHADOW_VALUES = [mathShadow, dateShadow, performanceShadow, cryptoShadow];

const nodeCache = new Map<number, Result<CompiledNodeBehavior, LoomError>>();
const edgeCache = new Map<number, Result<CompiledEdgeBehavior, LoomError>>();

export const compileNodeBehavior = (
  source: string | undefined,
  kind: NodeKind,
): Result<CompiledNodeBehavior, LoomError> => {
  if (!source || source.trim() === "") return Result.ok({});
  const key = hash(source + kind);
  const cached = nodeCache.get(key);
  if (cached) return cached;
  try {
    let captured: CompiledNodeBehavior = {};
    const defineNode = (def: CompiledNodeBehavior) => {
      captured = def;
    };
    const factory = new Function("defineNode", ...SHADOW_PARAMS, source);
    factory(defineNode, ...SHADOW_VALUES);
    const result = Result.ok(captured);
    nodeCache.set(key, result);
    return result;
  } catch (err) {
    const result = Result.err(loomError("compile_failed", String(err)));
    nodeCache.set(key, result);
    return result;
  }
};

export const compileEdgeBehavior = (
  source: string | undefined,
  kind: EdgeKind,
): Result<CompiledEdgeBehavior, LoomError> => {
  if (!source || source.trim() === "") return Result.ok({});
  const key = hash(source + kind);
  const cached = edgeCache.get(key);
  if (cached) return cached;
  try {
    let captured: CompiledEdgeBehavior = {};
    const defineEdge = (def: CompiledEdgeBehavior) => {
      captured = def;
    };
    const factory = new Function("defineEdge", ...SHADOW_PARAMS, source);
    factory(defineEdge, ...SHADOW_VALUES);
    const result = Result.ok(captured);
    edgeCache.set(key, result);
    return result;
  } catch (err) {
    const result = Result.err(loomError("compile_failed", String(err)));
    edgeCache.set(key, result);
    return result;
  }
};
