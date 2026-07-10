import type { EdgeDef, EntityState, GraphDef, NodeDef } from "./types.ts";

// S2/S3: same-tick dependencies come only from passthrough edges. Kahn's
// algorithm over id-sorted nodes; when stuck on a cycle, the smallest-id node
// is placed anyway, turning its unresolved incoming edges into 1-tick delays.
export const buildTopoOrder = (graph: GraphDef): string[] => {
  const ids = graph.nodes.map((node) => node.id);
  const idSet = new Set(ids);
  const preds = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "passthrough") continue;
    if (edge.source.node === edge.target.node) continue;
    if (!idSet.has(edge.source.node) || !idSet.has(edge.target.node)) continue;
    const set = preds.get(edge.target.node) ?? new Set<string>();
    set.add(edge.source.node);
    preds.set(edge.target.node, set);
  }

  const placed = new Set<string>();
  const order: string[] = [];
  while (order.length < ids.length) {
    let pick: string | undefined;
    for (const id of ids) {
      if (placed.has(id)) continue;
      const sources = preds.get(id);
      if (!sources || [...sources].every((s) => placed.has(s))) {
        pick = id;
        break;
      }
    }
    pick ??= ids.find((id) => !placed.has(id))!;
    placed.add(pick);
    order.push(pick);
  }
  return order;
};

export const incomingPassthrough = (graph: GraphDef): Map<string, EdgeDef[]> => {
  const byTarget = new Map<string, EdgeDef[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "passthrough") continue;
    const list = byTarget.get(edge.target.node) ?? [];
    list.push(edge);
    byTarget.set(edge.target.node, list);
  }
  return byTarget;
};

const outValue = (state: EntityState | undefined, port: string | undefined): unknown => {
  if (!state) return undefined;
  if (state.kind === "stock" || state.kind === "variable") return state.value;
  if (state.kind === "tick") {
    return port ? state.outputs[port] : state.outputs;
  }
  return undefined;
};

// A source already computed this tick (present in `current`) delivers its
// current value; anything else — later phases, back-edges, tick 0 — falls back
// to the previous tick. That single rule implements S2's phase reads and S3's
// back-edge delay.
export const gatherInputs = (
  node: NodeDef,
  incoming: Map<string, EdgeDef[]>,
  states: { current: Map<string, EntityState>; prev: Map<string, EntityState> },
  deliveries: Map<string, unknown>,
): Record<string, unknown> => {
  const inputs: Record<string, unknown> = {};
  for (const edge of incoming.get(node.id) ?? []) {
    const sourceId = edge.source.node;
    const state = states.current.get(sourceId) ?? states.prev.get(sourceId);
    const value = outValue(state, edge.source.port);
    deliveries.set(edge.id, value ?? null);
    if (value !== undefined) {
      inputs[edge.target.port ?? sourceId] = value;
    }
  }
  return inputs;
};
