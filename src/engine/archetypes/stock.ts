import type { EntityState, ErrorEntityState, NodeDef } from "../types.ts";
import { errorState } from "../errors.ts";

type StockState = Extract<EntityState, { kind: "stock" }>;

export const initStock = (node: NodeDef, tick: number): StockState | ErrorEntityState => {
  const initial = Number(node.config.initialBalance ?? 0);
  if (!Number.isFinite(initial)) {
    return errorState(
      "stock",
      "runtime",
      `Node ${node.id} initialBalance is not finite: ${String(node.config.initialBalance)}`,
      tick,
    );
  }
  return { kind: "stock", value: initial };
};

export const integrateStock = (
  prev: StockState,
  inflows: readonly number[],
  outflows: readonly number[],
  meta: { nodeId: string; tick: number },
): StockState | ErrorEntityState => {
  const totalIn = inflows.reduce((sum, v) => sum + v, 0);
  const totalOut = outflows.reduce((sum, v) => sum + v, 0);
  const value = prev.value + totalIn - totalOut;
  if (!Number.isFinite(value)) {
    return errorState(
      "stock",
      "runtime",
      `Node ${meta.nodeId} integrated to a non-finite value at tick ${meta.tick}`,
      meta.tick,
    );
  }
  return { kind: "stock", value };
};
