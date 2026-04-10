import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Database } from "../../services/database.ts";
import { createTestDb } from "../../utils/harness.ts";
import { makeGraphStore, type GraphStore } from "../../graph/store.ts";
import { makeWorkspace, type Workspace } from "../../workspace/workspace.ts";
import { dispatchTool, type ToolDeps } from "./tool-handlers.ts";

describe("tool-handlers", () => {
  let db: Database;
  let store: GraphStore;
  let workspace: Workspace;
  let deps: ToolDeps;

  beforeEach(async () => {
    db = await createTestDb();
    store = makeGraphStore(db);
    workspace = makeWorkspace({ db, store });
    deps = { store, workspace };
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("list_nodes on empty store returns empty array", async () => {
    const result = await dispatchTool(deps, "list_nodes", {});
    expect(result.isOk()).toBeTrue();
    expect(result.unwrap()).toEqual([]);
  });

  it("add_node with valid input creates a node", async () => {
    const result = await dispatchTool(deps, "add_node", {
      kind: "stock",
      schema: { label: "Inventory" },
      config: {},
      meta: {},
    });
    expect(result.isOk()).toBeTrue();
    const node = result.unwrap() as { id: string; kind: string };
    expect(node.kind).toBe("stock");

    const listed = await dispatchTool(deps, "list_nodes", {});
    expect(listed.isOk()).toBeTrue();
    const nodes = listed.unwrap() as { id: string }[];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe(node.id);
  });

  it("add_node with invalid input returns err", async () => {
    const result = await dispatchTool(deps, "add_node", { schema: {} });
    expect(result.isOk()).toBeFalse();
  });

  it("add_edge round-trip", async () => {
    await dispatchTool(deps, "add_node", {
      id: "n1",
      kind: "stock",
      schema: {},
      config: {},
      meta: {},
    });
    await dispatchTool(deps, "add_node", {
      id: "n2",
      kind: "variable",
      schema: {},
      config: {},
      meta: {},
    });

    const result = await dispatchTool(deps, "add_edge", {
      sourceNode: "n1",
      targetNode: "n2",
      kind: "flow",
      config: {},
      meta: {},
    });
    expect(result.isOk()).toBeTrue();

    const listed = await dispatchTool(deps, "list_edges", {});
    expect(listed.isOk()).toBeTrue();
    const edges = listed.unwrap() as { sourceNode: string; targetNode: string }[];
    expect(edges).toHaveLength(1);
    expect(edges[0]?.sourceNode).toBe("n1");
    expect(edges[0]?.targetNode).toBe("n2");
  });

  it("set_problem_statement persists the statement", async () => {
    const result = await dispatchTool(deps, "set_problem_statement", {
      problemStatement: "Model queue backpressure",
    });
    expect(result.isOk()).toBeTrue();

    const ps = await workspace.getProblemStatement();
    expect(ps.unwrap()).toBe("Model queue backpressure");
  });

  it("dispatchTool with unknown tool returns err", async () => {
    const result = await dispatchTool(deps, "nonexistent_tool", {});
    expect(result.isOk()).toBeFalse();
  });

  it("query_downstream on disconnected graph returns empty array", async () => {
    await dispatchTool(deps, "add_node", {
      id: "isolated",
      kind: "variable",
      schema: {},
      config: {},
      meta: {},
    });
    const result = await dispatchTool(deps, "query_downstream", { id: "isolated" });
    expect(result.isOk()).toBeTrue();
    expect(result.unwrap()).toEqual([]);
  });
});
