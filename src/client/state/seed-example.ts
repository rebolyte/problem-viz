import { nanoid } from "nanoid";
import type { CreateEdgeInput, CreateNodeInput } from "../../server/graph/store.ts";

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
  const balanceId = `balance-${seedId}`;
  const interestId = `interest-${seedId}`;
  const position = positionFromSeedId(seedId);
  const nodes: CreateNodeInput[] = [
    {
      id: balanceId,
      kind: "stock",
      schema: {
        config: {
          initialBalance: { type: "number", default: 100, min: 0, step: 1 },
        },
      },
      config: { initialBalance: 100 },
      meta: { label: "Balance", position },
    },
  ];
  const edges: CreateEdgeInput[] = [
    {
      id: interestId,
      sourceNode: balanceId,
      targetNode: balanceId,
      kind: "flow",
      behavior: "defineEdge({ rate: ({ source, config }) => source.value * config.rate });",
      config: { rate: 0.1 },
      meta: { label: "Interest" },
    },
  ];
  return { nodes, edges };
};
