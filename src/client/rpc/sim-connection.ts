import { newMessagePortRpcSession } from "capnweb";
import type { SimEngineApi } from "../../rpc/sim-engine.ts";
import type { SimClientApi } from "../../rpc/sim-client.ts";

const SIM_WORKER_PATH = "/assets/sim-worker.js";
const simWorkerUrl = () => new URL(SIM_WORKER_PATH, window.location.origin).href;

export const connectSimWorker = async (clientImpl: SimClientApi): Promise<SimEngineApi> => {
  const worker = new Worker(simWorkerUrl(), { type: "module" });
  const channel = new MessageChannel();

  channel.port2.start();
  worker.postMessage({ type: "connect", port: channel.port1 }, [channel.port1]);

  return newMessagePortRpcSession<SimEngineApi>(channel.port2, clientImpl);
};

export { simWorkerUrl };
