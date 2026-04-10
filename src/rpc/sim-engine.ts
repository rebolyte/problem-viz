import type { RpcTarget } from "capnweb";
import type { GraphDef, RunConfig, Trace } from "../engine/types.ts";
import type { RpcResult } from "./result.ts";

export interface SimEngineApi extends RpcTarget {
  loadGraph(graph: GraphDef): Promise<RpcResult<void>>;
  run(config: RunConfig): Promise<RpcResult<Trace>>;
  runStreaming(config: RunConfig): Promise<RpcResult<{ status: "stub" }>>;
  compile(source: string): Promise<RpcResult<void>>;
}
