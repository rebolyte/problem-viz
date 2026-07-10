import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { runSimulation } from "../tick-loop.ts";
import type { EntityState, GraphDef, NodeDef, RunConfig, Trace } from "../types.ts";
import { arbGraph, arbRunConfig } from "../testing/arbitraries.ts";
import { fcParams } from "../testing/fc.ts";

const collect = async (graph: GraphDef, config: RunConfig): Promise<Trace> => {
  const trace: Trace = [];
  for await (const snapshot of runSimulation(graph, config)) {
    trace.push(snapshot);
  }
  return trace;
};

const entityState = (trace: Trace, tick: number, id: string): EntityState => {
  const entity = trace[tick]!.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`entity ${id} missing at tick ${tick}`);
  return entity.state;
};

const stock = (id: string, initialBalance: number): NodeDef => ({
  id,
  kind: "stock",
  schema: { config: {} },
  config: { initialBalance },
  meta: {},
});

describe("semantics: error containment", () => {
  test("S8: throwing tick behavior becomes sticky error state, run completes", async () => {
    const graph: GraphDef = {
      nodes: [
        {
          id: "broken",
          kind: "tick",
          schema: { config: {} },
          behavior: `defineNode({ tick: () => { throw new Error("boom"); } });`,
          config: {},
          meta: {},
        },
        stock("healthy", 100),
      ],
      edges: [],
    };
    const trace = await collect(graph, { seed: 1, fromTick: 0, toTick: 3 });
    expect(trace).toHaveLength(4);

    expect(entityState(trace, 0, "broken").kind).toBe("tick");
    for (const tick of [1, 2, 3]) {
      const state = entityState(trace, tick, "broken");
      expect(state).toEqual({
        kind: "error",
        archetype: "tick",
        phase: "runtime",
        message: expect.stringContaining("boom"),
        tick: 1,
      });
    }
    for (const tick of [0, 1, 2, 3]) {
      expect(entityState(trace, tick, "healthy")).toEqual({ kind: "stock", value: 100 });
    }
  });

  test("S9: NaN flow rate errors the edge and poisons the target stock", async () => {
    const graph: GraphDef = {
      nodes: [stock("balance", 100)],
      edges: [
        {
          id: "bad-flow",
          source: { node: "balance" },
          target: { node: "balance" },
          kind: "flow",
          behavior: `defineEdge({ rate: () => NaN });`,
          config: {},
          meta: {},
        },
      ],
    };
    const trace = await collect(graph, { seed: 1, fromTick: 0, toTick: 2 });

    expect(entityState(trace, 0, "balance")).toEqual({ kind: "stock", value: 100 });
    const edgeState = entityState(trace, 1, "bad-flow");
    expect(edgeState.kind).toBe("error");
    if (edgeState.kind === "error") {
      expect(edgeState.archetype).toBe("flow");
      expect(edgeState.phase).toBe("runtime");
    }
    const stockState = entityState(trace, 1, "balance");
    expect(stockState.kind).toBe("error");
    if (stockState.kind === "error") {
      expect(stockState.message).toContain("bad-flow");
    }
    expect(entityState(trace, 2, "balance")).toEqual(entityState(trace, 1, "balance"));
  });

  test("S8: compile-broken flow edge errors at tick 0 and poisons the stock from tick 1", async () => {
    const graph: GraphDef = {
      nodes: [stock("balance", 100)],
      edges: [
        {
          id: "unparseable",
          source: { node: "balance" },
          target: { node: "balance" },
          kind: "flow",
          behavior: "this is not valid javascript =",
          config: {},
          meta: {},
        },
      ],
    };
    const trace = await collect(graph, { seed: 1, fromTick: 0, toTick: 2 });

    const edgeAtZero = entityState(trace, 0, "unparseable");
    expect(edgeAtZero.kind).toBe("error");
    if (edgeAtZero.kind === "error") {
      expect(edgeAtZero.phase).toBe("compile");
      expect(edgeAtZero.tick).toBe(0);
    }
    expect(entityState(trace, 0, "balance")).toEqual({ kind: "stock", value: 100 });
    expect(entityState(trace, 1, "balance").kind).toBe("error");
  });

  test("S8: injecting a throwing node keeps runs complete and deterministic", async () => {
    await fc.assert(
      fc.asyncProperty(arbGraph, arbRunConfig, async (graph, config) => {
        const poisoned: GraphDef = {
          nodes: [
            ...graph.nodes,
            {
              id: "x-thrower",
              kind: "tick",
              schema: { config: {} },
              behavior: `defineNode({ tick: () => { throw new Error("injected"); } });`,
              config: {},
              meta: {},
            },
          ],
          edges: graph.edges,
        };
        const first = await collect(poisoned, config);
        const second = await collect(poisoned, config);
        expect(first).toHaveLength(config.toTick + 1);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        const finalState = entityState(first, config.toTick, "x-thrower");
        expect(finalState.kind).toBe("error");
      }),
      fcParams(),
    );
  });
});
