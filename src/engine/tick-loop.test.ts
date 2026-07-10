import { describe, expect, it } from "bun:test";
import type { GraphDef } from "./types.ts";
import { runSimulation } from "./tick-loop.ts";

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

const tickSchema = { config: {} };

describe("runSimulation", () => {
  it("empty graph yields 5 snapshots with empty entities", async () => {
    const snapshots = await collectSnapshots(
      { nodes: [], edges: [] },
      { seed: 42, fromTick: 0, toTick: 4 },
    );
    expect(snapshots).toHaveLength(5);
    expect(snapshots.every((s) => s.entities.length === 0)).toBeTrue();
    expect(snapshots.map((s) => s.tick)).toEqual([0, 1, 2, 3, 4]);
  });

  it("determinism: same seed + graph → identical snapshots", async () => {
    const graph: GraphDef = {
      nodes: [
        { id: "a", kind: "stock", schema: tickSchema, config: { initialBalance: 10 }, meta: {} },
        { id: "b", kind: "stock", schema: tickSchema, config: { initialBalance: 20 }, meta: {} },
      ],
      edges: [],
    };
    const first = await collectSnapshots(graph, { seed: 77, fromTick: 0, toTick: 3 });
    const second = await collectSnapshots(graph, { seed: 77, fromTick: 0, toTick: 3 });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("compound interest: self-loop stock 100 * 1.1^n", async () => {
    const graph: GraphDef = {
      nodes: [
        {
          id: "balance",
          kind: "stock",
          schema: { config: { initialBalance: { type: "number", default: 0 } } },
          config: { initialBalance: 100 },
          meta: {},
        },
      ],
      edges: [
        {
          id: "interest",
          source: { node: "balance" },
          target: { node: "balance" },
          kind: "flow",
          behavior: `defineEdge({ rate: ({ source, config }) => source.value * config.rate })`,
          config: { rate: 0.1 },
          meta: {},
        },
      ],
    };
    const snapshots = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 3 });
    expect(snapshots).toHaveLength(4);

    const val = (tick: number) => {
      const s = snapshots[tick];
      const e = s?.entities.find((e) => e.id === "balance");
      if (!e || e.state.kind !== "stock") throw new Error("bad state");
      return e.state.value;
    };

    expect(Math.abs(val(0) - 100)).toBeLessThan(1e-9);
    expect(Math.abs(val(1) - 110)).toBeLessThan(1e-9);
    expect(Math.abs(val(2) - 121)).toBeLessThan(1e-9);
    expect(Math.abs(val(3) - 133.1)).toBeLessThan(1e-9);
  });

  it("read-then-write bilinearity: 2 stocks, asymmetric cross-flows", async () => {
    const graph: GraphDef = {
      nodes: [
        { id: "A", kind: "stock", schema: tickSchema, config: { initialBalance: 100 }, meta: {} },
        { id: "B", kind: "stock", schema: tickSchema, config: { initialBalance: 50 }, meta: {} },
      ],
      edges: [
        {
          id: "ab",
          source: { node: "A" },
          target: { node: "B" },
          kind: "flow",
          behavior: `defineEdge({ rate: ({ source }) => source.value * 0.1 })`,
          config: {},
          meta: {},
        },
        {
          id: "ba",
          source: { node: "B" },
          target: { node: "A" },
          kind: "flow",
          behavior: `defineEdge({ rate: ({ source }) => source.value * 0.4 })`,
          config: {},
          meta: {},
        },
      ],
    };

    const snapshots = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 2 });

    const val = (tick: number, id: string) => {
      const s = snapshots[tick];
      const e = s?.entities.find((e) => e.id === id);
      if (!e || e.state.kind !== "stock") throw new Error("bad state");
      return e.state.value;
    };

    expect(Math.abs(val(1, "A") - 110)).toBeLessThan(1e-9);
    expect(Math.abs(val(1, "B") - 40)).toBeLessThan(1e-9);
    expect(Math.abs(val(2, "A") - 115)).toBeLessThan(1e-9);
    expect(Math.abs(val(2, "B") - 35)).toBeLessThan(1e-9);
  });

  it("process node yields suspended stub without crashing", async () => {
    const graph: GraphDef = {
      nodes: [{ id: "proc", kind: "process", schema: tickSchema, config: {}, meta: {} }],
      edges: [],
    };
    const snapshots = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 2 });
    expect(snapshots).toHaveLength(3);
    for (const s of snapshots) {
      const e = s.entities.find((e) => e.id === "proc");
      expect(e?.state).toEqual({ kind: "process", suspended: true });
    }
  });

  it("S8: compile failure yields sticky error state with archetype identity, sim does not crash", async () => {
    const graph: GraphDef = {
      nodes: [
        {
          id: "broken",
          kind: "tick",
          schema: tickSchema,
          behavior: "this is not valid javascript =",
          config: {},
          meta: {},
        },
      ],
      edges: [],
    };
    const snapshots = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 1 });
    expect(snapshots).toHaveLength(2);
    for (const s of snapshots) {
      const e = s.entities.find((e) => e.id === "broken");
      expect(e?.state.kind).toBe("error");
      if (e?.state.kind === "error") {
        expect(e.state.archetype).toBe("tick");
        expect(e.state.phase).toBe("compile");
        expect(e.state.tick).toBe(0);
        expect(e.state.message.length).toBeGreaterThan(0);
      }
    }
  });

  it("S2/S3: passthrough delivers tick-node outputs downstream within the same tick", async () => {
    const graph: GraphDef = {
      nodes: [
        {
          id: "a",
          kind: "tick",
          schema: tickSchema,
          behavior: `defineNode({ tick: ({ tick }) => ({ state: tick, outputs: { out: "a" + tick } }) });`,
          config: {},
          meta: {},
        },
        {
          id: "b",
          kind: "tick",
          schema: tickSchema,
          behavior: `defineNode({ tick: ({ inputs }) => ({ state: inputs.fromA ?? null, outputs: {} }) });`,
          config: {},
          meta: {},
        },
      ],
      edges: [
        {
          id: "wire",
          source: { node: "a", port: "out" },
          target: { node: "b", port: "fromA" },
          kind: "passthrough",
          config: {},
          meta: {},
        },
      ],
    };
    const snapshots = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 2 });

    const stateOf = (tick: number, id: string) => {
      const e = snapshots[tick]?.entities.find((e) => e.id === id);
      if (e?.state.kind !== "tick") throw new Error("bad state");
      return e.state.context;
    };

    expect(stateOf(1, "b")).toBe("a1");
    expect(stateOf(2, "b")).toBe("a2");

    const wire = snapshots[1]?.entities.find((e) => e.id === "wire");
    expect(wire?.state).toEqual({ kind: "passthrough", lastValue: "a1" });
  });

  it("S3: passthrough cycle breaks at the back-edge with exactly one tick of delay", async () => {
    const echo = (input: string, out: string) =>
      `defineNode({ tick: ({ inputs, tick }) => ({ state: inputs.${input} ?? null, outputs: { out: "${out}" + tick } }) });`;
    const graph: GraphDef = {
      nodes: [
        {
          id: "a",
          kind: "tick",
          schema: tickSchema,
          behavior: echo("fromB", "a"),
          config: {},
          meta: {},
        },
        {
          id: "b",
          kind: "tick",
          schema: tickSchema,
          behavior: echo("fromA", "b"),
          config: {},
          meta: {},
        },
      ],
      edges: [
        {
          id: "forward",
          source: { node: "a", port: "out" },
          target: { node: "b", port: "fromA" },
          kind: "passthrough",
          config: {},
          meta: {},
        },
        {
          id: "back",
          source: { node: "b", port: "out" },
          target: { node: "a", port: "fromB" },
          kind: "passthrough",
          config: {},
          meta: {},
        },
      ],
    };
    const snapshots = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 2 });

    const stateOf = (tick: number, id: string) => {
      const e = snapshots[tick]?.entities.find((e) => e.id === id);
      if (e?.state.kind !== "tick") throw new Error("bad state");
      return e.state.context;
    };

    expect(stateOf(1, "a")).toBeNull();
    expect(stateOf(1, "b")).toBe("a1");
    expect(stateOf(2, "a")).toBe("b1");
    expect(stateOf(2, "b")).toBe("a2");
  });

  it("variable node yields value from config.amount every tick", async () => {
    const graph: GraphDef = {
      nodes: [
        { id: "myvar", kind: "variable", schema: tickSchema, config: { amount: 42 }, meta: {} },
      ],
      edges: [],
    };
    const snapshots = await collectSnapshots(graph, { seed: 1, fromTick: 0, toTick: 2 });
    expect(snapshots).toHaveLength(3);
    for (const s of snapshots) {
      const e = s.entities.find((e) => e.id === "myvar");
      expect(e?.state).toEqual({ kind: "variable", value: 42 });
    }
  });
});
