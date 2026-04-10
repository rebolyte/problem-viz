# Loom Phase 2: Runnable Simulation + Agent Mutations

## Context

Phase 1 (`plans/prancy-splashing-clarke.md`) shipped the scaffolding: Dockview shell, React Flow canvas, capnweb RPC (WS + postMessage), SQLite graph store, workspace persistence, chat panel with streaming LLM. But the two things users actually need to _do work_ are stubs:

1. **The engine is a placeholder.** `src/engine/tick-loop.ts` emits `{ seed, tick, kind, rand }` for every node regardless of archetype. `defineNode`/`defineEdge` are identity functions. Node `behavior` text is ignored.
2. **The agent is read-only.** `streamChat` emits `tool_use` events to the client but the server never executes them — tool calls are effectively pantomime. `list_nodes`, `add_node`, `set_problem_statement`, etc. mutate nothing.

Phase 2 fixes both. After this phase, you can: describe a compound-interest model to the chat agent → it creates a stock + flow via real tool calls → you hit Run → the worker executes real `rate(stock.value, config)` each tick → the timeline scrubber shows the stock growing → a minimal timeline lens plots it.

**In scope:** tick nodes, stock/variable/flow archetypes, behavior compilation via `new Function()`, server-side agent tool dispatch, a seed example, timeline lens replacing the Recharts smoke test.

**Deferred to phase 3:** process-node generators, channel edges, control panel auto-discovery (drag-to-pin), properties + verify + shrinker, trace persistence, more lenses, sandboxed execution.

---

## Guiding decisions

- **Engine stays pure.** All runtime code lives in `src/engine/` — no DOM, no Bun, no capnweb imports. Must run identically in a Web Worker and (future) node:worker_threads.
- **Behaviors compile via `new Function()`.** No sandboxing yet — per design doc V1 defers smolVM/Firecracker. Each node's `behavior` TEXT is wrapped once, cached by source hash, and invoked per tick. Same for edge `behavior`.
- **Read-then-write tick phase.** The design doc is silent on ordering, but determinism demands it: read all inputs/stocks from tick `t`, compute new states, then commit to tick `t+1`. Without this, evaluation order leaks into results.
- **Archetype runtime lives in `src/engine/archetypes/`** — one module per archetype (`tick.ts`, `stock.ts`, `variable.ts`, `flow-edge.ts`). The tick loop dispatches on `node.kind` / `edge.kind`.
- **Process nodes + channel edges stubbed out.** `runArchetype` throws `LoomError('unsupported_archetype')` for these kinds. Phase 3 adds them.
- **Agent tool execution is a server-side dispatch table.** `src/server/domains/assistant/tool-handlers.ts` maps tool name → async handler taking `{ workspace, store }`. The stream loop, on each complete tool-use block, parses+validates via the existing Zod schemas and runs the handler. Results are fed back into the LLM as `tool_result` messages so it can continue reasoning.
- **Mutation broadcasts use the existing `onAgentMutation` callback.** After a successful tool handler, the server calls `client.onAgentMutation({ kind, payload })`; the client reducer re-fetches the affected slice (or patches directly).
- **Schemas gain a tiny typed shape.** Instead of `Record<string, unknown>`, node schemas get `{ config: Record<string, ConfigField>, inputs?, outputs?, context? }` where `ConfigField = { type: 'number'|'boolean'|'enum'|'string', default: unknown, min?, max?, step?, options? }`. This is the minimum needed to (a) give behaviors typed `config` at runtime and (b) unblock phase 3's control-panel auto-discovery without reshaping schemas again.
- **Snapshots gain real shape.** `TickSnapshot.entities[i].state` becomes `{ kind, context?, stockValue?, outputs?, flowRate? }` — a tagged union per archetype. The timeline lens reads `stockValue` for the stock in the seed example.

---

## Architecture changes

### New files

```
src/engine/
├── archetypes/
│   ├── tick.ts               (runTick: pure-function execution)
│   ├── stock.ts              (initStock + integrateStock)
│   ├── variable.ts           (runVariable: config.amount passthrough)
│   └── flow-edge.ts          (evalFlowRate)
├── compile/
│   ├── compile-behavior.ts   (text → callable, cached by sha)
│   └── compile-behavior.test.ts
├── schema.ts                 (ConfigField, NodeSchemaV2, validators — replaces inline Record types)
├── tick-loop.ts              (rewritten: read-then-write dispatch)
└── tick-loop.test.ts         (rewritten: archetype-aware assertions)

src/server/domains/assistant/
├── tool-handlers.ts          (dispatch table — tool name → handler)
└── tool-handlers.test.ts     (round-trips add_node/add_edge/set_problem_statement)

src/client/state/
└── seed-example.ts           (compound-interest graph factory — one stock + one flow + one variable)

src/client/shell/
└── node-inspector-panel.tsx  (NEW panel: shows selected node's schema.config read-only, lets user edit each field with a typed input → server.updateNode)

src/client/lenses/
├── timeline-lens.tsx         (real Recharts LineChart reading trace[].stockValue for selected node)
└── lens-registry.ts          (minimal registry: { timeline: TimelineLens, topology: TopologyStub })
```

### Modified files

- `src/engine/types.ts` — replace `NodeSchema = Record<string, unknown>` with the V2 shape (see below). Extend `TickSnapshot` entity state to tagged union.
- `src/engine/define-node.ts`, `src/engine/define-edge.ts` — stay as identity/pass-through (the compile step does the real work).
- `src/server/graph/schema.ts` + `migrations/0001_loom_schema.ts` — no migration change; `schema` column is already JSON. Update the `NodesTable.schema` Kysely type comment to reflect V2 shape.
- `src/server/graph/store.ts` — no structural change, but `addNode`/`updateNode` should `JSON.stringify(schema)` correctly for the nested shape (already does).
- `src/client/worker/sim-worker.ts` — `SimEngineImpl.loadGraph` still just stores the GraphDef; `run`/`runStreaming` unchanged call-wise, but the upstream `runSimulation` it invokes now uses real archetype dispatch.
- `src/server/domains/assistant/index.ts` — in the stream loop, after a `tool_use` block completes: (1) parse with existing Zod schema, (2) look up handler in `tool-handlers.ts`, (3) execute, (4) push `tool_result` message back into the LLM input so it can continue (requires a second pass of `llm.streamWithTools` or a nested call — see Task 6 for exact shape), (5) on success call `client.onAgentMutation` via the passed-through LoomClient stub.
- `src/server/rpc/loom-server-impl.ts` — `streamChat` already receives a `LoomClientApi` reference; pass it into `assistant.streamChat` so the assistant can call `onAgentMutation`.
- `src/client/rpc/loom-client-impl.ts` — `onAgentMutation` handler invalidates/re-fetches the affected slice (nodes, edges, problemStatement) via the server stub and writes into `workspace-store`.
- `src/client/shell/lens-tabs-panel.tsx` — replace hardcoded chart with `<TimelineLens />` from the registry.
- `src/client/shell/dockview-layout.tsx` — add the `node-inspector-panel` as a new tabbed panel alongside the control panel (keep layout default changes minimal).
- `src/client/canvas/graph-canvas.tsx` — expose `selectedNodeId` via store so the inspector panel can read it.
- `src/client/state/workspace-store.ts` — add `selectedNodeId`, `setSelectedNodeId(id)`, and (on `onAgentMutation`) a `refreshGraph()` that calls `server.listNodes` + `server.listEdges`.

---

## Type shape changes

### `src/engine/schema.ts` (new)

```ts
export type ConfigField =
  | { type: "number"; default: number; min?: number; max?: number; step?: number }
  | { type: "boolean"; default: boolean }
  | { type: "enum"; default: string; options: readonly string[] }
  | { type: "string"; default: string };

export type NodeSchemaV2 = {
  config: Record<string, ConfigField>;
  context?: Record<string, ConfigField>; // initial state for tick/process nodes
  inputs?: Record<string, string>; // port name → type tag (informational v2)
  outputs?: Record<string, string>;
};

export type EdgeSchemaV2 = {
  config: Record<string, ConfigField>;
};

export const defaultConfig = (schema: NodeSchemaV2): Record<string, unknown> =>
  Object.fromEntries(Object.entries(schema.config).map(([k, f]) => [k, f.default]));

export const validateConfig = (
  schema: NodeSchemaV2,
  config: Record<string, unknown>,
): Result<void, LoomError> => {
  /* bounds + enum membership checks */
};
```

### `src/engine/types.ts` (modified)

```ts
export type NodeDef = {
  id: string;
  kind: NodeKind;
  schema: NodeSchemaV2;
  behavior?: string;
  config: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type EntityState =
  | { kind: "tick"; context: unknown; outputs: Record<string, unknown> }
  | { kind: "stock"; value: number }
  | { kind: "variable"; value: number }
  | { kind: "process"; suspended: true } // phase 3
  | { kind: "flow"; rate: number }
  | { kind: "channel"; pending: number }; // phase 3 stub

export type TickSnapshot = {
  tick: number;
  entities: Array<{ id: string; type: "node" | "edge"; state: EntityState }>;
};
```

### `src/engine/compile/compile-behavior.ts`

```ts
type CompiledNodeBehavior = {
  tick?: (ctx: TickCtx) => { state: unknown; outputs: Record<string, unknown> };
  init?: (config: Record<string, unknown>) => unknown;
};

export const compileNodeBehavior = (
  source: string | undefined,
  kind: NodeKind,
): Result<CompiledNodeBehavior, LoomError> => {
  if (!source) return Result.ok({});
  try {
    const factory = new Function(
      "defineNode",
      `${source}\nreturn typeof node !== "undefined" ? node : undefined;`,
    );
    // Expose a minimal defineNode shim that captures { tick, init }
    const captured: CompiledNodeBehavior = {};
    const defineNode = (def: CompiledNodeBehavior) => {
      Object.assign(captured, def);
    };
    factory(defineNode);
    return Result.ok(captured);
  } catch (err) {
    return Result.err(loomError("compile_failed", String(err)));
  }
};

// Cache by sha1(source) — same source compiles once per worker session.
const cache = new Map<string, CompiledNodeBehavior>();
```

Edge behavior compiler is analogous with `defineEdge({ rate })`.

---

## Work breakdown

Each task ends with `mise run ts:check && mise run lint && mise run test` green. Commit after each. TDD where possible: tests first, then implementation.

### Task 1 — Schema V2 types + validators

**Files:** create `src/engine/schema.ts`, `src/engine/schema.test.ts`; modify `src/engine/types.ts` (NodeDef.schema, EntityState, TickSnapshot).

**Steps:**

1. Write `schema.test.ts` covering: `defaultConfig` builds correct record; `validateConfig` rejects out-of-bounds number, unknown enum, wrong type; accepts valid config.
2. Run: `mise run test src/engine/schema.test.ts` — expect FAIL (module missing).
3. Implement `schema.ts` with `ConfigField`, `NodeSchemaV2`, `EdgeSchemaV2`, `defaultConfig`, `validateConfig`.
4. Update `types.ts` to use the new shape and the `EntityState` tagged union.
5. Run: `mise run test src/engine/` — expect PASS.
6. Run: `mise run ts:check` — fix any fallout in files that constructed `NodeDef` with old shape (worker bootstrap, store round-trip, seed factory — will be rewritten in later tasks, so stub minimally).
7. Commit: `feat(engine): schema v2 — typed ConfigField shape`.

### Task 2 — Behavior compiler

**Files:** create `src/engine/compile/compile-behavior.ts`, `compile-behavior.test.ts`.

**Steps:**

1. Write failing tests: empty source → `ok({})`; valid `defineNode({ tick(ctx){ return {state:0, outputs:{}}; } })` source → callable `tick`; invalid syntax → `err('compile_failed')`; same source twice returns same object reference (cache hit).
2. Run and confirm FAIL.
3. Implement using `new Function("defineNode", …)` pattern with a capture shim, SHA-1 via `Bun.hash` (or a tiny inline fnv1a — must work in a Web Worker where Bun isn't available; use `crypto.subtle.digest`... actually `subtle` is async; simplest: use a fast synchronous hash like cyrb53. Write `src/engine/compile/hash.ts` — pure, 20 lines).
4. Tests green.
5. Mirror for `compileEdgeBehavior` with `defineEdge({ rate })`.
6. Commit: `feat(engine): compile node/edge behavior text via new Function`.

### Task 3 — Archetype runtimes

**Files:** create `src/engine/archetypes/{tick,stock,variable,flow-edge}.ts` and sibling tests.

**Steps:**

1. **`variable.ts`** (simplest — start here): `runVariable(node, config) → { kind: 'variable', value: Number(config.amount ?? 0) }`. Test: variable with `config.amount = 5` → `{ kind: 'variable', value: 5 }`.
2. **`stock.ts`**: `initStock(node) → { kind: 'stock', value: Number(config.initialBalance ?? 0) }`; `integrateStock(prev, inflows, outflows) → { kind: 'stock', value: prev.value + sum(inflows) - sum(outflows) }`. Test: initial 100, inflow [10, 5], outflow [3] → 112.
3. **`flow-edge.ts`**: `evalFlowRate(edge, compiled, { sourceValue, config, tick, rand }) → Result<number>`. Calls compiled `rate({ source: { value: sourceValue }, config, tick })`. If compile returned no `rate`, use `config.constantRate ?? 0`. Test: edge with compiled `rate = ({source,config}) => source.value * config.annualReturn`; sourceValue=100, config.annualReturn=0.05 → 5.
4. **`tick.ts`**: `runTick(node, compiled, { prevContext, inputs, config, tick, rand }) → { state, outputs }`. If compiled has no `tick`, return `{ state: prevContext ?? null, outputs: {} }`. Test: compiled `tick = ({state}) => ({ state: (state??0)+1, outputs: { out: state } })`; tick 0 → `{state:1, outputs:{out:null}}`, tick 1 → `{state:2, outputs:{out:1}}`.
5. Commit: `feat(engine): archetype runtimes — tick/stock/variable/flow`.

### Task 4 — Read-then-write tick loop

**Files:** rewrite `src/engine/tick-loop.ts`; rewrite `src/engine/tick-loop.test.ts`.

**Steps:**

1. Write failing tests first:
   - **Empty graph, 5 ticks** → 5 snapshots with empty entities.
   - **Compound interest graph** (seed example inline): 1 stock `bal` init 100, 1 flow edge `bal→bal` with behavior `defineEdge({ rate: ({source,config}) => source.value * config.rate })`, config `{rate:0.1}`. Run 3 ticks. Assert: tick 0 stock value 100; tick 1 value 110; tick 2 value 121.
   - **Determinism**: same seed + same graph → identical snapshot JSON sequences.
   - **Read-then-write**: two stocks A, B each feeding the other via flows; a naive sequential update gives different results than read-then-write. Assert the read-then-write answer matches the expected bilinear formula.
2. Run tests: expect FAIL.
3. Implement `runSimulation`:
   ```ts
   export async function* runSimulation(
     graph: GraphDef,
     opts: RunConfig,
     onTick?: (s: TickSnapshot) => void,
   ): AsyncGenerator<TickSnapshot, { finalTick: number }> {
     const rand = makePrng(opts.seed);
     const compiledNodes = new Map(
       graph.nodes.map((n) => [n.id, compileNodeBehavior(n.behavior, n.kind)]),
     );
     const compiledEdges = new Map(
       graph.edges.map((e) => [e.id, compileEdgeBehavior(e.behavior, e.kind)]),
     );
     // Initialize state from archetypes
     let state = initialState(graph, compiledNodes);
     for (let tick = opts.fromTick; tick <= opts.toTick; tick++) {
       // READ phase: compute new state from current `state` only
       const next = stepTick(graph, compiledNodes, compiledEdges, state, { tick, rand });
       // Snapshot uses the *new* state so scrubber shows post-tick values
       const snapshot = buildSnapshot(tick, next);
       onTick?.(snapshot);
       yield snapshot;
       state = next;
     }
     return { finalTick: opts.toTick };
   }
   ```
   `stepTick` dispatches on archetype, computes flow rates from _prev_ stock values, runs tick nodes, then integrates stocks in a single pass.
4. Tests green.
5. Commit: `feat(engine): real tick loop with archetype dispatch`.

### Task 5 — Server-side agent tool dispatch

**Files:** create `src/server/domains/assistant/tool-handlers.ts`, `tool-handlers.test.ts`; modify `src/server/domains/assistant/index.ts`; modify `src/server/rpc/loom-server-impl.ts` to thread the client stub through.

**Steps:**

1. Write `tool-handlers.test.ts` first: round-trip each tool — `list_nodes` returns empty then populated after `add_node`; `add_edge` works; `set_problem_statement` persists via workspace; invalid input → `err('invalid_input')`; unknown tool → `err('unknown_tool')`. Uses in-memory SQLite + real store/workspace (no mocks).
2. Implement `tool-handlers.ts`:
   ```ts
   type Deps = { store: GraphStore; workspace: Workspace };
   type Handler = (deps: Deps, input: unknown) => Promise<Result<unknown, LoomError>>;
   export const TOOL_HANDLERS: Record<string, Handler> = {
     list_nodes: async ({ store }) => store.listNodes(),
     add_node: async ({ store }, input) => {
       const parsed = AddNodeSchema.safeParse(input);
       if (!parsed.success) return Result.err(loomError("invalid_input", parsed.error.message));
       return store.addNode(parsed.data);
     },
     // ... etc for each tool in ASSISTANT_TOOLS
   };
   export const dispatchTool = async (deps: Deps, name: string, input: unknown) => {
     const handler = TOOL_HANDLERS[name];
     if (!handler) return Result.err(loomError("unknown_tool", name));
     return handler(deps, input);
   };
   ```
3. Modify `assistant/index.ts` streamChat:
   - When a `content_block_stop` fires for a tool_use block: call `dispatchTool(deps, currentToolName, parsed)`, then emit `{ type: 'tool_result', name, result }` via `onEvent`, then call `client.onAgentMutation({ kind: name, result })`, then loop the LLM stream with the tool_result appended to message history so it can continue reasoning. (This requires restructuring the streamChat loop to be re-entrant: after the first stream ends with `stop_reason: 'tool_use'`, call `llm.streamWithTools` again with history extended by `{ role: 'assistant', content: [text+tool_use] }` and `{ role: 'user', content: [{type:'tool_result',...}] }`. Cap at 5 tool-call rounds to bound the loop.)
4. Modify `loom-server-impl.ts`: `streamChat` currently receives `client: LoomClientApi`; pass it into `assistant.streamChat({ chatId, userMessage, client, onEvent })`.
5. Modify `AssistantDeps` in `assistant/index.ts` to accept the runtime client via the input (not the factory), since it's per-call.
6. Tests green. Commit: `feat(assistant): execute agent tool calls server-side`.

### Task 6 — Client reacts to agent mutations

**Files:** modify `src/client/rpc/loom-client-impl.ts`, `src/client/state/workspace-store.ts`.

**Steps:**

1. Add `refreshNodes()` and `refreshEdges()` to workspace-store (both call the server stub and replace the slice).
2. `LoomClientImpl.onAgentMutation({ kind })` switches on kind: `add_node|update_node|delete_node → refreshNodes()`; edges analogous; `set_problem_statement → refreshProblemStatement()`.
3. Manual verify in browser: type in chat "add a stock named balance with initialBalance=100" → observe node appearing on canvas in real time.
4. Commit: `feat(client): react to agent mutations over capnweb`.

### Task 7 — Node inspector panel + seed example

**Files:** create `src/client/shell/node-inspector-panel.tsx`, `src/client/state/seed-example.ts`; modify `dockview-layout.tsx`, `workspace-store.ts`, `graph-canvas.tsx`.

**Steps:**

1. `seed-example.ts`: exports `buildCompoundInterestGraph()` returning an array of `addNode`/`addEdge` inputs: one stock `balance` (schema.config.initialBalance), one flow edge `balance → balance` with behavior text `defineEdge({ rate: ({source, config}) => source.value * config.rate })` and config `{rate: 0.1}`. Add a "Seed example" button to the control panel that calls `server.addNode`/`addEdge` in sequence.
2. `graph-canvas.tsx`: on node click, set `store.selectedNodeId = id`.
3. `node-inspector-panel.tsx`: subscribes to `selectedNodeId` + `nodes`. Finds the selected node, iterates `schema.config` fields, renders one typed input per `ConfigField` (number→`<input type=number min max step>`, boolean→checkbox, enum→select, string→text). onChange calls `server.updateNode({ id, config: { ...prev, [field]: newValue } })` debounced 200ms.
4. Add `node-inspector-panel` to Dockview layout as a tab next to control panel.
5. Manual verify: click stock node → inspector shows `initialBalance=100`; edit to 200 → re-run sim → stock starts at 200.
6. Commit: `feat(client): node inspector panel + compound-interest seed example`.

### Task 8 — Timeline lens (real data)

**Files:** create `src/client/lenses/timeline-lens.tsx`, `src/client/lenses/lens-registry.ts`; modify `src/client/shell/lens-tabs-panel.tsx`.

**Steps:**

1. `timeline-lens.tsx`: `<LineChart>` reading `store.trace` + `store.selectedNodeId`. Maps each `TickSnapshot` → `{ tick, value: entity.state.value }` for stock/variable kinds. If the selected node isn't stock/variable, show "No numeric timeline for this archetype".
2. `lens-registry.ts`: `{ timeline: { label: 'Timeline', Component: TimelineLens } }`. Keep the existing Recharts import path.
3. Replace dummy data in `lens-tabs-panel.tsx` with registry-driven tabs (single tab at first: `timeline`).
4. Manual verify: seed example + run 20 ticks → timeline lens shows exponential curve 100→672.
5. Commit: `feat(lens): timeline lens reads real stock trace`.

### Task 9 — End-to-end smoke test + cleanup

**Files:** create `src/e2e/phase2-smoke.test.ts` (optional bun-test harness spinning up the server).

**Steps:**

1. Bun test: start server on ephemeral port, open capnweb WS, call `addNode`/`addEdge` to build the compound-interest graph, fetch via `listNodes`/`listEdges`, verify recursive CTE `queryDownstream` works, close. (This doesn't exercise the engine — engine is tested via `tick-loop.test.ts` in Task 4.)
2. Manual browser checklist (documented in the task, not automated):
   - `mise run dev` boots clean.
   - "Seed example" button creates stock + flow.
   - Run → trace populates.
   - Scrubber scrubs; timeline lens shows curve.
   - Chat: "change the rate to 0.15" → agent calls `update_node` → sim re-run shows steeper curve.
3. `mise run ts:check && mise run lint && mise run test` all green.
4. Commit: `chore: phase 2 smoke test + validation`.

---

## Critical files — read before editing

Phase-2 implementer should read these first:

- `docs/loom-design-v3.md` — archetype specs (esp. tick/stock/flow sections)
- `src/engine/tick-loop.ts:1-31` — current stub; this is what gets rewritten
- `src/engine/types.ts:1-51` — existing types; NodeSchema becomes NodeSchemaV2
- `src/server/domains/assistant/index.ts:25-122` — `streamChat` loop; tool_use branch becomes re-entrant
- `src/server/domains/assistant/tools.ts:49-151` — existing Zod schemas; reuse in handlers
- `src/server/graph/store.ts` — `addNode`/`addEdge`/`downstreamOf` signatures (already returning Result)
- `src/server/workspace/workspace.ts` — `setProblemStatement`/`getProblemStatement`
- `src/client/rpc/loom-client-impl.ts` — existing `onAgentMutation` callback; wire into store
- `src/client/state/workspace-store.ts` — add `selectedNodeId`, `refreshNodes`, `refreshEdges`
- `src/client/worker/sim-worker.ts` — SimEngineImpl.loadGraph/run (no change needed, just import updated engine)

## Reused utilities

- `better-result`'s `Result` — already used throughout. All new fallible code returns `Result<T, LoomError>`.
- `loomError`/`LoomError` in `src/server/errors.ts` — extend with `'compile_failed' | 'unsupported_archetype' | 'invalid_input' | 'unknown_tool'`.
- `makePrng` from `src/engine/prng.ts` — already threaded; pass to archetype runtimes.
- Existing Zod schemas in `src/server/domains/assistant/tools.ts` — reuse in `tool-handlers.ts`, do not duplicate.
- `nanoid` — already imported in `graph/store.ts`; store handles id generation so handlers don't.

## End-to-end verification

```bash
mise run ts:check          # clean
mise run lint              # clean
mise run test              # engine + archetype + compile + tool-handler tests green
mise run dev               # http://localhost:3000
```

Browser walkthrough:

1. Click "Seed example" in control panel → stock + flow appear on React Flow canvas.
2. Click the stock node → node inspector shows `initialBalance: 100`.
3. Click Run in timeline panel with `{seed:42, fromTick:0, toTick:20}` → timeline lens draws a curve 100→672.
4. Scrub to tick 5 → inspector/canvas state reflects tick 5 stock value.
5. In chat: "Set the flow rate to 0.2 and rerun for 20 ticks". Agent calls `update_node` → canvas unchanged structurally, but next Run shows steeper curve.
6. Hard-refresh the page → seeded nodes persist (SQLite), trace does not (in-memory only, deferred to phase 3).
7. Verify determinism: Run twice with seed 42 → identical final stock values to ≥8 decimal places.

## Explicitly out of scope (phase 3)

- Process-node generators (`async function*` with `wait.for`/`wait.ticks` suspension model)
- Channel edges (latency/loss buffering)
- Control Panel auto-discovery with drag-to-pin + derived controls + instant re-sim on drag
- Property declaration + batch verifier + shrinker (verify remains a stub)
- Lenses beyond timeline (topology uses existing React Flow canvas; state-grid, swimlane, distribution, DAG deferred)
- Trace persistence (`writeTraceBatch` exists but unused)
- Snapshot save/load (named workspace snapshots)
- Undo/redo for graph mutations (workspace_meta undo already exists from phase 1)
- Sandboxed behavior execution (smolVM/Firecracker) — `new Function()` is knowingly unsafe and acceptable for single-user local dev
- Agent CLI / MCP external access — agent is in-browser only
- Auth, multi-user, multi-workspace
