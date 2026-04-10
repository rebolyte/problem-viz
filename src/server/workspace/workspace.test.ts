import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestDb } from "../utils/harness.ts";
import type { Database } from "../services/database.ts";
import { makeGraphStore } from "../graph/store.ts";
import { makeWorkspace, type Workspace } from "./workspace.ts";

describe("Workspace", () => {
  let db: Database;
  let workspace: Workspace;

  beforeEach(async () => {
    db = await createTestDb();
    workspace = makeWorkspace({
      db,
      store: makeGraphStore(db),
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("stores and retrieves the problem statement", async () => {
    const setResult = await workspace.setProblemStatement("Model queue pressure");

    expect(setResult.isOk()).toBeTrue();
    expect((await workspace.getProblemStatement()).unwrap()).toBe("Model queue pressure");
  });

  it("stores and retrieves layout json", async () => {
    const layout = { panels: [{ id: "timeline", size: 0.3 }] };
    const setResult = await workspace.setLayout(layout);

    expect(setResult.isOk()).toBeTrue();
    expect((await workspace.getLayout()).unwrap()).toEqual(layout);
  });

  it("undoes and redoes workspace_meta changes", async () => {
    await workspace.setProblemStatement("First");
    await workspace.setProblemStatement("Second");

    expect((await workspace.getProblemStatement()).unwrap()).toBe("Second");

    expect((await workspace.undo()).unwrap()).toBeTrue();
    expect((await workspace.getProblemStatement()).unwrap()).toBe("First");

    expect((await workspace.redo()).unwrap()).toBeTrue();
    expect((await workspace.getProblemStatement()).unwrap()).toBe("Second");
  });
});
