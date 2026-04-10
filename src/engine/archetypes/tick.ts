import type { NodeDef, EntityState } from "../types.ts";
import type { CompiledNodeBehavior } from "../compile/compile-behavior.ts";
import type { LoomError } from "../errors.ts";
import { loomError } from "../errors.ts";
import { Result } from "better-result";

type TickEvalCtx = {
  prevContext: unknown;
  inputs: Record<string, unknown>;
  tick: number;
  rand: () => number;
};

type TickResult = Extract<EntityState, { kind: "tick" }>;

export const initTickContext = (
  node: NodeDef,
  compiled: CompiledNodeBehavior,
): Result<unknown, LoomError> => {
  if (compiled.init) {
    try {
      return Result.ok(compiled.init(node.config));
    } catch (err) {
      return Result.err(loomError("tick_init_threw", `Node ${node.id} init threw: ${String(err)}`));
    }
  }
  return Result.ok(null);
};

export const runTick = (
  node: NodeDef,
  compiled: CompiledNodeBehavior,
  ctx: TickEvalCtx,
): Result<TickResult, LoomError> => {
  if (!compiled.tick) {
    return Result.ok({ kind: "tick", context: ctx.prevContext, outputs: {} });
  }
  try {
    const out = compiled.tick({
      state: ctx.prevContext,
      inputs: ctx.inputs,
      config: node.config,
      tick: ctx.tick,
      rand: ctx.rand,
    });
    return Result.ok({ kind: "tick", context: out.state, outputs: out.outputs });
  } catch (err) {
    return Result.err(loomError("tick_threw", `Node ${node.id} tick threw: ${String(err)}`));
  }
};
