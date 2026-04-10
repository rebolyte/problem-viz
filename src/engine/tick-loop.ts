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
          seed: opts.seed,
          tick,
          kind: node.kind,
          rand: rand(),
        },
      })),
    };

    onTick?.(snapshot);
    yield snapshot;
  }

  return { finalTick: opts.toTick };
}
