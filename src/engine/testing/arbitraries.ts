import fc from "fast-check";
import type { EdgeDef, GraphDef, NodeDef, RunConfig } from "../types.ts";

// Templates must stay within semantics the current engine executes, or property
// failures become false alarms; extend the pool as phase-3 tasks land new rules.

const TICK_TEMPLATES = [
  undefined,
  "defineNode({ init: () => 0, tick: ({ state }) => ({ state: state + 1, outputs: {} }) });",
  "defineNode({ init: () => 0, tick: ({ state, rand }) => ({ state: state + rand(), outputs: {} }) });",
];

const FLOW_TEMPLATES: Array<{
  behavior?: string;
  config: (rate: number) => Record<string, unknown>;
}> = [
  {
    behavior: "defineEdge({ rate: ({ source, config }) => source.value * config.rate });",
    config: (rate) => ({ rate }),
  },
  {
    config: (rate) => ({ constantRate: rate * 10 }),
  },
  {
    behavior: "defineEdge({ rate: ({ config, rand }) => rand() * config.scale });",
    config: (rate) => ({ scale: 1 + rate * 10 }),
  },
];

const RATES = [0.05, 0.1, 0.25] as const;

const arbStock = (index: number): fc.Arbitrary<NodeDef> =>
  fc.integer({ min: 1, max: 1000 }).map((principal) => ({
    id: `s${index}`,
    kind: "stock" as const,
    schema: { config: { initialBalance: { type: "number" as const, default: principal } } },
    config: { initialBalance: principal },
    meta: {},
  }));

const arbVariable = (index: number): fc.Arbitrary<NodeDef> =>
  fc.integer({ min: 0, max: 100 }).map((amount) => ({
    id: `v${index}`,
    kind: "variable" as const,
    schema: { config: { amount: { type: "number" as const, default: amount } } },
    config: { amount },
    meta: {},
  }));

const arbTickNode = (index: number): fc.Arbitrary<NodeDef> =>
  fc.constantFrom(...TICK_TEMPLATES).map((behavior) => ({
    id: `t${index}`,
    kind: "tick" as const,
    schema: { config: {} },
    ...(behavior ? { behavior } : {}),
    config: {},
    meta: {},
  }));

const arbFlowEdge = (index: number, nodeIds: string[], stockIds: string[]): fc.Arbitrary<EdgeDef> =>
  fc
    .record({
      sourceIdx: fc.nat({ max: nodeIds.length - 1 }),
      targetIdx: fc.nat({ max: stockIds.length - 1 }),
      templateIdx: fc.nat({ max: FLOW_TEMPLATES.length - 1 }),
      rate: fc.constantFrom(...RATES),
    })
    .map(({ sourceIdx, targetIdx, templateIdx, rate }) => {
      const template = FLOW_TEMPLATES[templateIdx]!;
      return {
        id: `f${index}`,
        source: { node: nodeIds[sourceIdx]! },
        target: { node: stockIds[targetIdx]! },
        kind: "flow" as const,
        ...(template.behavior ? { behavior: template.behavior } : {}),
        config: template.config(rate),
        meta: {},
      };
    });

const arbPassthroughEdge = (index: number, nodeIds: string[]): fc.Arbitrary<EdgeDef> =>
  fc
    .record({
      sourceIdx: fc.nat({ max: nodeIds.length - 1 }),
      targetIdx: fc.nat({ max: nodeIds.length - 1 }),
    })
    .map(({ sourceIdx, targetIdx }) => ({
      id: `p${index}`,
      source: { node: nodeIds[sourceIdx]! },
      target: { node: nodeIds[targetIdx]! },
      kind: "passthrough" as const,
      config: {},
      meta: {},
    }));

export const arbGraph: fc.Arbitrary<GraphDef> = fc
  .record({
    nStocks: fc.integer({ min: 1, max: 3 }),
    nVariables: fc.integer({ min: 0, max: 2 }),
    nTicks: fc.integer({ min: 0, max: 3 }),
    nFlows: fc.integer({ min: 0, max: 4 }),
    nPassthroughs: fc.integer({ min: 0, max: 2 }),
  })
  .chain(({ nStocks, nVariables, nTicks, nFlows, nPassthroughs }) => {
    const nodeArbs = [
      ...Array.from({ length: nStocks }, (_, i) => arbStock(i)),
      ...Array.from({ length: nVariables }, (_, i) => arbVariable(i)),
      ...Array.from({ length: nTicks }, (_, i) => arbTickNode(i)),
    ];
    return fc.tuple(...nodeArbs).chain((nodes) => {
      const nodeIds = nodes.map((n) => n.id);
      const stockIds = nodes.filter((n) => n.kind === "stock").map((n) => n.id);
      const edgeArbs = [
        ...Array.from({ length: nFlows }, (_, i) => arbFlowEdge(i, nodeIds, stockIds)),
        ...Array.from({ length: nPassthroughs }, (_, i) => arbPassthroughEdge(i, nodeIds)),
      ];
      if (edgeArbs.length === 0) return fc.constant({ nodes, edges: [] as EdgeDef[] });
      return fc.tuple(...edgeArbs).map((edges) => ({ nodes, edges }));
    });
  });

export const arbRunConfig: fc.Arbitrary<RunConfig> = fc.record({
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  fromTick: fc.constant(0),
  toTick: fc.integer({ min: 1, max: 25 }),
});
