import type { Generated } from "kysely";

export type NodeKind = "tick" | "stock" | "variable" | "process";

export type EdgeKind =
  | "passthrough"
  | "channel"
  | "flow"
  | "dependency"
  | "ownership"
  | "causation"
  | "custom";

export type NodesTable = {
  id: string;
  kind: NodeKind;
  schema: string;
  behavior: string | null;
  config: string;
  meta: string;
  createdAt: Generated<string>;
};

export type EdgesTable = {
  id: string;
  sourceNode: string;
  sourcePort: string | null;
  targetNode: string;
  targetPort: string | null;
  kind: EdgeKind;
  behavior: string | null;
  config: string;
  meta: string;
  createdAt: Generated<string>;
};

export type TraceTable = {
  tick: number;
  entityId: string;
  entityType: "node" | "edge";
  state: string;
  log: string | null;
};

export type PropertiesTable = {
  id: string;
  kind: "invariant" | "liveness" | "statistical";
  description: string | null;
  checkSource: string;
  config: string;
};

export type WorkspaceMetaTable = {
  key: string;
  value: string;
};

export type LoomDatabase = {
  nodes: NodesTable;
  edges: EdgesTable;
  trace: TraceTable;
  properties: PropertiesTable;
  workspace_meta: WorkspaceMetaTable;
};
