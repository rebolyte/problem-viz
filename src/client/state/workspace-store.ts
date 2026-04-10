import { useSyncExternalStore } from "react";
import type { TickSnapshot, Trace } from "../../engine/types.ts";
import type { AgentMessage, VerifyProgress } from "../../rpc/loom-client.ts";
import type { LoomServerApi, WorkspaceSnapshot } from "../../rpc/loom-server.ts";
import type { SimEngineApi } from "../../rpc/sim-engine.ts";
import type { GraphEdge, GraphNode } from "../../server/graph/store.ts";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WorkspaceState = {
  problemStatement: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  trace: Trace;
  currentTick: number;
  layout: unknown;
  server: LoomServerApi | null;
  sim: SimEngineApi | null;
  chatMessages: ChatMessage[];
  verifyProgress: VerifyProgress | null;
};

const initialState = (): WorkspaceState => ({
  problemStatement: "",
  nodes: [],
  edges: [],
  trace: [],
  currentTick: 0,
  layout: null,
  server: null,
  sim: null,
  chatMessages: [],
  verifyProgress: null,
});

let state = initialState();
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const setState = (updater: (previous: WorkspaceState) => WorkspaceState) => {
  state = updater(state);
  emit();
};

export const workspaceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return state;
  },
  useStore<T>(selector: (snapshot: WorkspaceState) => T) {
    const snapshot = useSyncExternalStore(this.subscribe, this.getSnapshot, this.getSnapshot);
    return selector(snapshot);
  },
  actions: {
    setConnections({ server, sim }: { server: LoomServerApi | null; sim: SimEngineApi | null }) {
      setState((previous) => ({ ...previous, server, sim }));
    },
    loadWorkspace(snapshot: WorkspaceSnapshot) {
      setState((previous) => ({
        ...previous,
        problemStatement: snapshot.problemStatement,
        layout: snapshot.layout,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
      }));
    },
    setProblemStatementLocal(problemStatement: string) {
      setState((previous) => ({ ...previous, problemStatement }));
    },
    setLayoutLocal(layout: unknown) {
      setState((previous) => ({ ...previous, layout }));
    },
    setNodesLocal(nodes: GraphNode[]) {
      setState((previous) => ({ ...previous, nodes }));
    },
    setEdgesLocal(edges: GraphEdge[]) {
      setState((previous) => ({ ...previous, edges }));
    },
    updateNodePosition(id: string, position: { x: number; y: number }) {
      setState((previous) => ({
        ...previous,
        nodes: previous.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                meta: {
                  ...node.meta,
                  position,
                },
              }
            : node,
        ),
      }));
    },
    clearTrace() {
      setState((previous) => ({ ...previous, trace: [], currentTick: 0 }));
    },
    appendTick(snapshot: TickSnapshot) {
      setState((previous) => {
        const trace = [...previous.trace, snapshot];
        return {
          ...previous,
          trace,
          currentTick: Math.max(0, trace.length - 1),
        };
      });
    },
    finishRun(trace: Trace) {
      setState((previous) => ({
        ...previous,
        trace,
        currentTick: Math.max(0, trace.length - 1),
      }));
    },
    setCurrentTick(currentTick: number) {
      setState((previous) => ({ ...previous, currentTick }));
    },
    pushChatMessage(message: ChatMessage) {
      setState((previous) => ({
        ...previous,
        chatMessages: [...previous.chatMessages, message],
      }));
    },
    handleAgentEvent(event: AgentMessage) {
      setState((previous) => {
        if (event.type === "text") {
          const text = event.text;
          const last = previous.chatMessages.at(-1);
          if (last?.role === "assistant") {
            return {
              ...previous,
              chatMessages: [
                ...previous.chatMessages.slice(0, -1),
                { ...last, content: `${last.content}${text}` },
              ],
            };
          }

          return {
            ...previous,
            chatMessages: [...previous.chatMessages, { role: "assistant", content: text }],
          };
        }

        return previous;
      });
    },
    setVerifyProgress(progress: VerifyProgress) {
      setState((previous) => ({ ...previous, verifyProgress: progress }));
    },
  },
  __resetForTests() {
    state = initialState();
    emit();
  },
};
