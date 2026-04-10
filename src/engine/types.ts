export type NodeKind = "tick" | "stock" | "variable" | "process";

export type EdgeKind =
  | "passthrough"
  | "channel"
  | "flow"
  | "dependency"
  | "ownership"
  | "causation"
  | "custom";

export type NodeSchema = Record<string, unknown>;

export type NodeDef = {
  id: string;
  kind: NodeKind;
  schema: NodeSchema;
  behavior?: string;
  config: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type EdgeDef = {
  id: string;
  source: { node: string; port?: string };
  target: { node: string; port?: string };
  kind: EdgeKind;
  behavior?: string;
  config: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type GraphDef = {
  nodes: NodeDef[];
  edges: EdgeDef[];
};

export type RunConfig = {
  seed: number;
  fromTick: number;
  toTick: number;
  configOverrides?: Record<string, Record<string, unknown>>;
};

export type TickSnapshot = {
  tick: number;
  entities: Array<{ id: string; type: "node" | "edge"; state: unknown }>;
};

export type Trace = TickSnapshot[];
