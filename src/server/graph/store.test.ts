import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "../services/database.ts";
import { createTestDb } from "../utils/harness.ts";
import { makeGraphStore, type GraphStore } from "./store.ts";

describe("Graph Store", () => {
  let db: Database;
  let store: GraphStore;

  beforeEach(async () => {
    db = await createTestDb();
    store = makeGraphStore(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("stores and reads nodes with parsed json fields", async () => {
    const created = await store.addNode({
      id: "node-a",
      kind: "tick",
      schema: { label: "Tick" },
      config: { seed: 42 },
      meta: { position: { x: 10, y: 20 } },
    });

    expect(created.isOk()).toBeTrue();
    expect(created.unwrap()).toMatchObject({
      id: "node-a",
      kind: "tick",
      schema: { label: "Tick" },
      config: { seed: 42 },
      meta: { position: { x: 10, y: 20 } },
    });

    const listed = await store.listNodes();

    expect(listed.unwrap()).toHaveLength(1);
    expect(listed.unwrap()[0]?.id).toBe("node-a");
  });

  it("stores and reads edges with parsed json fields", async () => {
    await store.addNode({
      id: "node-a",
      kind: "tick",
      schema: {},
      config: {},
      meta: {},
    });
    await store.addNode({
      id: "node-b",
      kind: "stock",
      schema: {},
      config: {},
      meta: {},
    });

    const created = await store.addEdge({
      id: "edge-a-b",
      sourceNode: "node-a",
      sourcePort: "out",
      targetNode: "node-b",
      targetPort: "in",
      kind: "flow",
      config: { weight: 1 },
      meta: { label: "A to B" },
    });

    expect(created.isOk()).toBeTrue();
    expect(created.unwrap()).toMatchObject({
      id: "edge-a-b",
      sourceNode: "node-a",
      targetNode: "node-b",
      kind: "flow",
      config: { weight: 1 },
      meta: { label: "A to B" },
    });

    const listed = await store.listEdges();

    expect(listed.unwrap()).toHaveLength(1);
    expect(listed.unwrap()[0]?.id).toBe("edge-a-b");
  });

  it("finds downstream nodes recursively", async () => {
    await seedLinearGraph(store);

    const downstream = await store.downstreamOf("node-a");

    expect(downstream.unwrap()).toEqual(["node-b", "node-c"]);
  });

  it("finds upstream nodes recursively", async () => {
    await seedLinearGraph(store);

    const upstream = await store.upstreamOf("node-c");

    expect(upstream.unwrap()).toEqual(["node-b", "node-a"]);
  });

  it("deletes node and cascades dependent edges", async () => {
    await seedLinearGraph(store);

    const deleted = await store.deleteNode("node-b");

    expect(deleted.isOk()).toBeTrue();
    expect((await store.listEdges()).unwrap()).toHaveLength(0);
    expect((await store.listNodes()).unwrap().map((node) => node.id)).toEqual(["node-a", "node-c"]);
  });
});

const seedLinearGraph = async (store: GraphStore) => {
  await store.addNode({
    id: "node-a",
    kind: "tick",
    schema: {},
    config: {},
    meta: {},
  });
  await store.addNode({
    id: "node-b",
    kind: "stock",
    schema: {},
    config: {},
    meta: {},
  });
  await store.addNode({
    id: "node-c",
    kind: "process",
    schema: {},
    config: {},
    meta: {},
  });
  await store.addEdge({
    id: "edge-a-b",
    sourceNode: "node-a",
    targetNode: "node-b",
    kind: "dependency",
    config: {},
    meta: {},
  });
  await store.addEdge({
    id: "edge-b-c",
    sourceNode: "node-b",
    targetNode: "node-c",
    kind: "dependency",
    config: {},
    meta: {},
  });
};
