import type { GraphDef } from "../engine/types.ts";

export type CompoundInterestParams = { principal: number; rate: number };

export const defaultParams: CompoundInterestParams = { principal: 100, rate: 0.1 };

export const buildGraph = (params: CompoundInterestParams = defaultParams): GraphDef => ({
  nodes: [
    {
      id: "balance",
      kind: "stock",
      schema: {
        config: {
          initialBalance: { type: "number", default: params.principal, min: 0, step: 1 },
        },
      },
      config: { initialBalance: params.principal },
      meta: { label: "Balance" },
    },
  ],
  edges: [
    {
      id: "interest",
      source: { node: "balance" },
      target: { node: "balance" },
      kind: "flow",
      behavior: "defineEdge({ rate: ({ source, config }) => source.value * config.rate });",
      config: { rate: params.rate },
      meta: { label: "Interest" },
    },
  ],
});

export const oracle = (tick: number, { principal, rate }: CompoundInterestParams): number =>
  principal * (1 + rate) ** tick;
