import type { RpcTarget } from "capnweb";
import type { TickSnapshot, Trace } from "../engine/types.ts";

export interface SimClientApi extends RpcTarget {
  onTick(snapshot: TickSnapshot): Promise<void> | void;
  onComplete(trace: Trace): Promise<void> | void;
}
