import type { GraphDef } from "../../engine/types.ts";
import type { NodeSchemaV2 } from "../../engine/schema.ts";
import type { WorkspaceState } from "./workspace-store.ts";

export const currentSnapshot = (state: WorkspaceState) => state.trace[state.currentTick] ?? null;

export const chartData = (state: WorkspaceState) =>
  state.trace.map((snapshot) => ({
    tick: snapshot.tick,
    v: snapshot.entities.length,
  }));

export const toGraphDef = (state: WorkspaceState): GraphDef => ({
  nodes: state.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    schema: node.schema as NodeSchemaV2,
    behavior: node.behavior ?? undefined,
    config: node.config,
    meta: node.meta,
  })),
  edges: state.edges.map((edge) => ({
    id: edge.id,
    source: {
      node: edge.sourceNode,
      ...(edge.sourcePort ? { port: edge.sourcePort } : {}),
    },
    target: {
      node: edge.targetNode,
      ...(edge.targetPort ? { port: edge.targetPort } : {}),
    },
    kind: edge.kind,
    behavior: edge.behavior ?? undefined,
    config: edge.config,
    meta: edge.meta,
  })),
});
