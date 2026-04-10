import type { RpcTarget } from "capnweb";

export type VerifyProgress = {
  phase: string;
  completed: number;
  total: number;
};

export type AgentMutation = {
  type: string;
  payload?: unknown;
};

export type AgentMessage =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "done" };

export interface LoomClientApi extends RpcTarget {
  onVerifyProgress(progress: VerifyProgress): Promise<void> | void;
  onAgentMutation(mutation: AgentMutation): Promise<void> | void;
  onAgentMessage(message: AgentMessage): Promise<void> | void;
}
