import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { makePrng } from "../prng.ts";
import { runSimulation } from "../tick-loop.ts";
import type { GraphDef, RunConfig, Trace } from "../types.ts";
import { arbGraph, arbRunConfig } from "../testing/arbitraries.ts";
import { fcParams } from "../testing/fc.ts";

const collect = async (graph: GraphDef, config: RunConfig): Promise<Trace> => {
  const trace: Trace = [];
  for await (const snapshot of runSimulation(graph, config)) {
    trace.push(snapshot);
  }
  return trace;
};

const shuffle = <T>(items: readonly T[], shuffleSeed: number): T[] => {
  const rand = makePrng(shuffleSeed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

describe("semantics: entity-order independence", () => {
  test("S4: permuting nodes/edges arrays yields a bit-identical trace", async () => {
    await fc.assert(
      fc.asyncProperty(arbGraph, arbRunConfig, fc.integer(), async (graph, config, shuffleSeed) => {
        const permuted: GraphDef = {
          nodes: shuffle(graph.nodes, shuffleSeed),
          edges: shuffle(graph.edges, shuffleSeed + 1),
        };
        const base = await collect(graph, config);
        const shuffled = await collect(permuted, config);
        expect(JSON.stringify(shuffled)).toBe(JSON.stringify(base));
      }),
      fcParams(),
    );
  });

  test("S4: reversed node array produces the same trace", async () => {
    const graph: GraphDef = {
      nodes: [
        {
          id: "b",
          kind: "tick",
          schema: { config: {} },
          behavior:
            "defineNode({ init: () => 0, tick: ({ state, rand }) => ({ state: state + rand(), outputs: {} }) });",
          config: {},
          meta: {},
        },
        {
          id: "a",
          kind: "tick",
          schema: { config: {} },
          behavior:
            "defineNode({ init: () => 0, tick: ({ state, rand }) => ({ state: state + rand(), outputs: {} }) });",
          config: {},
          meta: {},
        },
      ],
      edges: [],
    };
    const reversed: GraphDef = { nodes: [...graph.nodes].reverse(), edges: [] };
    const config = { seed: 7, fromTick: 0, toTick: 5 };
    const base = await collect(graph, config);
    const flipped = await collect(reversed, config);
    expect(JSON.stringify(flipped)).toBe(JSON.stringify(base));
  });
});
