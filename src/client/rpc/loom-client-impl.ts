import { RpcTarget } from "capnweb";
import type {
  AgentMessage,
  AgentMutation,
  LoomClientApi,
  VerifyProgress,
} from "../../rpc/loom-client.ts";

type LoomClientEvent =
  | { type: "verify-progress"; payload: VerifyProgress }
  | { type: "agent-mutation"; payload: AgentMutation }
  | { type: "agent-message"; payload: AgentMessage };

export class LoomClientImpl extends RpcTarget implements LoomClientApi {
  constructor(private readonly onEvent: (event: LoomClientEvent) => void) {
    super();
  }

  async onVerifyProgress(progress: VerifyProgress) {
    this.onEvent({ type: "verify-progress", payload: progress });
  }

  async onAgentMutation(mutation: AgentMutation) {
    this.onEvent({ type: "agent-mutation", payload: mutation });
  }

  async onAgentMessage(message: AgentMessage) {
    this.onEvent({ type: "agent-message", payload: message });
  }
}
