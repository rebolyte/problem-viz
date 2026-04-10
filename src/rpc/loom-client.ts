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

export type AgentMessage = {
  type: "text" | "tool" | "done";
  text?: string;
  name?: string;
  input?: unknown;
};

export interface LoomClientApi extends RpcTarget {
  onVerifyProgress(progress: VerifyProgress): Promise<void> | void;
  onAgentMutation(mutation: AgentMutation): Promise<void> | void;
  onAgentMessage(message: AgentMessage): Promise<void> | void;
}
