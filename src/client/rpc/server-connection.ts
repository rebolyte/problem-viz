import { newWebSocketRpcSession } from "capnweb";
import type { LoomServerApi } from "../../rpc/loom-server.ts";
import type { LoomClientApi } from "../../rpc/loom-client.ts";

const rpcUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/loom/rpc`;
};

export const connectLoomServer = async (clientImpl: LoomClientApi): Promise<LoomServerApi> =>
  newWebSocketRpcSession<LoomServerApi>(rpcUrl(), clientImpl);
