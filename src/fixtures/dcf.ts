import type { GraphDef } from "../engine/types.ts";

export type DcfParams = {
  baseRevenue: number;
  baseOpex: number;
  growth: number;
  wacc: number;
};

export const defaultParams: DcfParams = {
  baseRevenue: 100,
  baseOpex: 60,
  growth: 0.08,
  wacc: 0.1,
};

export const buildGraph = (params: DcfParams = defaultParams): GraphDef => ({
  nodes: [
    {
      id: "revenue",
      kind: "variable",
      schema: { config: { base: { type: "number", default: params.baseRevenue } } },
      behavior:
        "defineNode({ value: ({ config, tick }) => config.base * Math.pow(1 + config.growth, tick) });",
      config: { base: params.baseRevenue, growth: params.growth },
      meta: { label: "Revenue" },
    },
    {
      id: "opex",
      kind: "variable",
      schema: { config: { base: { type: "number", default: params.baseOpex } } },
      behavior:
        "defineNode({ value: ({ config, tick }) => config.base * Math.pow(1 + config.growth, tick) });",
      config: { base: params.baseOpex, growth: params.growth },
      meta: { label: "OpEx" },
    },
    {
      id: "fcf",
      kind: "variable",
      schema: { config: {} },
      behavior:
        "defineNode({ value: ({ inputs }) => (inputs.revenue ?? 0) - (inputs.opex ?? 0) });",
      config: {},
      meta: { label: "Free cash flow" },
    },
    {
      id: "discounted",
      kind: "variable",
      schema: { config: { wacc: { type: "number", default: params.wacc } } },
      behavior:
        "defineNode({ value: ({ inputs, config, tick }) => (inputs.fcf ?? 0) / Math.pow(1 + config.wacc, tick) });",
      config: { wacc: params.wacc },
      meta: { label: "Discounted FCF" },
    },
    {
      id: "npv",
      kind: "stock",
      schema: { config: { initialBalance: { type: "number", default: 0 } } },
      config: { initialBalance: 0 },
      meta: { label: "NPV" },
    },
  ],
  edges: [
    {
      id: "p-revenue",
      source: { node: "revenue" },
      target: { node: "fcf", port: "revenue" },
      kind: "passthrough",
      config: {},
      meta: {},
    },
    {
      id: "p-opex",
      source: { node: "opex" },
      target: { node: "fcf", port: "opex" },
      kind: "passthrough",
      config: {},
      meta: {},
    },
    {
      id: "p-fcf",
      source: { node: "fcf" },
      target: { node: "discounted", port: "fcf" },
      kind: "passthrough",
      config: {},
      meta: {},
    },
    {
      id: "accumulate",
      source: { node: "discounted" },
      target: { node: "npv" },
      kind: "flow",
      behavior: "defineEdge({ rate: ({ source }) => source.value });",
      config: {},
      meta: { label: "Accumulate NPV" },
    },
  ],
});

export const oracle = (tick: number, params: DcfParams = defaultParams): number => {
  let npv = 0;
  for (let t = 1; t <= tick; t++) {
    const fcf = (params.baseRevenue - params.baseOpex) * (1 + params.growth) ** t;
    npv += fcf / (1 + params.wacc) ** t;
  }
  return npv;
};
