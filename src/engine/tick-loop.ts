import { Result } from "better-result";
import type { EntityState, GraphDef, NodeDef, RunConfig, TickSnapshot } from "./types.ts";
import { errorState } from "./errors.ts";
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

type SimState = {
  nodes: Map<string, EntityState>;
  edges: Map<string, EntityState>;
};

const STRUCTURAL_EDGE_KINDS = new Set(["dependency", "ownership", "causation"]);

const errMessage = (result: { error: unknown }): string => {
  const error = result.error as { message?: string } | undefined;
  return error?.message ?? String(result.error);
};

const initialNodeState = (
  node: NodeDef,
  compiled: Result<CompiledNodeBehavior, unknown>,
  tick: number,
): EntityState => {
  if (!compiled.isOk()) {
    return errorState(node.kind, "compile", errMessage(compiled as { error: unknown }), tick);
  }

  if (node.kind === "stock") {
    return initStock(node, tick);
  }

  if (node.kind === "variable") {
    return runVariable(node, tick);
  }

  if (node.kind === "tick") {
    const ctx = initTickContext(node, compiled.value);
    if (!ctx.isOk()) {
      return errorState(node.kind, "runtime", errMessage(ctx as { error: unknown }), tick);
    }
    return { kind: "tick", context: ctx.value, outputs: {} };
  }

  if (node.kind === "process") {
    return { kind: "process", suspended: true };
  }

  return { kind: "tick", context: null, outputs: {} };
};

const initialEdgeState = (
  edgeKind: string,
  compiled: Result<CompiledEdgeBehavior, unknown> | undefined,
  tick: number,
): EntityState => {
  if (edgeKind === "flow") {
    if (compiled && !compiled.isOk()) {
      return errorState("flow", "compile", errMessage(compiled as { error: unknown }), tick);
    }
    return { kind: "flow", rate: 0 };
  }
  return { kind: "channel", pending: 0 };
};

const initialState = (
  graph: GraphDef,
  compiledNodes: Map<string, Result<CompiledNodeBehavior, unknown>>,
  compiledEdges: Map<string, Result<CompiledEdgeBehavior, unknown>>,
  fromTick: number,
): SimState => ({
  nodes: new Map(
    graph.nodes.map((node) => [
      node.id,
      initialNodeState(node, compiledNodes.get(node.id)!, fromTick),
    ]),
  ),
  edges: new Map(
    graph.edges.map((edge) => [
      edge.id,
      initialEdgeState(edge.kind, compiledEdges.get(edge.id), fromTick),
    ]),
  ),
});

const stepTick = (
  graph: GraphDef,
  compiledNodes: Map<string, Result<CompiledNodeBehavior, unknown>>,
  compiledEdges: Map<string, Result<CompiledEdgeBehavior, unknown>>,
  prev: SimState,
  meta: { tick: number; rand: () => number },
): SimState => {
  const flowEdges = graph.edges.filter((e) => e.kind === "flow");

  const nextEdges = new Map<string, EntityState>();
  for (const edge of graph.edges) {
    if (edge.kind !== "flow") {
      nextEdges.set(edge.id, prev.edges.get(edge.id) ?? { kind: "channel", pending: 0 });
      continue;
    }

    const prevEdgeState = prev.edges.get(edge.id);
    if (prevEdgeState?.kind === "error") {
      nextEdges.set(edge.id, prevEdgeState);
      continue;
    }

    const sourceState = prev.nodes.get(edge.source.node);
    if (sourceState?.kind === "error") {
      nextEdges.set(
        edge.id,
        errorState(
          "flow",
          "runtime",
          `Edge ${edge.id} source ${edge.source.node} is in error state`,
          meta.tick,
        ),
      );
      continue;
    }

    const compiledEdge = compiledEdges.get(edge.id)!;
    if (!compiledEdge.isOk()) {
      nextEdges.set(
        edge.id,
        errorState("flow", "compile", errMessage(compiledEdge as { error: unknown }), meta.tick),
      );
      continue;
    }

    const sourceValue = sourceState?.kind === "stock" ? sourceState.value : 0;
    const rateResult = evalFlowRate(edge, compiledEdge.value, {
      sourceValue,
      tick: meta.tick,
      rand: meta.rand,
    });
    if (rateResult.isOk()) {
      nextEdges.set(edge.id, { kind: "flow", rate: rateResult.value });
    } else {
      nextEdges.set(
        edge.id,
        errorState("flow", "runtime", errMessage(rateResult as { error: unknown }), meta.tick),
      );
    }
  }

  const nextNodes = new Map<string, EntityState>();

  for (const node of graph.nodes) {
    const prevState = prev.nodes.get(node.id);
    if (prevState?.kind === "error") {
      nextNodes.set(node.id, prevState);
      continue;
    }

    const compiled = compiledNodes.get(node.id)!;
    if (!compiled.isOk()) {
      nextNodes.set(
        node.id,
        errorState(node.kind, "compile", errMessage(compiled as { error: unknown }), meta.tick),
      );
      continue;
    }

    if (node.kind === "stock") {
      const inflowEdges = flowEdges.filter((e) => e.target.node === node.id);
      const outflowEdges = flowEdges.filter(
        (e) => e.source.node === node.id && e.source.node !== e.target.node,
      );
      const erroredEdge = [...inflowEdges, ...outflowEdges].find(
        (e) => nextEdges.get(e.id)?.kind === "error",
      );
      if (erroredEdge) {
        nextNodes.set(
          node.id,
          errorState(
            "stock",
            "runtime",
            `Node ${node.id} depends on errored flow edge ${erroredEdge.id}`,
            meta.tick,
          ),
        );
        continue;
      }
      const rateOf = (edgeId: string): number => {
        const state = nextEdges.get(edgeId);
        return state?.kind === "flow" ? state.rate : 0;
      };
      nextNodes.set(
        node.id,
        integrateStock(
          prevState as StockState,
          inflowEdges.map((e) => rateOf(e.id)),
          outflowEdges.map((e) => rateOf(e.id)),
          { nodeId: node.id, tick: meta.tick },
        ),
      );
      continue;
    }

    if (node.kind === "variable") {
      nextNodes.set(node.id, runVariable(node, meta.tick));
      continue;
    }

    if (node.kind === "tick") {
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
        nextNodes.set(
          node.id,
          errorState("tick", "runtime", errMessage(result as { error: unknown }), meta.tick),
        );
      }
      continue;
    }

    if (node.kind === "process") {
      nextNodes.set(node.id, { kind: "process", suspended: true });
      continue;
    }

    nextNodes.set(node.id, { kind: "tick", context: null, outputs: {} });
  }

  return { nodes: nextNodes, edges: nextEdges };
};

const buildSnapshot = (tick: number, state: SimState, graph: GraphDef): TickSnapshot => {
  const nodeEntities = graph.nodes.map((node) => ({
    id: node.id,
    type: "node" as const,
    state: state.nodes.get(node.id)!,
  }));

  const edgeEntities = graph.edges
    .filter((e) => !STRUCTURAL_EDGE_KINDS.has(e.kind))
    .map((edge) => ({
      id: edge.id,
      type: "edge" as const,
      state: state.edges.get(edge.id)!,
    }));

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

  let state = initialState(graph, compiledNodes, compiledEdges, opts.fromTick);

  for (let tick = opts.fromTick; tick <= opts.toTick; tick += 1) {
    if (tick !== opts.fromTick) {
      state = stepTick(graph, compiledNodes, compiledEdges, state, { tick, rand });
    }
    const snapshot = buildSnapshot(tick, state, graph);
    onTick?.(snapshot);
    yield snapshot;
  }

  return { finalTick: opts.toTick };
}
