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
    const factory = new Function("defineNode", source);
    factory(defineNode);
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
    const factory = new Function("defineEdge", source);
    factory(defineEdge);
    const result = Result.ok(captured);
    edgeCache.set(key, result);
    return result;
  } catch (err) {
    const result = Result.err(loomError("compile_failed", String(err)));
    edgeCache.set(key, result);
    return result;
  }
};
