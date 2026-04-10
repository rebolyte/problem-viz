import { describe, expect, it } from "bun:test";
import type { GraphDef } from "./types.ts";
import { runSimulation } from "./tick-loop.ts";

describe("runSimulation", () => {
  it("yields empty snapshots for an empty graph", async () => {
    const snapshots = await collectSnapshots(
      {
        nodes: [],
        edges: [],
      },
      { seed: 42, fromTick: 0, toTick: 9 },
    );

    expect(snapshots).toHaveLength(10);
    expect(snapshots.every((snapshot) => snapshot.entities.length === 0)).toBeTrue();
  });

  it("emits one node entity per node per tick", async () => {
    const snapshots = await collectSnapshots(
      {
        nodes: [
          { id: "tick-a", kind: "tick", schema: { config: {} }, config: {}, meta: {} },
          { id: "tick-b", kind: "tick", schema: { config: {} }, config: {}, meta: {} },
        ],
        edges: [],
      },
      { seed: 7, fromTick: 0, toTick: 4 },
    );

    expect(snapshots).toHaveLength(5);
    expect(snapshots.flatMap((snapshot) => snapshot.entities)).toHaveLength(10);
  });

  it("is deterministic for the same seed and graph", async () => {
    const graph: GraphDef = {
      nodes: [{ id: "node-a", kind: "stock", schema: { config: {} }, config: {}, meta: {} }],
      edges: [],
    };

    const first = await collectSnapshots(graph, { seed: 11, fromTick: 0, toTick: 3 });
    const second = await collectSnapshots(graph, { seed: 11, fromTick: 0, toTick: 3 });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("threads the seeded prng into snapshot state", async () => {
    const graph: GraphDef = {
      nodes: [{ id: "node-a", kind: "process", schema: { config: {} }, config: {}, meta: {} }],
      edges: [],
    };

    const first = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 0 });
    const second = await collectSnapshots(graph, { seed: 2, fromTick: 0, toTick: 0 });

    expect(first[0]?.entities[0]?.state).not.toEqual(second[0]?.entities[0]?.state);
  });
});

const collectSnapshots = async (
  graph: GraphDef,
  config: { seed: number; fromTick: number; toTick: number },
) => {
  const snapshots = [];

  for await (const snapshot of runSimulation(graph, config)) {
    snapshots.push(snapshot);
  }

  return snapshots;
};
