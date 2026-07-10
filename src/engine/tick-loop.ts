import { Result } from "better-result";
import type { EdgeDef, EntityState, GraphDef, NodeDef, RunConfig, TickSnapshot } from "./types.ts";
import { errorState } from "./errors.ts";
import { makePrng } from "./prng.ts";
import { buildTopoOrder, gatherInputs, incomingPassthrough } from "./routing.ts";
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

type RunContext = {
  graph: GraphDef;
  compiledNodes: Map<string, Result<CompiledNodeBehavior, unknown>>;
  compiledEdges: Map<string, Result<CompiledEdgeBehavior, unknown>>;
  topoOrder: string[];
  nodesById: Map<string, NodeDef>;
  incoming: Map<string, EdgeDef[]>;
};

const errMessage = (result: { error: unknown }): string => {
  const error = result.error as { message?: string } | undefined;
  return error?.message ?? String(result.error);
};

const compileErrorFor = (
  entityKind: NodeDef["kind"] | "flow",
  compiled: Result<unknown, unknown>,
  tick: number,
): EntityState | null =>
  compiled.isOk()
    ? null
    : errorState(entityKind, "compile", errMessage(compiled as { error: unknown }), tick);

const initNonVariableState = (
  node: NodeDef,
  compiled: Result<CompiledNodeBehavior, unknown>,
  tick: number,
): EntityState => {
  const compileError = compileErrorFor(node.kind, compiled, tick);
  if (compileError) return compileError;
  const behavior = (compiled as { value: CompiledNodeBehavior }).value;

  if (node.kind === "stock") {
    return initStock(node, behavior, tick);
  }

  if (node.kind === "tick") {
    const ctx = initTickContext(node, behavior);
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

// S2 phase 1: variables evaluate in topo order. Sources already computed this
// tick deliver current values; everything else falls back to prev (see routing).
const evalVariables = (
  ctx: RunContext,
  current: Map<string, EntityState>,
  prev: Map<string, EntityState>,
  deliveries: Map<string, unknown>,
  meta: { tick: number; rand: () => number },
) => {
  for (const id of ctx.topoOrder) {
    const node = ctx.nodesById.get(id)!;
    if (node.kind !== "variable") continue;

    const prevState = prev.get(id);
    if (prevState?.kind === "error") {
      current.set(id, prevState);
      continue;
    }

    const compiled = ctx.compiledNodes.get(id)!;
    const compileError = compileErrorFor(node.kind, compiled, meta.tick);
    if (compileError) {
      current.set(id, compileError);
      continue;
    }

    const inputs = gatherInputs(node, ctx.incoming, { current, prev }, deliveries);
    current.set(
      id,
      runVariable(node, (compiled as { value: CompiledNodeBehavior }).value, {
        inputs,
        tick: meta.tick,
        rand: meta.rand,
      }),
    );
  }
};

// S2 phase 2: flow rates read current-tick variables and prev-tick stocks.
const evalFlowEdges = (
  ctx: RunContext,
  current: Map<string, EntityState>,
  prev: SimState,
  meta: { tick: number; rand: () => number },
): Map<string, EntityState> => {
  const edgeStates = new Map<string, EntityState>();
  for (const edge of ctx.graph.edges) {
    if (edge.kind !== "flow") continue;

    const prevEdgeState = prev.edges.get(edge.id);
    if (prevEdgeState?.kind === "error") {
      edgeStates.set(edge.id, prevEdgeState);
      continue;
    }

    const compiled = ctx.compiledEdges.get(edge.id)!;
    const compileError = compileErrorFor("flow", compiled, meta.tick);
    if (compileError) {
      edgeStates.set(edge.id, compileError);
      continue;
    }

    const sourceState = current.get(edge.source.node) ?? prev.nodes.get(edge.source.node);
    if (sourceState?.kind === "error") {
      edgeStates.set(
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

    const sourceValue =
      sourceState?.kind === "stock" || sourceState?.kind === "variable"
        ? sourceState.value
        : undefined;
    const rateResult = evalFlowRate(edge, (compiled as { value: CompiledEdgeBehavior }).value, {
      sourceValue,
      tick: meta.tick,
      rand: meta.rand,
    });
    if (rateResult.isOk()) {
      edgeStates.set(edge.id, { kind: "flow", rate: rateResult.value });
    } else {
      edgeStates.set(
        edge.id,
        errorState("flow", "runtime", errMessage(rateResult as { error: unknown }), meta.tick),
      );
    }
  }
  return edgeStates;
};

// S2 phase 3 + S9 poisoning: stocks integrate prev values; an errored flow
// edge errors the stocks it touches rather than being silently dropped.
const integrateStocks = (
  ctx: RunContext,
  current: Map<string, EntityState>,
  edgeStates: Map<string, EntityState>,
  prev: SimState,
  tick: number,
) => {
  const flowEdges = ctx.graph.edges.filter((e) => e.kind === "flow");
  for (const node of ctx.graph.nodes) {
    if (node.kind !== "stock") continue;

    const prevState = prev.nodes.get(node.id);
    if (prevState?.kind === "error") {
      current.set(node.id, prevState);
      continue;
    }

    const inflowEdges = flowEdges.filter((e) => e.target.node === node.id);
    const outflowEdges = flowEdges.filter(
      (e) => e.source.node === node.id && e.source.node !== e.target.node,
    );
    const erroredEdge = [...inflowEdges, ...outflowEdges].find(
      (e) => edgeStates.get(e.id)?.kind === "error",
    );
    if (erroredEdge) {
      current.set(
        node.id,
        errorState(
          "stock",
          "runtime",
          `Node ${node.id} depends on errored flow edge ${erroredEdge.id}`,
          tick,
        ),
      );
      continue;
    }

    const rateOf = (edgeId: string): number => {
      const state = edgeStates.get(edgeId);
      return state?.kind === "flow" ? state.rate : 0;
    };
    current.set(
      node.id,
      integrateStock(
        prevState as StockState,
        inflowEdges.map((e) => rateOf(e.id)),
        outflowEdges.map((e) => rateOf(e.id)),
        { nodeId: node.id, tick },
      ),
    );
  }
};

// S2 phase 5: tick/process nodes in topo order with routed same-tick inputs.
const stepActiveNodes = (
  ctx: RunContext,
  current: Map<string, EntityState>,
  prev: Map<string, EntityState>,
  deliveries: Map<string, unknown>,
  meta: { tick: number; rand: () => number },
) => {
  for (const id of ctx.topoOrder) {
    const node = ctx.nodesById.get(id)!;
    if (node.kind === "variable" || node.kind === "stock") continue;

    const prevState = prev.get(id);
    if (prevState?.kind === "error") {
      current.set(id, prevState);
      continue;
    }

    const compiled = ctx.compiledNodes.get(id)!;
    const compileError = compileErrorFor(node.kind, compiled, meta.tick);
    if (compileError) {
      current.set(id, compileError);
      continue;
    }

    if (node.kind === "process") {
      current.set(id, { kind: "process", suspended: true });
      continue;
    }

    const inputs = gatherInputs(node, ctx.incoming, { current, prev }, deliveries);
    const prevContext = prevState?.kind === "tick" ? prevState.context : null;
    const result = runTick(node, (compiled as { value: CompiledNodeBehavior }).value, {
      prevContext,
      inputs,
      tick: meta.tick,
      rand: meta.rand,
    });
    if (result.isOk()) {
      current.set(id, result.value);
    } else {
      current.set(
        id,
        errorState("tick", "runtime", errMessage(result as { error: unknown }), meta.tick),
      );
    }
  }
};

const nonFlowEdgeStates = (
  ctx: RunContext,
  deliveries: Map<string, unknown>,
): Map<string, EntityState> => {
  const states = new Map<string, EntityState>();
  for (const edge of ctx.graph.edges) {
    if (edge.kind === "flow" || STRUCTURAL_EDGE_KINDS.has(edge.kind)) continue;
    if (edge.kind === "passthrough") {
      states.set(edge.id, { kind: "passthrough", lastValue: deliveries.get(edge.id) ?? null });
    } else {
      states.set(edge.id, { kind: "channel", pending: 0 });
    }
  }
  return states;
};

const initialState = (ctx: RunContext, fromTick: number, rand: () => number): SimState => {
  const nodes = new Map<string, EntityState>();
  const deliveries = new Map<string, unknown>();

  for (const node of ctx.graph.nodes) {
    if (node.kind === "variable") continue;
    nodes.set(node.id, initNonVariableState(node, ctx.compiledNodes.get(node.id)!, fromTick));
  }
  evalVariables(ctx, nodes, new Map(), deliveries, { tick: fromTick, rand });

  const edges = new Map<string, EntityState>();
  for (const edge of ctx.graph.edges) {
    if (STRUCTURAL_EDGE_KINDS.has(edge.kind)) continue;
    if (edge.kind === "flow") {
      const compileError = compileErrorFor("flow", ctx.compiledEdges.get(edge.id)!, fromTick);
      edges.set(edge.id, compileError ?? { kind: "flow", rate: 0 });
    }
  }
  for (const [id, state] of nonFlowEdgeStates(ctx, deliveries)) {
    edges.set(id, state);
  }

  return { nodes, edges };
};

const stepTick = (
  ctx: RunContext,
  prev: SimState,
  meta: { tick: number; rand: () => number },
): SimState => {
  const current = new Map<string, EntityState>();
  const deliveries = new Map<string, unknown>();

  evalVariables(ctx, current, prev.nodes, deliveries, meta);
  const edgeStates = evalFlowEdges(ctx, current, prev, meta);
  integrateStocks(ctx, current, edgeStates, prev, meta.tick);
  stepActiveNodes(ctx, current, prev.nodes, deliveries, meta);

  for (const [id, state] of nonFlowEdgeStates(ctx, deliveries)) {
    edgeStates.set(id, state);
  }

  return { nodes: current, edges: edgeStates };
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
  const ctx: RunContext = {
    graph,
    compiledNodes: new Map(graph.nodes.map((n) => [n.id, compileNodeBehavior(n.behavior, n.kind)])),
    compiledEdges: new Map(graph.edges.map((e) => [e.id, compileEdgeBehavior(e.behavior, e.kind)])),
    topoOrder: buildTopoOrder(graph),
    nodesById: new Map(graph.nodes.map((n) => [n.id, n])),
    incoming: incomingPassthrough(graph),
  };

  let state = initialState(ctx, opts.fromTick, rand);

  for (let tick = opts.fromTick; tick <= opts.toTick; tick += 1) {
    if (tick !== opts.fromTick) {
      state = stepTick(ctx, state, { tick, rand });
    }
    const snapshot = buildSnapshot(tick, state, graph);
    onTick?.(snapshot);
    yield snapshot;
  }

  return { finalTick: opts.toTick };
}
