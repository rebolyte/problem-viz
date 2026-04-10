import { nanoid } from "nanoid";
import type { CreateEdgeInput, CreateNodeInput } from "../../server/graph/store.ts";

export const buildCompoundInterestGraph = (): {
  nodes: CreateNodeInput[];
  edges: CreateEdgeInput[];
} => {
  const seedId = nanoid();
  const balanceId = `balance-${seedId}`;
  const interestId = `interest-${seedId}`;
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
      meta: { label: "Balance", position: { x: 240, y: 160 } },
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
