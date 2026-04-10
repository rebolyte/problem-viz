import { Result } from "better-result";
import { type RpcStub, RpcTarget } from "capnweb";
import type { LoomClientApi } from "../../rpc/loom-client.ts";
import type {
  LoomServerApi,
  WorkspaceSnapshot,
} from "../../rpc/loom-server.ts";
import type { RpcResult } from "../../rpc/result.ts";
import type { AssistantDomain } from "../domains/assistant/index.ts";
import type { GraphStore } from "../graph/store.ts";
import type { Logger } from "../services/logger.ts";
import type { Workspace } from "../workspace/workspace.ts";

type LoomServerDeps = {
  workspace: Workspace;
  store: GraphStore;
  assistant: AssistantDomain;
  log: Logger;
};

// I found the runtime blocker: capnweb won't carry better-result objects because
// they have callable own-properties. I'm switching the RPC boundary to a plain
// serializable result shape while keeping Result inside the server modules.
const rpcOk = <T>(value: T): RpcResult<T> => ({ ok: true, value });

const rpcErr = (
  error: { message?: string; name?: string },
): RpcResult<never> => ({
  ok: false,
  error: {
    message: error.message ?? "Unknown error",
    type: error.name,
  },
});

const toRpcResult = <T>(
  result: Result<T, { message?: string; name?: string }>,
): RpcResult<T> => result.isOk() ? rpcOk(result.value) : rpcErr(result.error);

export class LoomServerImpl extends RpcTarget implements LoomServerApi {
  #client: RpcStub<LoomClientApi> | null = null;

  constructor(private readonly deps: LoomServerDeps) {
    super();
  }

  setClient(client: RpcStub<LoomClientApi>) {
    this.#client = client;
  }

  async saveWorkspace() {
    return this.loadWorkspace();
  }

  async loadWorkspace() {
    const [problemStatement, layout, nodes, edges] = await Promise.all([
      this.deps.workspace.getProblemStatement(),
      this.deps.workspace.getLayout(),
      this.deps.store.listNodes(),
      this.deps.store.listEdges(),
    ]);

    if (!problemStatement.isOk()) return rpcErr(problemStatement.error);
    if (!layout.isOk()) return rpcErr(layout.error);
    if (!nodes.isOk()) return rpcErr(nodes.error);
    if (!edges.isOk()) return rpcErr(edges.error);

    return rpcOk(
      {
        problemStatement: problemStatement.value,
        layout: layout.value,
        nodes: nodes.value,
        edges: edges.value,
      } satisfies WorkspaceSnapshot,
    );
  }

  async listSnapshots() {
    return rpcOk<string[]>([]);
  }

  async getLayout() {
    const result = await this.deps.workspace.getLayout();
    return result.isOk() ? rpcOk(result.value) : rpcErr(result.error);
  }

  async setLayout(layout: unknown) {
    return toRpcResult(await this.deps.workspace.setLayout(layout));
  }

  async listNodes() {
    return toRpcResult(await this.deps.store.listNodes());
  }

  async addNode(input: Parameters<GraphStore["addNode"]>[0]) {
    return toRpcResult(await this.deps.store.addNode(input));
  }

  async updateNode(id: string, input: Parameters<GraphStore["updateNode"]>[1]) {
    return toRpcResult(await this.deps.store.updateNode(id, input));
  }

  async deleteNode(id: string) {
    return toRpcResult(await this.deps.store.deleteNode(id));
  }

  async listEdges() {
    return toRpcResult(await this.deps.store.listEdges());
  }

  async addEdge(input: Parameters<GraphStore["addEdge"]>[0]) {
    return toRpcResult(await this.deps.store.addEdge(input));
  }

  async updateEdge(id: string, input: Parameters<GraphStore["updateEdge"]>[1]) {
    return toRpcResult(await this.deps.store.updateEdge(id, input));
  }

  async deleteEdge(id: string) {
    return toRpcResult(await this.deps.store.deleteEdge(id));
  }

  async queryDownstream(id: string, hops?: number) {
    return toRpcResult(await this.deps.store.downstreamOf(id, hops));
  }

  async queryUpstream(id: string, hops?: number) {
    return toRpcResult(await this.deps.store.upstreamOf(id, hops));
  }

  async setProblemStatement(problemStatement: string) {
    return toRpcResult(
      await this.deps.workspace.setProblemStatement(problemStatement),
    );
  }

  async getProblemStatement() {
    const result = await this.deps.workspace.getProblemStatement();
    return result.isOk() ? rpcOk(result.value) : rpcErr(result.error);
  }

  async streamChat(message: string) {
    const result = await this.deps.assistant.streamChat({
      chatId: "local",
      userMessage: message,
      onEvent: async (event) => {
        if (!this.#client) {
          return;
        }

        await this.#client.onAgentMessage(event);
      },
    });

    if (!result.isOk()) {
      void this.deps.log.warn`Assistant stream failed: ${result.error}`;
      return toRpcResult(result);
    }

    return rpcOk(undefined);
  }

  async verify() {
    if (this.#client) {
      await this.#client.onVerifyProgress({
        phase: "stub",
        completed: 0,
        total: 0,
      });
    }

    return rpcOk({ status: "stub" as const });
  }

  async shrink() {
    return rpcOk({ status: "stub" as const });
  }

  async getTrace() {
    return toRpcResult(await this.deps.store.readTrace());
  }
}
