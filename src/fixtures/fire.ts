import type { GraphDef } from "../engine/types.ts";

export type FireParams = {
  salary: number;
  expenses: number;
  initialSavings: number;
  returnRate: number;
};

export const defaultParams: FireParams = {
  salary: 5000,
  expenses: 3000,
  initialSavings: 10000,
  returnRate: 0.05,
};

export const buildGraph = (params: FireParams = defaultParams): GraphDef => ({
  nodes: [
    {
      id: "salary",
      kind: "variable",
      schema: { config: { amount: { type: "number", default: params.salary } } },
      config: { amount: params.salary },
      meta: { label: "Salary" },
    },
    {
      id: "expenses",
      kind: "variable",
      schema: { config: { amount: { type: "number", default: params.expenses } } },
      config: { amount: params.expenses },
      meta: { label: "Expenses" },
    },
    {
      id: "net",
      kind: "variable",
      schema: { config: {} },
      behavior:
        "defineNode({ value: ({ inputs }) => (inputs.salary ?? 0) - (inputs.expenses ?? 0) });",
      config: {},
      meta: { label: "Net savings" },
    },
    {
      id: "savings",
      kind: "stock",
      schema: {
        config: { initialBalance: { type: "number", default: params.initialSavings, min: 0 } },
      },
      config: { initialBalance: params.initialSavings },
      meta: { label: "Savings" },
    },
  ],
  edges: [
    {
      id: "p-salary",
      source: { node: "salary" },
      target: { node: "net", port: "salary" },
      kind: "passthrough",
      config: {},
      meta: {},
    },
    {
      id: "p-expenses",
      source: { node: "expenses" },
      target: { node: "net", port: "expenses" },
      kind: "passthrough",
      config: {},
      meta: {},
    },
    {
      id: "deposit",
      source: { node: "net" },
      target: { node: "savings" },
      kind: "flow",
      behavior: "defineEdge({ rate: ({ source }) => source.value });",
      config: {},
      meta: { label: "Deposit" },
    },
    {
      id: "growth",
      source: { node: "savings" },
      target: { node: "savings" },
      kind: "flow",
      behavior: "defineEdge({ rate: ({ source, config }) => source.value * config.rate });",
      config: { rate: params.returnRate },
      meta: { label: "Investment return" },
    },
  ],
});

export const oracle = (tick: number, params: FireParams = defaultParams): number => {
  const net = params.salary - params.expenses;
  const growth = (1 + params.returnRate) ** tick;
  return params.initialSavings * growth + (net * (growth - 1)) / params.returnRate;
};
