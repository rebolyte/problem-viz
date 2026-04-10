# Loom Foundations Implementation Plan

## Context

The repo currently hosts **Teddygram**, a Preact/Elysia drawing-telegram app. We're repurposing it as **Loom** — a problem visualization toolkit per `docs/loom-design-v3.md`. This plan lays the _foundations_: rip out teddygram features, swap Preact → React, scaffold the architecture layers from the design doc, install Dockview/React Flow/CodeMirror/Recharts, build a minimal runnable tick-loop engine, and adopt SQLite as the graph store itself (not just metadata).

Outcome: `mise run dev` boots a Dockview shell with empty Problem Statement / Canvas (React Flow) / Control Panel / Chat / Timeline panels. The main thread talks to (a) a **Web Worker** that hosts the simulation engine via capnweb's postMessage transport and (b) a **Bun server** via a single capnweb WebSocket connection. The server owns a SQLite-backed graph store and workspace persistence. A no-op deterministic tick loop runs end-to-end: main thread loads a graph from the server, ships it to the worker, worker runs ticks and streams snapshots back, main thread appends them to the in-memory trace. No REST endpoints. No real archetypes, lenses, or verify yet. Just a trustworthy skeleton matching the runtime architecture sketch.

## Guiding decisions

- **Rip out teddygram features, preserve the domain/services pattern.** Keep Elysia+logger+container boot, Kysely+bun:sqlite plumbing, `services/llm.ts`, `services/llm.test.ts`, `services/sqlite.ts`, tsconfig/mise/unocss/oxlint, migration runner. Also keep the `src/server/domains/assistant/` directory — repurpose it as the Loom agent-chat domain (same `makeAssistantDomain({ llm, messages, log })` shape, new prompt/tools). Delete `domains/{telegrams,users}`; keep `domains/messages/` as-is (still a generic chat-history store keyed by `chatId`). Delete drawing/emoji/text canvas, send-form, mailbox, telegram-viewer, apply-tool, export-json/png, reducer state machine.
- **Preact → React 19.** Replace `preact` + `preact/compat` aliasing with real `react` + `react-dom`. Keep `use-effect-reducer` (works on React too).
- **capnweb RPC everywhere, no REST.** The server exposes a single `LoomServer` RpcTarget over a WebSocket (capnweb WS transport). The main thread talks to a dedicated Web Worker through capnweb's postMessage transport. Both directions are bidirectional — server pushes verify/agent events to the client, worker streams tick snapshots to the main thread. Elysia is downgraded to serving the HTML shell and upgrading one `/api/loom/rpc` route into a capnweb WebSocket session. No fetch/routes endpoints.
- **Engine lives in a Web Worker.** The deterministic simulation engine is plain pure TS in `src/engine/` (no DOM, no Bun APIs). It's imported by (a) `src/client/worker/sim-worker.ts` which exposes it via capnweb postMessage, and (b) `src/server/verify/verify-worker.ts` (V1, out of scope at foundation — file is stubbed). This keeps fast re-sim off the main thread and lets the batch verifier reuse the exact same code path.
- **Main thread owns the trace array.** Worker pushes tick snapshots bidirectionally; main thread appends them to an in-memory `trace[]`. Scrubbing is `trace[tick]` — sub-millisecond, zero network. Server SQLite is only hit on save/load/snapshot/verify, never during scrubbing.
- **SQLite IS the server graph store.** Per user direction: nodes, edges, trace, properties, workspace_meta tables with JSON columns and recursive-CTE queries. Workspace = one `.sqlite` file. Snapshot = file copy. Graph mutations during a live session stay in the main thread; they're pushed to SQLite on save/autosave via the `WorkspaceService` RPC.
- **Classes allowed for capnweb RpcTargets.** capnweb requires `class Foo extends RpcTarget { ... }`. This is an explicit exception to the FP-light "no classes" rule (classes wrapping stateful resources are permitted per CLAUDE.md). Inside RpcTarget methods we still delegate to factory-function modules so the actual logic stays pure data-in/data-out.
- **No string-DSL anywhere.** Behavior is TypeScript source stored as text, compiled by the worker via `new Function()` (no sandboxing at foundation; Firecracker/smolVM is V1-stretch per design doc).
- **Deterministic engine from tick 0.** Even the stub engine wires a seeded PRNG (mulberry32) and emits one snapshot per node per tick.

---

## Directory layout (post-refactor)

```
problem-viz/
├── docs/loom-design-v3.md            (unchanged)
├── migrations/
│   └── 0001_loom_schema.ts           (new — replaces 0001_initial_schema.ts)
├── src/
│   ├── engine/                           (pure TS, no DOM, no Bun — shared by worker + verify)
│   │   ├── types.ts                      (NodeKind, NodeSchema, NodeDef, EdgeDef, TickSnapshot)
│   │   ├── define-node.ts                (defineNode API shell)
│   │   ├── define-edge.ts                (defineEdge API shell)
│   │   ├── prng.ts                       (mulberry32)
│   │   ├── tick-loop.ts                  (deterministic runSimulation generator)
│   │   └── tick-loop.test.ts
│   ├── rpc/                              (capnweb interface definitions — shared between client + server + worker)
│   │   ├── loom-server.ts                (LoomServer RpcTarget interface type — stubs)
│   │   ├── loom-client.ts                (LoomClient RpcTarget interface type — onAgentMutation, onVerifyProgress)
│   │   ├── sim-engine.ts                 (SimEngine RpcTarget interface type — loadGraph, run, runStreaming)
│   │   └── sim-client.ts                 (SimClient RpcTarget interface type — onTick, onComplete)
│   ├── client/
│   │   ├── main.tsx                      (React createRoot)
│   │   ├── app.tsx                       (Dockview shell)
│   │   ├── shell/
│   │   │   ├── dockview-layout.tsx
│   │   │   ├── problem-statement-panel.tsx
│   │   │   ├── canvas-panel.tsx          (React Flow host)
│   │   │   ├── control-panel.tsx
│   │   │   ├── chat-panel.tsx
│   │   │   ├── timeline-panel.tsx        (scrubber reads main-thread trace[])
│   │   │   └── lens-tabs-panel.tsx
│   │   ├── canvas/
│   │   │   ├── graph-canvas.tsx          (ReactFlow instance)
│   │   │   └── node-types.tsx            (custom node renderers — empty stubs)
│   │   ├── editor/
│   │   │   └── code-editor.tsx           (CodeMirror 6 + TS)
│   │   ├── rpc/
│   │   │   ├── server-connection.ts      (capnweb WS client — connects to /api/loom/rpc, returns LoomServer stub)
│   │   │   ├── sim-connection.ts         (spawns Worker, wires capnweb postMessage, returns SimEngine stub)
│   │   │   └── loom-client-impl.ts       (class LoomClientImpl extends RpcTarget — onAgentMutation, onVerifyProgress)
│   │   ├── worker/
│   │   │   ├── sim-worker.ts             (Web Worker entry — class SimEngineImpl extends RpcTarget, imports src/engine)
│   │   │   └── sim-client-impl.ts        (class SimClientImpl extends RpcTarget — onTick writes into main trace[])
│   │   ├── state/
│   │   │   ├── workspace-store.ts        (useSyncExternalStore: problemStatement, nodes, edges, trace, currentTick)
│   │   │   └── selectors.ts
│   │   └── styles.css
│   ├── server/
│   │   ├── main.ts                       (start fn)
│   │   ├── container.ts                  (graph, workspace, assistant, messages)
│   │   ├── server.ts                     (Elysia: static shell + WS upgrade on /api/loom/rpc)
│   │   ├── rpc/
│   │   │   └── loom-server-impl.ts       (class LoomServerImpl extends RpcTarget — delegates to workspace/store/assistant)
│   │   ├── errors.ts                     (unchanged)
│   │   ├── services/
│   │   │   ├── config.ts                 (DATABASE_PATH etc.)
│   │   │   ├── database.ts               (kysely + bun:sqlite, LoomDatabase type)
│   │   │   ├── sqlite.ts                 (unchanged — bun:sqlite dialect wrapper)
│   │   │   ├── llm.ts                    (unchanged — Anthropic streaming)
│   │   │   ├── llm.test.ts               (unchanged)
│   │   │   └── logger.ts                 (unchanged)
│   │   ├── domains/
│   │   │   ├── assistant/                (repurposed — Loom agent chat)
│   │   │   │   ├── index.ts              (makeAssistantDomain — same shape, Loom deps)
│   │   │   │   ├── prompt.ts             (new Loom system prompt)
│   │   │   │   └── tools.ts              (new tools: query graph, add node, set problem statement, etc.)
│   │   │   └── messages/                 (unchanged — chat history store)
│   │   │       ├── index.ts
│   │   │       └── schema.ts
│   │   ├── graph/
│   │   │   ├── schema.ts                 (Kysely table types for Loom tables)
│   │   │   ├── store.ts                  (CRUD + graph queries with CTEs)
│   │   │   └── store.test.ts
│   │   ├── workspace/
│   │   │   ├── workspace.ts              (problem statement, layout, undo/redo stack)
│   │   │   └── workspace.test.ts
│   │   ├── verify/
│   │   │   └── verify-worker.ts          (stub — node:worker_threads entry for V1 batch verifier)
│   │   └── properties/
│   │       └── types.ts                  (Property type stubs)
├── server.ts                             (Bun.serve bootstrap)
├── index.html                            (rebranded Loom)
├── package.json                          (react, dockview-react, @xyflow/react, codemirror 6, recharts, capnweb, remove preact)
├── tsconfig.json                         (drop preact alias, switch jsxImportSource)
├── AGENTS.md / CLAUDE.md                 (rebrand to Loom; note capnweb class exception to FP-light)
└── README.md                             (rebrand)
```

Files deleted: everything under `src/client/{assistant,components,hooks,rendering,serialization,state/reducer.ts,state/actions.ts,types/document.ts}`, `src/server/domains/{telegrams,users}`, old teddygram-specific contents of `domains/assistant/{prompt.ts,tools.ts,index.test.ts}` (replaced with Loom versions), `chat.html`, `teddygram.db`. Services `llm.ts`, `llm.test.ts`, `sqlite.ts`, `logger.ts`, `config.ts`, `errors.ts` stay.

---

## SQLite schema (new migration, 0001_loom_schema.ts)

Following the user's directive. One workspace = one sqlite file (`DATABASE_PATH`, default `data/workspace.sqlite`).

```sql
CREATE TABLE workspace_meta (
  key TEXT PRIMARY KEY,
  value JSON NOT NULL
);
-- rows: 'problem_statement', 'current_seed', 'layout_json'

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('tick','stock','variable','process')),
  schema JSON NOT NULL,
  behavior TEXT,
  config JSON NOT NULL DEFAULT '{}',
  meta JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  source_node TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  source_port TEXT,
  target_node TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_port TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('passthrough','channel','flow','dependency','ownership','causation','custom')),
  behavior TEXT,
  config JSON NOT NULL DEFAULT '{}',
  meta JSON NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_edges_source ON edges(source_node);
CREATE INDEX idx_edges_target ON edges(target_node);

CREATE TABLE trace (
  tick INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('node','edge')),
  state JSON NOT NULL,
  log TEXT,
  PRIMARY KEY (tick, entity_id)
);
CREATE INDEX idx_trace_entity ON trace(entity_id, tick);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('invariant','liveness','statistical')),
  description TEXT,
  check_source TEXT NOT NULL,
  config JSON NOT NULL DEFAULT '{}'
);
```

Down migration drops all five tables.

`graph/store.ts` exposes:

- `addNode`, `updateNode`, `deleteNode`, `getNode`, `listNodes`
- `addEdge`, `updateEdge`, `deleteEdge`, `getEdge`, `listEdges`
- `downstreamOf(id, hops?)` — recursive CTE
- `upstreamOf(id, hops?)` — recursive CTE
- `listByJsonQuery(table, jsonPath, op, value)` — for config filtering
- `writeTraceBatch(rows)`, `readTrace({entityId?, tickRange?})`
- Each fallible op returns `Result<T, LoomError>`.

---

## Dependencies

Add:

- `react@^19`, `react-dom@^19`, `@types/react`, `@types/react-dom`
- `dockview-react@^4` (+ `dockview-core`)
- `@xyflow/react@^12` (React Flow v12; `reactflow` is legacy name)
- `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-javascript`, `@codemirror/commands`, `@codemirror/autocomplete`, `@codemirror/language`, `codemirror`
- `recharts@^2`
- `capnweb` (Cloudflare's Cap'n-Proto-inspired typed bidirectional RPC — postMessage + WebSocket transports)
- `nanoid` (for node/edge ids)

Remove:

- `preact` (replaced by React)

Keep (needed soon — reducer for engine/workspace state, marked for chat rendering, anthropic SDK for agent chat):

- `use-effect-reducer`, `marked`, `@anthropic-ai/sdk`
- `elysia`, `@logtape/*`, `better-result`, `kysely`, `remeda`, `ts-pattern`, `zod`, `unocss`, `@unocss/*`, `oxlint`, `oxfmt`, `typescript`, `@types/bun`

---

## Work breakdown

Each task ends with `mise run ts:check && mise run lint && mise run test` green before moving on. Commit after each task.

### Task 1 — Purge teddygram features & rebrand

**Files deleted:** `src/client/{assistant,components,hooks,rendering,serialization,assets,auth.ts}`, `src/client/state/{actions.ts,reducer.ts}`, `src/client/types/document.ts`, `src/server/domains/{telegrams,users}`, `src/server/domains/assistant/{prompt.ts,tools.ts,index.test.ts}` (will be recreated in Task 5 with Loom content), `migrations/0001_initial_schema.ts`, `chat.html`, `teddygram.db`.

**Files kept intact:** `src/server/services/{llm.ts,llm.test.ts,sqlite.ts,logger.ts,config.ts,errors.ts}`, `src/server/domains/messages/` (generic chat-history store), `src/server/domains/assistant/index.ts` (shell — gutted of teddygram-specific imports in Task 5).

**Files modified:**

- `package.json`: name → `loom`, remove only `preact` (keep `use-effect-reducer`, `marked`, `@anthropic-ai/sdk`).
- `README.md`, `AGENTS.md` (and `CLAUDE.md` symlink target): replace teddygram prose with one-paragraph Loom summary. Preserve the "Validate your changes", "FP light", and "Use Bun" sections verbatim.
- `index.html`: title "Loom", drop teddy-bear favicon, remove inline `#FFF3D6` palette.
- `src/server/container.ts`: strip telegrams+users wiring; keep messages + assistant wiring. Add placeholders for `graph`, `engine`, `workspace` (populated in later tasks).
- `src/server/server.ts`: delete telegram/user routes, delete the basic-auth `derive` block (single-tenant). Keep `/api/health`. Keep `/api/chat` + `/api/chat/history` (will be rewired in Task 5 to the Loom assistant).
- `src/client/app.tsx`, `src/client/main.tsx`: empty placeholders (rewritten in Task 2).

**Verify:** `mise run ts:check` clean. `rg -l 'teddygram|telegram' src/` returns nothing. `rg -l 'preact' src/` returns nothing.

### Task 2 — Swap Preact for React

**Files modified:**

- `package.json`: add `react`, `react-dom`, `@types/react`, `@types/react-dom`.
- `tsconfig.json`: remove `paths` preact aliases, change `jsxImportSource` from `preact` to `react` (or delete the field and use the default with `"jsx": "react-jsx"`).
- `src/client/main.tsx`:

  ```tsx
  import { createRoot } from "react-dom/client";
  import { App } from "./app.tsx";
  import "./styles.css";

  const root = createRoot(document.getElementById("app")!);
  root.render(<App />);
  ```

- `src/client/app.tsx`:
  ```tsx
  export function App() {
    return <div className="p-4">Loom bootstrapping...</div>;
  }
  ```
- `src/client/styles.css`: empty UnoCSS-only stylesheet (placeholder).

**Verify:** `bun install`, then `mise run dev` serves http://localhost:3000 rendering the placeholder. `mise run ts:check` clean.

### Task 3 — SQLite graph schema + store

**Files created:**

- `migrations/0001_loom_schema.ts` — the SQL above wrapped in Kysely `sql\`...\``+`createTable`calls where feasible (Kysely doesn't support JSON CHECK constraints via builder, so use raw`sql\``).
- `src/server/graph/schema.ts`:
  ```ts
  export type NodesTable = {
    id: string;
    kind: 'tick' | 'stock' | 'variable' | 'process';
    schema: string;   // JSON text, parsed at boundaries
    behavior: string | null;
    config: string;
    meta: string;
    created_at: string;
  };
  export type EdgesTable = { ... };
  export type TraceTable = { ... };
  export type PropertiesTable = { ... };
  export type WorkspaceMetaTable = { key: string; value: string };
  export type LoomDatabase = {
    nodes: NodesTable;
    edges: EdgesTable;
    trace: TraceTable;
    properties: PropertiesTable;
    workspace_meta: WorkspaceMetaTable;
  };
  ```
- `src/server/services/database.ts`: `createDatabase(path: string): Kysely<LoomDatabase>` reusing the existing `BunSqliteDriver` from `services/sqlite.ts` (no new dependencies needed). Wire it via `new Kysely<LoomDatabase>({ dialect: { createDriver: () => new BunSqliteDriver(path), ... } })`. The existing `database.ts` already does this for teddygram tables — just swap the generic type param to `LoomDatabase`.
- `src/server/graph/store.ts`: factory `makeGraphStore(db: Kysely<LoomDatabase>)` returning an object of CRUD + query functions. Parse JSON on read, stringify on write. Use nanoid for ids. Every fallible op → `Result`.
- `src/server/graph/store.test.ts`: creates an in-memory DB (`:memory:`), runs migration, exercises addNode/addEdge/downstreamOf/upstreamOf/listNodes/delete cascade. Recursive CTE example: build A→B→C, assert `downstreamOf('A')` = `[B, C]`.

**Verify:** `mise run test` passes; at least 5 store tests green.

### Task 4 — Pure engine module (shared by worker + verify)

**Files created in `src/engine/` (pure TS, no DOM, no Bun imports — must run in browser worker AND node:worker_threads):**

- `prng.ts`: mulberry32 seeded PRNG factory `makePrng(seed: number): () => number`.
- `types.ts`:
  ```ts
  export type NodeKind = "tick" | "stock" | "variable" | "process";
  export type NodeDef = {
    id: string;
    kind: NodeKind;
    schema: NodeSchema;
    behavior?: string;
    config: Record<string, unknown>;
    meta: Record<string, unknown>;
  };
  export type EdgeDef = {
    id: string;
    source: { node: string; port?: string };
    target: { node: string; port?: string };
    kind: EdgeKind;
    behavior?: string;
    config: Record<string, unknown>;
    meta: Record<string, unknown>;
  };
  export type GraphDef = { nodes: NodeDef[]; edges: EdgeDef[] };
  export type RunConfig = {
    seed: number;
    fromTick: number;
    toTick: number;
    configOverrides?: Record<string, Record<string, unknown>>;
  };
  export type TickSnapshot = {
    tick: number;
    entities: Array<{ id: string; type: "node" | "edge"; state: unknown }>;
  };
  export type Trace = TickSnapshot[];
  ```
- `define-node.ts`, `define-edge.ts`: API stubs returning the definition object.
- `tick-loop.ts`:
  ```ts
  export async function* runSimulation(
    graph: GraphDef,
    opts: RunConfig,
    onTick?: (snapshot: TickSnapshot) => void,
  ): AsyncGenerator<TickSnapshot, { finalTick: number }, void> { ... }
  ```
  For the foundation: instantiate PRNG from seed, for each tick in `[fromTick, toTick]` yield one `TickSnapshot` containing one entity entry per node with `state: { seed, tick, kind }` (placeholder behavior). Deterministic: same `{seed, graph}` → identical snapshot sequence. No real archetype dispatch yet.
- `tick-loop.test.ts` (using `bun test` — must not import any Bun-only APIs so it also runs under tsc):
  - Empty graph, run 10 ticks → generator yields 10 snapshots, each with empty `entities`.
  - 2 tick-nodes, 5 ticks → 5 snapshots × 2 entities each = 10 state entries total.
  - Run twice with same seed → identical JSON-stringified snapshot sequences.
  - Run with different seeds → `rand()` produces different first values (proves PRNG threading).

**Verify:** `mise run test src/engine/` green. `grep -r "bun:\|node:\|document\|window" src/engine/` returns nothing.

### Task 5 — capnweb RPC interfaces + server + workspace + assistant repurpose

**Files created under `src/rpc/` (pure TS interface types — no runtime code, shared across all three boundaries):**

- `loom-server.ts`: interface `LoomServerApi` — method signatures for `saveWorkspace`, `loadWorkspace`, `listSnapshots`, `listNodes`, `addNode`, `updateNode`, `deleteNode`, `listEdges`, `addEdge`, `updateEdge`, `deleteEdge`, `queryDownstream(id)`, `queryUpstream(id)`, `setProblemStatement`, `getProblemStatement`, `streamChat(message)`, `verify(config)` (stub returning a `VerifySession` object ref — V1), `shrink(seed, property)` (stub), `getTrace(seed)`. Every fallible op returns `Promise<Result<T, LoomError>>`.
- `loom-client.ts`: interface `LoomClientApi` — callback methods the server invokes on the client: `onVerifyProgress`, `onAgentMutation`, `onAgentMessage`.
- `sim-engine.ts`: interface `SimEngineApi` — `loadGraph(graph: GraphDef)`, `run(config: RunConfig): Promise<Trace>`, `runStreaming(config: RunConfig)` (returns a `SimSession` ref), `compile(source: string)`.
- `sim-client.ts`: interface `SimClientApi` — `onTick(snapshot: TickSnapshot)`, `onComplete(trace: Trace)`.

**Server implementation:**

- `src/server/workspace/workspace.ts`: `makeWorkspace({ store, db })` exposing `getProblemStatement`, `setProblemStatement` (via `workspace_meta` upsert), `getLayout`, `setLayout`, and a simple in-memory undo/redo stack for workspace_meta changes only (graph-level undo deferred).
- `src/server/domains/assistant/prompt.ts`: new `buildSystemPrompt({ problemStatement, nodeCount, edgeCount })` describing Loom, node/edge archetypes, and available tools.
- `src/server/domains/assistant/tools.ts`: new `ASSISTANT_TOOLS` array matching the Agent API section of the design doc: `list_nodes`, `add_node`, `update_node`, `list_edges`, `add_edge`, `query_downstream`, `set_problem_statement`. Tool schemas use Zod. (Verify/shrink/run tools are stubs at foundation.)
- `src/server/domains/assistant/index.ts`: rewrite `makeAssistantDomain({ llm, messages, workspace, store, log })` — same streaming shape as before, but the returned `streamChat` now yields `ChatMessage` events over capnweb instead of SSE. Tool-call execution goes through `workspace`/`store` (no engine dependency — sim runs client-side).
- `src/server/rpc/loom-server-impl.ts`:
  ```ts
  import { RpcTarget } from "capnweb";
  export class LoomServerImpl extends RpcTarget implements LoomServerApi {
    constructor(private deps: { workspace; store; assistant; log }) {
      super();
    }
    async addNode(input) {
      return this.deps.store.addNode(input);
    }
    async queryDownstream(id) {
      return this.deps.store.downstreamOf(id);
    }
    async streamChat(message) {
      /* delegates to assistant, pushes onAgentMessage via client ref */
    }
    // ... etc
  }
  ```
  The implementation is a thin adapter — all logic stays in the factory-function modules (`workspace`, `store`, `assistant`). One `LoomServerImpl` instance is created per WebSocket connection and holds a reference to the client's `LoomClientApi` stub for bidirectional callbacks.
- `src/server/container.ts`: wire `{ config, db, log, llm, store, workspace, messages, assistant }`.
- `src/server/server.ts`: strip all REST routes. Keep Elysia only for:
  - `GET /` serving the HTML shell (via Bun HTML import, handled by `server.ts` at repo root)
  - `GET /api/loom/rpc` — upgrades to WebSocket, instantiates `LoomServerImpl(deps)`, calls `capnweb.serveWebSocket(ws, new LoomServerImpl(deps))`. Uses Elysia's `.ws()` helper or plain `Bun.serve` websocket handlers (choose whichever capnweb's WS transport API expects; likely raw `Bun.serve` websockets).
    Drop `resultToResponse` helper (RPC method return values carry Result objects directly across the wire — capnweb serializes them).
- `src/server/graph/store.test.ts`, `src/server/workspace/workspace.test.ts`: round-trip tests as before.

**Verify:** `mise run test` passes. `mise run dev` starts. Open `ws://localhost:3000/api/loom/rpc` from a quick bun script and invoke `addNode`/`listNodes`/`setProblemStatement`/`queryDownstream` via a capnweb client stub — confirm round-trip works and recursive CTE query returns correct downstream ids.

### Task 6 — Dockview shell + Web Worker + capnweb client wiring

**Client RPC plumbing:**

- `src/client/rpc/server-connection.ts`: `connectLoomServer(clientImpl: LoomClientApi): Promise<LoomServerApi>` — opens a WebSocket to `/api/loom/rpc`, hands `clientImpl` as the bidirectional callback target, returns a typed stub for `LoomServerApi`. Uses capnweb's WebSocket transport.
- `src/client/rpc/loom-client-impl.ts`:
  ```ts
  export class LoomClientImpl extends RpcTarget implements LoomClientApi {
    constructor(private onEvent: (e: LoomClientEvent) => void) {
      super();
    }
    async onVerifyProgress(p) {
      this.onEvent({ type: "verify-progress", ...p });
    }
    async onAgentMutation(m) {
      this.onEvent({ type: "agent-mutation", ...m });
    }
    async onAgentMessage(m) {
      this.onEvent({ type: "agent-message", ...m });
    }
  }
  ```
  Events feed into `workspace-store` so Dockview panels re-render.

**Worker RPC plumbing:**

- `src/client/worker/sim-worker.ts`: entry for a dedicated Worker. Imports `runSimulation` from `src/engine/tick-loop.ts`. Defines `class SimEngineImpl extends RpcTarget implements SimEngineApi` holding a `GraphDef` from `loadGraph()` and implementing `run` / `runStreaming`. `runStreaming` drives the async generator and, for each yielded snapshot, calls `client.onTick(snapshot)` on the bidirectional stub. On completion calls `client.onComplete(trace)`. Bootstraps with `capnweb.serveWorker(new SimEngineImpl())`.
- `src/client/rpc/sim-connection.ts`: `connectSimWorker(clientImpl: SimClientApi): Promise<SimEngineApi>` — spawns `new Worker(new URL('../worker/sim-worker.ts', import.meta.url), { type: 'module' })`, wires capnweb postMessage transport with `clientImpl` as the callback target, returns a typed `SimEngineApi` stub.
- `src/client/worker/sim-client-impl.ts`:
  ```ts
  export class SimClientImpl extends RpcTarget implements SimClientApi {
    constructor(
      private appendTick: (s: TickSnapshot) => void,
      private onDone: (t: Trace) => void,
    ) {
      super();
    }
    async onTick(snapshot) {
      this.appendTick(snapshot);
    }
    async onComplete(trace) {
      this.onDone(trace);
    }
  }
  ```

**Shell + panels:**

- `src/client/state/workspace-store.ts`: `useSyncExternalStore`-backed module holding `{ problemStatement, nodes, edges, trace: TickSnapshot[], currentTick, layout, server: LoomServerApi | null, sim: SimEngineApi | null }`. Exposes `appendTick(s)`, `mutators` that call `server.addNode(...)` etc. No fetch calls.
- `src/client/main.tsx`: inside `App` bootstrap effect, calls `connectLoomServer(new LoomClientImpl(dispatch))` and `connectSimWorker(new SimClientImpl(store.appendTick, store.finishRun))` in parallel, writes the stubs into the store.
- `src/client/shell/dockview-layout.tsx`: `DockviewReact` with five panels (problem statement top, canvas center, control panel left, chat right, timeline bottom, lens-tabs tabbed bottom). Layout changes call `server.setLayout(api.toJSON())` debounced.
- `src/client/shell/problem-statement-panel.tsx`: textarea bound to `store.problemStatement`, onBlur → `server.setProblemStatement(...)`.
- `src/client/shell/canvas-panel.tsx` → `src/client/canvas/graph-canvas.tsx`: `ReactFlow` instance showing `store.nodes` / `store.edges`, default node types. Dragging a node calls `server.updateNode(id, { meta: { position }})`.
- `src/client/shell/timeline-panel.tsx`: scrubber slider whose max is `store.trace.length - 1` and whose value is `store.currentTick`. Also has a "Run" button that calls `sim.runStreaming({ seed: 42, fromTick: 0, toTick: 50 })` — worker streams ticks back, store grows, scrubber extends live.
- `src/client/shell/{control-panel,chat-panel,lens-tabs-panel}.tsx`: placeholder stubs with panel chrome (rich content comes in later V1 tasks).
- `src/client/app.tsx`: `<DockviewLayout />`.

**Verify:** `mise run dev`, open http://localhost:3000. Confirm:

1. Five panels visible, draggable/dockable.
2. Problem statement persists across refresh (proves WS → SQLite round-trip).
3. Adding a node via a quick devtools call to `window.__loom.server.addNode({...})` shows it in the canvas (proves bidirectional capnweb + store reactivity).
4. Clicking "Run" in the timeline panel: scrubber extends from 0 to 50 in real time (proves worker streaming: `runSimulation` async-generator → `client.onTick` → `store.appendTick`).
5. Reload page → ticks are gone (in-memory trace, not persisted at foundation, matches architecture sketch).
6. `mise run ts:check` clean.

### Task 7 — CodeMirror + Recharts smoke test

**Files created:**

- `src/client/editor/code-editor.tsx`: `<CodeEditor value onChange language="typescript" />` wrapping CodeMirror 6 EditorView in a `useEffect` with cleanup. TypeScript completions are out of scope at foundation — wire `@codemirror/lang-javascript` with `javascript({typescript:true})`.
- In `control-panel.tsx`, render a throwaway `<CodeEditor>` with placeholder source so we confirm CodeMirror bundles and mounts.
- In `lens-tabs-panel.tsx`, render a single `<LineChart>` from Recharts with hardcoded `[{tick:0,v:0},{tick:1,v:3},{tick:2,v:1}]` to confirm Recharts bundles and mounts.

**Verify:** `mise run dev`, visual check both render. Drop these smoke demos once confirmed or leave behind `// TODO: replace with real editor/lens` comments (preferred: leave them — they become the seed for Task 8+ in V1).

### Task 8 — Developer docs + cleanup

**Files modified:**

- `AGENTS.md` (= `CLAUDE.md` symlink): add a "Loom architecture" section listing the layer stack and pointing to `docs/loom-design-v3.md`. Keep all existing rules (FP-light, Bun, no comments) intact.
- `README.md`: one paragraph on what Loom is, quickstart (`mise run dev`), link to design doc.
- Delete `scripts/deploy.sh` content referencing teddygram image name; rename to `loom:local` or leave alone and note "deploy pipeline unchanged".

**Verify:** `mise run ts:check && mise run lint && mise run test` all green. Final commit.

---

## Files to reuse

- `src/server/errors.ts` — keep as-is, used by new store/engine.
- `src/server/services/logger.ts` — keep as-is.
- `src/server/services/config.ts` — update `DATABASE_PATH` default to `data/workspace.sqlite`.
- `migrate.ts` at repo root — still drives migrations against the new schema; verify it still works.
- `unocss-bun-plugin.ts` and `uno.config.ts` — keep; UnoCSS survives the React swap since it's framework-agnostic.
- `bunfig.toml`, `mise.toml`, `oxlint.config.ts`, `prek.toml`, `Dockerfile` — keep (Dockerfile may reference teddygram image tag; fix in Task 8).
- `better-result`, `remeda`, `ts-pattern`, `zod` — used throughout new code.

---

## End-to-end verification

After Task 7:

```bash
mise run ts:check           # clean
mise run lint               # clean
mise run test               # engine + graph store + workspace tests green
bun run migrate.ts up       # fresh data/workspace.sqlite
mise run dev                # http://localhost:3000
```

Browser checklist (no curl — everything is capnweb now):

1. Dockview: five panels visible, draggable, layout persists across refresh.
2. Problem statement textarea persists across refresh (capnweb WS → SQLite round-trip).
3. Devtools: `await window.__loom.server.addNode({ kind:'tick', schema:{}, config:{}, meta:{label:'client'} })` — node appears on React Flow canvas within a render cycle.
4. Devtools: `await window.__loom.server.queryDownstream('<id>')` — returns `[]` until you add an edge, then returns downstream ids (proves recursive CTE).
5. Click "Run" in timeline panel: scrubber extends 0→50 live as worker streams snapshots back (proves worker capnweb postMessage + bidirectional `onTick`).
6. Drag scrubber: node state re-renders from `trace[tick]`, sub-millisecond (proves main-thread trace ownership).
7. CodeMirror editor loads in control panel (smoke test).
8. Recharts chart draws in lens tab (smoke test).

Regression headers (optional): a `src/e2e/foundation.test.ts` bun-test that spins up the Bun server, opens a WebSocket + capnweb client stub, and asserts the six server-side RPC round-trips above (not the browser-only ones).

## Explicitly out of scope (V1, not foundations)

- Real archetype execution (`defineNode` runtime, stock integration, process generator suspension)
- Lenses beyond the smoke-test Recharts demo
- Property verification batch runner (`verify/verify-worker.ts` file is a stub; `node:worker_threads` wiring is V1)
- Shrinker
- Agent CLI / MCP server (the assistant domain is wired for in-browser chat; external CLI access via AgentBridge is V1)
- Control Panel auto-discovery from schemas, derived controls, instant re-simulation on slider drag
- Undo/redo for graph mutations (only workspace_meta changes are undoable at foundation)
- Sandboxed behavior execution (smolVM / Firecracker)
- Auth, multi-user, multi-workspace routing
- Import/export named snapshots (copy-the-file works manually in the meantime)
- Persisted traces (SQLite `trace` table exists per user's schema, but the live scrub path is main-thread-only; server-side trace writes happen only during verify, which is V1)

Each of these becomes its own plan after foundations lands and `mise run dev` shows the shell with a working streaming sim worker.
