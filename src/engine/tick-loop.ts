import { makePrng } from "./prng.ts";
import type { GraphDef, RunConfig, TickSnapshot } from "./types.ts";

export async function* runSimulation(
  graph: GraphDef,
  opts: RunConfig,
  onTick?: (snapshot: TickSnapshot) => void,
): AsyncGenerator<TickSnapshot, { finalTick: number }, void> {
  const rand = makePrng(opts.seed);

  for (let tick = opts.fromTick; tick <= opts.toTick; tick += 1) {
    const snapshot: TickSnapshot = {
      tick,
      entities: graph.nodes.map((node) => ({
        id: node.id,
        type: "node" as const,
        state: {
          kind: "tick",
          context: { seed: opts.seed, tick, nodeKind: node.kind, rand: rand() },
          outputs: {},
        },
      })),
    };

    onTick?.(snapshot);
    yield snapshot;
  }

  return { finalTick: opts.toTick };
}
