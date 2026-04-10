import { RpcTarget, type RpcStub, newMessagePortRpcSession } from "capnweb";
import { runSimulation } from "../../engine/tick-loop.ts";
import type { GraphDef, RunConfig, Trace } from "../../engine/types.ts";
import type { RpcResult } from "../../rpc/result.ts";
import type { SimClientApi } from "../../rpc/sim-client.ts";
import type { SimEngineApi } from "../../rpc/sim-engine.ts";

const rpcOk = <T>(value: T): RpcResult<T> => ({ ok: true, value });
const rpcErr = (message: string): RpcResult<never> => ({ ok: false, error: { message } });

class SimEngineImpl extends RpcTarget implements SimEngineApi {
  #graph: GraphDef = { nodes: [], edges: [] };
  #client: RpcStub<SimClientApi> | null = null;

  attachClient(client: RpcStub<SimClientApi>) {
    this.#client = client;
  }

  async loadGraph(graph: GraphDef) {
    this.#graph = graph;
    return rpcOk(undefined);
  }

  async run(config: RunConfig) {
    const trace: Trace = [];

    for await (const snapshot of runSimulation(this.#graph, config)) {
      trace.push(snapshot);
    }

    return rpcOk(trace);
  }

  async runStreaming(config: RunConfig) {
    if (!this.#client) {
      return rpcErr("Simulation client not connected");
    }

    const trace: Trace = [];

    for await (const snapshot of runSimulation(this.#graph, config)) {
      trace.push(snapshot);
      await this.#client.onTick(snapshot);
    }

    await this.#client.onComplete(trace);
    return rpcOk({ status: "stub" as const });
  }

  async compile(_source: string) {
    return rpcOk(undefined);
  }
}

globalThis.addEventListener("message", (event: MessageEvent<{ type: string; port?: MessagePort }>) => {
  if (event.data.type !== "connect" || !event.data.port) {
    return;
  }

  const engine = new SimEngineImpl();
  event.data.port.start();
  const client = newMessagePortRpcSession<SimClientApi>(event.data.port, engine);
  engine.attachClient(client);
});

export {};
