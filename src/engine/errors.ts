import type { EdgeKind, ErrorEntityState, NodeKind } from "./types.ts";

export type LoomError = { code: string; message: string; cause?: unknown };

export const loomError = (code: string, message: string, cause?: unknown): LoomError => ({
  code,
  message,
  cause,
});

export const errorState = (
  archetype: NodeKind | EdgeKind,
  phase: "compile" | "runtime",
  message: string,
  tick: number,
): ErrorEntityState => ({ kind: "error", archetype, phase, message, tick });
