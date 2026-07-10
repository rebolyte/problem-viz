import type { EntityState, ErrorEntityState, NodeDef } from "../types.ts";
import type { CompiledNodeBehavior } from "../compile/compile-behavior.ts";
import { errorState } from "../errors.ts";

type VariableState = Extract<EntityState, { kind: "variable" }>;

type VariableEvalCtx = {
  inputs: Record<string, unknown>;
  tick: number;
  rand: () => number;
};

export const runVariable = (
  node: NodeDef,
  compiled: CompiledNodeBehavior,
  ctx: VariableEvalCtx,
): VariableState | ErrorEntityState => {
  if (compiled.value) {
    try {
      const value = Number(
        compiled.value({ inputs: ctx.inputs, config: node.config, tick: ctx.tick, rand: ctx.rand }),
      );
      if (!Number.isFinite(value)) {
        return errorState(
          "variable",
          "runtime",
          `Node ${node.id} value() returned non-finite: ${value}`,
          ctx.tick,
        );
      }
      return { kind: "variable", value };
    } catch (err) {
      return errorState(
        "variable",
        "runtime",
        `Node ${node.id} value() threw: ${String(err)}`,
        ctx.tick,
      );
    }
  }

  const amount = Number(node.config.amount ?? 0);
  if (!Number.isFinite(amount)) {
    return errorState(
      "variable",
      "runtime",
      `Node ${node.id} amount is not finite: ${String(node.config.amount)}`,
      ctx.tick,
    );
  }
  return { kind: "variable", value: amount };
};
