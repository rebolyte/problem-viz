import type { NodeSchemaV2 } from "./schema.ts";

export type NodeKind = "tick" | "stock" | "variable" | "process";

export type EdgeKind =
  | "passthrough"
  | "channel"
  | "flow"
  | "dependency"
  | "ownership"
  | "causation"
  | "custom";

export type NodeDef = {
  id: string;
  kind: NodeKind;
  schema: NodeSchemaV2;
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

export type EntityState =
  | { kind: "tick"; context: unknown; outputs: Record<string, unknown> }
  | { kind: "stock"; value: number }
  | { kind: "variable"; value: number }
  | { kind: "process"; suspended: true }
  | { kind: "flow"; rate: number }
  | { kind: "channel"; pending: number }
  | { kind: "passthrough"; lastValue: unknown }
  | {
      kind: "error";
      archetype: NodeKind | EdgeKind;
      phase: "compile" | "runtime";
      message: string;
      tick: number;
    };

export type ErrorEntityState = Extract<EntityState, { kind: "error" }>;

export type TickSnapshot = {
  tick: number;
  entities: Array<{ id: string; type: "node" | "edge"; state: EntityState }>;
};

export type Trace = TickSnapshot[];
