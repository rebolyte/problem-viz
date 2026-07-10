import { nanoid } from "nanoid";
import type { CreateEdgeInput, CreateNodeInput } from "../../server/graph/store.ts";
import { buildGraph } from "../../fixtures/compound-interest.ts";

const positionFromSeedId = (seedId: string): { x: number; y: number } => {
  let h = 0;
  for (let i = 0; i < seedId.length; i++) {
    h = Math.imul(31, h) + seedId.charCodeAt(i);
  }
  const u = h >>> 0;
  const col = u % 4;
  const row = (u >>> 8) % 4;
  return { x: 80 + col * 200, y: 80 + row * 140 };
};

export const buildCompoundInterestGraph = (): {
  nodes: CreateNodeInput[];
  edges: CreateEdgeInput[];
} => {
  const seedId = nanoid();
  const position = positionFromSeedId(seedId);
  const graph = buildGraph();
  const suffixed = (id: string) => `${id}-${seedId}`;
  const nodes: CreateNodeInput[] = graph.nodes.map((node) => ({
    id: suffixed(node.id),
    kind: node.kind,
    schema: node.schema,
    ...(node.behavior ? { behavior: node.behavior } : {}),
    config: node.config,
    meta: { ...node.meta, position },
  }));
  const edges: CreateEdgeInput[] = graph.edges.map((edge) => ({
    id: suffixed(edge.id),
    sourceNode: suffixed(edge.source.node),
    targetNode: suffixed(edge.target.node),
    kind: edge.kind,
    ...(edge.behavior ? { behavior: edge.behavior } : {}),
    config: edge.config,
    meta: edge.meta,
  }));
  return { nodes, edges };
};
