import type { EdgeDef } from "../types.ts";
import type { CompiledEdgeBehavior } from "../compile/compile-behavior.ts";
import type { LoomError } from "../errors.ts";
import { loomError } from "../errors.ts";
import { Result } from "better-result";

type FlowEvalCtx = {
  sourceValue: number;
  tick: number;
  rand: () => number;
};

export const evalFlowRate = (
  edge: EdgeDef,
  compiled: CompiledEdgeBehavior,
  ctx: FlowEvalCtx,
): Result<number, LoomError> => {
  if (compiled.rate) {
    try {
      const rate = compiled.rate({
        source: { value: ctx.sourceValue },
        config: edge.config,
        tick: ctx.tick,
        rand: ctx.rand,
      });
      if (!Number.isFinite(rate))
        return Result.err(
          loomError("flow_rate_nan", `Edge ${edge.id} rate returned non-finite: ${rate}`),
        );
      return Result.ok(rate);
    } catch (err) {
      return Result.err(loomError("flow_rate_threw", `Edge ${edge.id} rate threw: ${String(err)}`));
    }
  }
  const constant = Number(edge.config.constantRate ?? 0);
  return Result.ok(Number.isFinite(constant) ? constant : 0);
};
