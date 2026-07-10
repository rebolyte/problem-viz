import { Result } from "better-result";
import type { GraphDef, NodeDef, RunConfig, TickSnapshot, EntityState } from "./types.ts";
import { makePrng } from "./prng.ts";
import {
  compileNodeBehavior,
  compileEdgeBehavior,
  type CompiledNodeBehavior,
  type CompiledEdgeBehavior,
} from "./compile/compile-behavior.ts";
import { runVariable } from "./archetypes/variable.ts";
import { initStock, integrateStock } from "./archetypes/stock.ts";
import { evalFlowRate } from "./archetypes/flow-edge.ts";
import { runTick, initTickContext } from "./archetypes/tick.ts";

type StockState = Extract<EntityState, { kind: "stock" }>;
type NodeState = EntityState;

type SimState = {
  nodes: Map<string, NodeState>;
};

const STRUCTURAL_EDGE_KINDS = new Set(["dependency", "ownership", "causation"]);

const initialNodeState = (
  node: NodeDef,
  compiled: Result<CompiledNodeBehavior, unknown>,
): NodeState => {
  if (!compiled.isOk()) {
    return {
      kind: "tick",
      context: { compileError: String((compiled as { error: unknown }).error) },
      outputs: {},
    };
  }

  if (node.kind === "stock") {
    return initStock(node);
  }

  if (node.kind === "variable") {
    return runVariable(node);
  }

  if (node.kind === "tick") {
    const ctx = initTickContext(node, compiled.value);
    return {
      kind: "tick",
      context: ctx.isOk() ? ctx.value : { compileError: String((ctx as { error: unknown }).error) },
      outputs: {},
    };
  }

  if (node.kind === "process") {
    return { kind: "process", suspended: true };
  }

  return { kind: "tick", context: null, outputs: {} };
};

const initialState = (
  graph: GraphDef,
  compiledNodes: Map<string, Result<CompiledNodeBehavior, unknown>>,
): SimState => ({
  nodes: new Map(
    graph.nodes.map((node) => [node.id, initialNodeState(node, compiledNodes.get(node.id)!)]),
  ),
});

const stepTick = (
  graph: GraphDef,
  compiledNodes: Map<string, Result<CompiledNodeBehavior, unknown>>,
  compiledEdges: Map<string, Result<CompiledEdgeBehavior, unknown>>,
  prev: SimState,
  meta: { tick: number; rand: () => number },
): { state: SimState; snapshot: TickSnapshot } => {
  const flowEdges = graph.edges.filter((e) => e.kind === "flow");

  const flowRates = new Map<string, number>();
  for (const edge of flowEdges) {
    const compiledEdge = compiledEdges.get(edge.id);
    if (!compiledEdge?.isOk()) {
      flowRates.set(edge.id, 0);
      continue;
    }
    const sourceState = prev.nodes.get(edge.source.node);
    const sourceValue = sourceState?.kind === "stock" ? sourceState.value : 0;
    const rateResult = evalFlowRate(edge, compiledEdge.value, {
      sourceValue,
      tick: meta.tick,
      rand: meta.rand,
    });
    flowRates.set(edge.id, rateResult.isOk() ? rateResult.value : 0);
  }

  const nextNodes = new Map<string, NodeState>();

  for (const node of graph.nodes) {
    const compiled = compiledNodes.get(node.id);

    if (!compiled?.isOk()) {
      const errStr = String(
        (compiled as { error: unknown } | undefined)?.error ?? "compile failed",
      );
      nextNodes.set(node.id, { kind: "tick", context: { compileError: errStr }, outputs: {} });
      continue;
    }

    if (node.kind === "stock") {
      const prevState = prev.nodes.get(node.id) as StockState;
      const inflows = flowEdges
        .filter((e) => e.target.node === node.id)
        .map((e) => flowRates.get(e.id) ?? 0);
      const outflows = flowEdges
        .filter((e) => e.source.node === node.id && e.source.node !== e.target.node)
        .map((e) => flowRates.get(e.id) ?? 0);
      nextNodes.set(node.id, integrateStock(prevState, inflows, outflows));
      continue;
    }

    if (node.kind === "variable") {
      nextNodes.set(node.id, runVariable(node));
      continue;
    }

    if (node.kind === "tick") {
      const prevState = prev.nodes.get(node.id);
      const prevContext = prevState?.kind === "tick" ? prevState.context : null;
      const result = runTick(node, compiled.value, {
        prevContext,
        inputs: {},
        tick: meta.tick,
        rand: meta.rand,
      });
      if (result.isOk()) {
        nextNodes.set(node.id, result.value);
      } else {
        nextNodes.set(node.id, {
          kind: "tick",
          context: { compileError: String((result as { error: unknown }).error) },
          outputs: {},
        });
      }
      continue;
    }

    if (node.kind === "process") {
      nextNodes.set(node.id, { kind: "process", suspended: true });
      continue;
    }

    nextNodes.set(node.id, { kind: "tick", context: null, outputs: {} });
  }

  const nextState: SimState = { nodes: nextNodes };

  const nodeEntities = graph.nodes.map((node) => ({
    id: node.id,
    type: "node" as const,
    state: nextNodes.get(node.id)!,
  }));

  const edgeEntities = graph.edges
    .filter((e) => !STRUCTURAL_EDGE_KINDS.has(e.kind))
    .map((edge) => {
      let state: EntityState;
      if (edge.kind === "flow") {
        state = { kind: "flow", rate: flowRates.get(edge.id) ?? 0 };
      } else if (edge.kind === "channel") {
        state = { kind: "channel", pending: 0 };
      } else {
        state = { kind: "channel", pending: 0 };
      }
      return { id: edge.id, type: "edge" as const, state };
    });

  const snapshot: TickSnapshot = {
    tick: meta.tick,
    entities: [...nodeEntities, ...edgeEntities],
  };

  return { state: nextState, snapshot };
};

const buildInitialSnapshot = (tick: number, state: SimState, graph: GraphDef): TickSnapshot => {
  const nodeEntities = graph.nodes.map((node) => ({
    id: node.id,
    type: "node" as const,
    state: state.nodes.get(node.id)!,
  }));

  const edgeEntities = graph.edges
    .filter((e) => !STRUCTURAL_EDGE_KINDS.has(e.kind))
    .map((edge) => {
      let state: EntityState;
      if (edge.kind === "flow") {
        state = { kind: "flow", rate: 0 };
      } else if (edge.kind === "channel") {
        state = { kind: "channel", pending: 0 };
      } else {
        state = { kind: "channel", pending: 0 };
      }
      return { id: edge.id, type: "edge" as const, state };
    });

  return { tick, entities: [...nodeEntities, ...edgeEntities] };
};

const sortById = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export async function* runSimulation(
  input: GraphDef,
  opts: RunConfig,
  onTick?: (snapshot: TickSnapshot) => void,
): AsyncGenerator<TickSnapshot, { finalTick: number }, void> {
  const graph: GraphDef = { nodes: sortById(input.nodes), edges: sortById(input.edges) };
  const rand = makePrng(opts.seed);
  const compiledNodes = new Map(
    graph.nodes.map((n) => [n.id, compileNodeBehavior(n.behavior, n.kind)]),
  );
  const compiledEdges = new Map(
    graph.edges.map((e) => [e.id, compileEdgeBehavior(e.behavior, e.kind)]),
  );

  let state = initialState(graph, compiledNodes);

  for (let tick = opts.fromTick; tick <= opts.toTick; tick += 1) {
    if (tick === opts.fromTick) {
      const snapshot = buildInitialSnapshot(tick, state, graph);
      onTick?.(snapshot);
      yield snapshot;
    } else {
      const stepped = stepTick(graph, compiledNodes, compiledEdges, state, { tick, rand });
      state = stepped.state;
      onTick?.(stepped.snapshot);
      yield stepped.snapshot;
    }
  }

  return { finalTick: opts.toTick };
}
