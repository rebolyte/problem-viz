import type { RpcTarget } from "capnweb";
import type {
  CreateEdgeInput,
  CreateNodeInput,
  GraphEdge,
  GraphNode,
  GraphTraceRow,
  UpdateEdgeInput,
  UpdateNodeInput,
} from "../server/graph/store.ts";
import type { RpcResult } from "./result.ts";

export type WorkspaceSnapshot = {
  problemStatement: string;
  layout: unknown;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export interface LoomServerApi extends RpcTarget {
  saveWorkspace(): Promise<RpcResult<WorkspaceSnapshot>>;
  loadWorkspace(): Promise<RpcResult<WorkspaceSnapshot>>;
  listSnapshots(): Promise<RpcResult<string[]>>;
  getLayout(): Promise<RpcResult<unknown>>;
  setLayout(layout: unknown): Promise<RpcResult<void>>;
  listNodes(): Promise<RpcResult<GraphNode[]>>;
  addNode(input: CreateNodeInput): Promise<RpcResult<GraphNode>>;
  updateNode(id: string, input: UpdateNodeInput): Promise<RpcResult<GraphNode | null>>;
  deleteNode(id: string): Promise<RpcResult<void>>;
  listEdges(): Promise<RpcResult<GraphEdge[]>>;
  addEdge(input: CreateEdgeInput): Promise<RpcResult<GraphEdge>>;
  updateEdge(id: string, input: UpdateEdgeInput): Promise<RpcResult<GraphEdge | null>>;
  deleteEdge(id: string): Promise<RpcResult<void>>;
  queryDownstream(id: string, hops?: number): Promise<RpcResult<string[]>>;
  queryUpstream(id: string, hops?: number): Promise<RpcResult<string[]>>;
  setProblemStatement(problemStatement: string): Promise<RpcResult<void>>;
  getProblemStatement(): Promise<RpcResult<string>>;
  streamChat(message: string): Promise<RpcResult<void>>;
  verify(config?: unknown): Promise<RpcResult<{ status: "stub" }>>;
  shrink(seed?: number, property?: string): Promise<RpcResult<{ status: "stub" }>>;
  getTrace(seed?: number): Promise<RpcResult<GraphTraceRow[]>>;
}
