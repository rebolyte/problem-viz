import type { EntityState, ErrorEntityState, NodeDef } from "../types.ts";
import type { CompiledNodeBehavior } from "../compile/compile-behavior.ts";
import { errorState } from "../errors.ts";

type StockState = Extract<EntityState, { kind: "stock" }>;

export const initStock = (
  node: NodeDef,
  compiled: CompiledNodeBehavior,
  tick: number,
): StockState | ErrorEntityState => {
  let raw: unknown;
  if (compiled.init) {
    try {
      raw = compiled.init(node.config);
    } catch (err) {
      return errorState("stock", "runtime", `Node ${node.id} init threw: ${String(err)}`, tick);
    }
  } else if (node.schema.initial) {
    raw = node.config[node.schema.initial] ?? 0;
  } else {
    raw = node.config.initialBalance ?? 0;
  }

  const initial = Number(raw);
  if (!Number.isFinite(initial)) {
    return errorState(
      "stock",
      "runtime",
      `Node ${node.id} initial value is not finite: ${String(raw)}`,
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
