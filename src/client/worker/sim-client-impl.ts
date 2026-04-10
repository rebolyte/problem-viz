import { RpcTarget } from "capnweb";
import type { TickSnapshot, Trace } from "../../engine/types.ts";
import type { SimClientApi } from "../../rpc/sim-client.ts";

export class SimClientImpl extends RpcTarget implements SimClientApi {
  constructor(
    private readonly appendTick: (snapshot: TickSnapshot) => void,
    private readonly onDone: (trace: Trace) => void,
  ) {
    super();
  }

  async onTick(snapshot: TickSnapshot) {
    this.appendTick(snapshot);
  }

  async onComplete(trace: Trace) {
    this.onDone(trace);
  }
}
