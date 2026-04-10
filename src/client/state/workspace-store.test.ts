import { describe, expect, it } from "bun:test";
import { workspaceStore } from "./workspace-store.ts";

describe("workspaceStore", () => {
  it("loads a workspace snapshot into state", () => {
    workspaceStore.__resetForTests();

    workspaceStore.actions.loadWorkspace({
      problemStatement: "Model arrivals",
      layout: { root: "layout" },
      nodes: [
        {
          id: "node-a",
          kind: "tick",
          schema: {},
          behavior: null,
          config: {},
          meta: {},
          createdAt: "now",
        },
      ],
      edges: [],
    });

    const snapshot = workspaceStore.getSnapshot();

    expect(snapshot.problemStatement).toBe("Model arrivals");
    expect(snapshot.layout).toEqual({ root: "layout" });
    expect(snapshot.nodes).toHaveLength(1);
  });

  it("appends ticks and advances the current tick", () => {
    workspaceStore.__resetForTests();

    workspaceStore.actions.appendTick({ tick: 0, entities: [] });
    workspaceStore.actions.appendTick({ tick: 1, entities: [] });

    const snapshot = workspaceStore.getSnapshot();

    expect(snapshot.trace).toHaveLength(2);
    expect(snapshot.currentTick).toBe(1);
  });

  it("applies streaming assistant text to the current transcript", () => {
    workspaceStore.__resetForTests();

    workspaceStore.actions.pushChatMessage({ role: "user", content: "hello" });
    workspaceStore.actions.handleAgentEvent({ type: "text", text: "Loom " });
    workspaceStore.actions.handleAgentEvent({ type: "text", text: "assistant" });
    workspaceStore.actions.handleAgentEvent({ type: "done" });

    const messages = workspaceStore.getSnapshot().chatMessages;

    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ role: "assistant", content: "Loom assistant" });
  });
});
