import type { EntityState, ErrorEntityState, NodeDef } from "../types.ts";
import { errorState } from "../errors.ts";

export const runVariable = (
  node: NodeDef,
  tick: number,
): Extract<EntityState, { kind: "variable" }> | ErrorEntityState => {
  const amount = Number(node.config.amount ?? 0);
  if (!Number.isFinite(amount)) {
    return errorState(
      "variable",
      "runtime",
      `Node ${node.id} amount is not finite: ${String(node.config.amount)}`,
      tick,
    );
  }
  return { kind: "variable", value: amount };
};
