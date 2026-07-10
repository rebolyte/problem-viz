import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { runSimulation } from "../tick-loop.ts";
import type { GraphDef, RunConfig, TickSnapshot } from "../types.ts";
import { arbGraph, arbRunConfig } from "../testing/arbitraries.ts";
import { fcParams } from "../testing/fc.ts";

const collect = async (graph: GraphDef, config: RunConfig): Promise<TickSnapshot[]> => {
  const trace: TickSnapshot[] = [];
  for await (const snapshot of runSimulation(graph, config)) {
    trace.push(snapshot);
  }
  return trace;
};

describe("semantics: snapshot serializability", () => {
  test("S12: every snapshot survives structuredClone and JSON round-trip unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(arbGraph, arbRunConfig, async (graph, config) => {
        const trace = await collect(graph, config);
        for (const snapshot of trace) {
          expect(structuredClone(snapshot)).toEqual(snapshot);
          expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
        }
      }),
      fcParams(),
    );
  });
});
