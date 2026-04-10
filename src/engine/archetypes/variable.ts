import type { NodeDef, EntityState } from "../types.ts";

export const runVariable = (node: NodeDef): Extract<EntityState, { kind: "variable" }> => {
  const amount = Number(node.config.amount ?? 0);
  return { kind: "variable", value: Number.isFinite(amount) ? amount : 0 };
};
