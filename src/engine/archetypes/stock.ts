import type { NodeDef, EntityState } from "../types.ts";

type StockState = Extract<EntityState, { kind: "stock" }>;

export const initStock = (node: NodeDef): StockState => {
  const initial = Number(node.config.initialBalance ?? 0);
  return { kind: "stock", value: Number.isFinite(initial) ? initial : 0 };
};

export const integrateStock = (
  prev: StockState,
  inflows: readonly number[],
  outflows: readonly number[],
): StockState => {
  const totalIn = inflows.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const totalOut = outflows.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  return { kind: "stock", value: prev.value + totalIn - totalOut };
};
