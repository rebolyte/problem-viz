# Loom Audit + Roadmap to V1 (Phase 3+)

> Superseded by [docs/roadmap.md](../roadmap.md) — the canonical build plan with semantics spec and testing harness. Audit findings below (Parts 1–2) remain valid as the historical record.

Audit date: 2026-07-01, `main` @ `cefa9aa`. Baseline health: `tsc --noEmit` clean, `oxlint` clean, 87/87 tests pass.

## Part 1 — Audit

### What exists and works (verified)

| Layer | Status |
| --- | --- |
| Shell | Dockview with 7 panels (problem statement, canvas, control, chat, timeline, lens tabs, inspector); layout persists to SQLite, restored on refresh |
| Canvas | React Flow renders nodes/edges from store; drag persists position; click selects; inspector edits config fields (typed inputs from `ConfigField`), label, delete |
| RPC | capnweb WS (`LoomServerApi`) + Web Worker postMessage (`SimEngineApi`), bidirectional callbacks both directions; plain `RpcResult` at the boundary (better-result objects don't serialize) |
| Store | SQLite via Kysely: nodes/edges/trace/properties/workspace_meta; recursive-CTE up/downstream; JSON parse at boundaries; all Result-returning |
| Engine | Pure TS, seeded mulberry32, read-then-write tick loop, behavior compile via `new Function()` with hash cache; tick/stock/variable/flow archetypes run for real |
| Agent | Re-entrant tool loop (max 5 rounds), server-side dispatch table, `onAgentMutation` broadcast → client slice refresh; chat streams over capnweb |
| Lens | Timeline lens plots stock/variable value from real trace |
| Seed | Compound-interest example (stock + self-loop flow) works end to end: seed → run → scrub → curve |

### V1 must-do scorecard (design doc §V1 Scope)

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Graph w/ all 3 archetypes + passthrough/coded edges | Partial — process nodes stubbed, passthrough edges inert, no canvas authoring (agent/seed only) |
| 2 | Write/generate behavior via CodeMirror | Missing — editor component exists but only as smoke test in control panel, not wired to node/edge behavior |
| 3 | Deterministic sim + full traces | Partial — deterministic, but no input routing so tick nodes are isolated |
| 4 | Scrub timeline | Done (basic slider + JSON dump) |
| 5 | Rewind, modify, replay forward | Missing — `fromTick > 0` just relabels a fresh run (`tick-loop.ts:224`), no state resume |
| 6 | Control panel: pinned auto-gen controls, instant re-sim | Missing — control panel is smoke-test leftovers |
| 7 | Properties + batch verify | Missing — `verify`/`shrink` RPC are stubs, `properties` table unused |
| 8 | Shrinker + investigate | Missing |
| 9 | ≥2 lenses | Partial — timeline only (canvas arguably counts as topology) |
| 10 | Dockview layout | Done |
| 11 | Agent: mutate, suggest lenses, write properties, run verify | Partial — mutations only; no property/verify/sim/lens tools, no delete/update-edge tools |
| 12 | Named snapshots | Missing — `listSnapshots` returns `[]`, `saveWorkspace` aliases `loadWorkspace` |
| 13 | Undo/redo all mutations | Missing — workspace_meta-only stack exists server-side, not exposed via RPC or UI; graph mutations untracked |
| 14 | Problem statement live editable | Done |
| 15 | Agent CLI/MCP | Missing |

### Bugs / deviations found (fix in phase 3)

1. **Flow edges read `source.value` only from stocks** — `tick-loop.ts:86` gives `sourceValue = 0` for variable sources. Breaks the FIRE example (salary variable → savings stock) and DCF. One-line-ish fix but gated on Q2 ordering decision.
2. **No input routing at all** — tick nodes always get `inputs: {}` (`tick-loop.ts:131`); node `outputs` are captured in snapshots but never delivered anywhere; passthrough edges are dead weight. This is the biggest gap vs the design's "archetype interop" section.
3. **Variables are constants only** — `variable.ts` reads `config.amount`, ignores `behavior`. Derived variables (`FCF = Revenue - OpEx - CapEx - Tax`) impossible.
4. **`stock.ts:6` hardcodes the `initialBalance` config key** — a stock whose schema names it differently silently inits to 0.
5. **Compile-error fallback mislabels state** — `tick-loop.ts:29,104` emits `{ kind: "tick", context: { compileError } }` for any archetype, so a broken stock's snapshot claims to be a tick node. Lenses/inspector will mis-dispatch.
6. **Passthrough/custom edges snapshot as `{ kind: "channel", pending: 0 }`** (`tick-loop.ts:171`) — misleading trace data.
7. **`RunConfig.configOverrides` typed but never applied** — needed for slider-drag re-sim without SQLite writes.
8. **Single shared PRNG consumed in graph iteration order** — adding/removing an unrelated node reshuffles every node's randomness. Deterministic, but hostile to shrinking ("seed neighborhood" dimension) and to minimal-repro stability.
9. **Trace persistence dead** — `writeTraceBatch` unused; `getTrace` RPC reads an always-empty table.
10. **Timeline Run hardcodes `{ seed: 42, toTick: 50 }`** (`timeline-panel.tsx:23`); no play/pause, no seed input.
11. **Agent tool surface too small** — no `delete_node`, `delete_edge`, `update_edge`, `query_upstream`, no way to run a sim or read results (trace lives on the main thread, agent lives server-side). Agent can build but not observe — half the design's collaboration loop.
12. **MAX_ROUNDS = 5** likely too low for "model this whole system" prompts that add 6+ entities.

## Part 2 — Design questions to resolve

Each has a recommendation; decide before the phase that consumes it (noted in parens).

**Q1. Same-tick routing semantics for passthrough edges (phase 3a).** Design doc says passthrough output "appears at the downstream input on the same tick", but the engine is read-then-write, which delivers next tick. Options: (a) topological ordering per tick — nodes evaluate in dependency order, passthrough delivers same tick, cycles get an implicit 1-tick delay at back-edges; (b) uniform 1-tick delay everywhere (simpler, but sequence lenses and protocol models get off-by-one everywhere). **Recommend (a)**: topo-sort non-flow entities once per run, break cycles at back-edges with 1-tick delay, document the rule. Deterministic and matches the doc.

**Q2. Evaluation order across archetypes within a tick (phase 3a).** Proposal to adopt: (1) derived variables in topo order (reading upstream node values via passthrough inputs), (2) flow-edge rates from current variable values + previous stock values, (3) stock integration, (4) tick/process nodes in topo order with routed inputs. Stocks always integrate from prev-tick stock values (classic Euler step); variables are instantaneous. **Needs sign-off — it's the semantic core of the engine.**

**Q3. Process-node snapshot/rewind model (phase 3b).** Generator positions can't be serialized. Options: (a) never serialize — on rewind/investigate, re-run the sim from tick 0 (determinism makes this exact; V1 scale makes it cheap) and treat `ctx` as the only inspectable state; (b) restrict process nodes to explicit state-machine steps (no real generators). **Recommend (a)** — keeps the SimPy-style authoring UX, snapshots stay pure data, and it collapses Q4 into "replay is always re-run from 0".

**Q4. Rewind-modify-replay mechanics (phase 3c/4).** "Scrub to tick 40, change config, play forward" — does the new run keep ticks 0–40 from the old timeline (needs mid-run config swap in the engine) or re-run 0–N with the new config (prefix may change)? **Recommend: engine gains `changesAtTick?: { tick, configOverrides }` and replays 0→N applying overrides from that tick** — prefix provably identical (same seed, same config until t), and no state-injection machinery. Cheap given re-run-from-0 (Q3a).

**Q5. Per-entity PRNG streams (phase 3c).** Replace the shared PRNG with per-entity streams derived from `hash(seed, entityId)`. Randomness becomes stable under graph edits — matters for shrinking and for "add a node, everything else unchanged" intuition. **Recommend yes.** Breaks trace-compat with existing runs, which is fine now.

**Q6. Where verify runs + property check context (phase 5).** Batch runner on the Bun server via `node:worker_threads` (engine is already pure; a worker bundle service already exists as a pattern). Property `check` receives `({ nodes, edges, tick })` where `nodes` is keyed by node id — but ids are `balance-nanoid()`. **Decide: introduce a unique human `name` on nodes (agent + UI set it), and property checks key on name.** Statistical properties stay V2 per design doc.

**Q7. Agent access to sim + traces (phase 5, unblocks 11).** The trace lives client-side; the agent is server-side. **Recommend: server gains headless `runSimulation` (same engine via worker_threads), persists the run to the existing `trace` table, and the agent gets `run_simulation` / `read_trace` / `run_verify` tools.** The browser keeps its own worker for interactive scrubbing — two consumers of one pure engine, exactly the foundation plan's intent.

**Q8. Undo/redo architecture (phase 7).** Design requires undo for all mutations including agent turns as a unit. **Recommend server-side command log**: every store mutation records `{ op, inverse }`; agent tool-calls within one `streamChat` share a batch id; `undo()` pops a batch, applies inverses, broadcasts `onAgentMutation` so clients refresh. Client sends explicit `undo`/`redo` RPC. The existing workspace_meta stack folds into this.

**Q9. Named snapshot format (phase 7).** One workspace = one SQLite file, so **recommend snapshot = server-side file copy** (`data/snapshots/<name>.sqlite`) + `listSnapshots`/`saveSnapshot`/`loadSnapshot` RPC that reopens the DB. JSON export can come later; file copy is atomic and includes everything (graph, layout, properties, trace).

**Q10. Sandboxing stance (standing).** `new Function()` for node/edge/property code, single-tenant localhost — accepted risk for V1 per design doc; smolVM/Firecracker stays stretch. Confirm and stop revisiting.

**Q11. Slider-drag re-sim data path (phase 4).** Drag must not write SQLite per pixel. **Recommend:** controls mutate a client-side `overrides` map → debounced `sim.runStreaming({ ...run, configOverrides })` (engine applies them — fixes gap 7) → on release/blur, persist via `updateNode`. Needs Q4's override support.

**Q12. Verify trace storage (phase 5).** 10k seeds × 200 ticks × full snapshots is pointless to store. **Recommend: store only per-seed pass/fail + first-violation tick; Investigate re-runs the failing seed deterministically to regenerate its trace.** Determinism is the storage format.

## Part 3 — Build roadmap (phases 3–8)

Ordering rationale: engine semantics first (everything else renders or verifies what the engine produces), then the explore UX loop, then verify (the differentiator), then lenses, then trust mechanics, then external agent surface. Each phase is independently shippable and sized for one agent session; tasks within a phase are ordered and each ends with validation green + a commit.

Validation commands for every task: `bunx tsc --noEmit && bunx oxlint . && bun test` (equal to `mise run ts:check/lint/test`; use the raw commands where mise is unavailable, e.g. remote sandboxes).

Standing prompt preamble for any agent picking up a task:

> Read CLAUDE.md, docs/loom-design-v3.md (relevant sections), docs/plans/3-audit-and-roadmap.md (this file — your phase + the design questions it cites), then the "read first" files listed in the task. TDD: write failing tests, implement, validate, commit per task.

### Phase 3 — Engine completeness

Goal: all three archetypes + coded edges actually interoperate; the five design-doc problem domains become expressible.

Read first: `src/engine/tick-loop.ts`, `src/engine/types.ts`, `src/engine/archetypes/*`, `src/engine/compile/compile-behavior.ts`.

- **3a. Routing + derived variables** (needs Q1, Q2 decided)
  - Build a per-run topo order over non-flow edges; detect cycles, mark back-edges as 1-tick-delayed.
  - Route tick/process node `outputs` through passthrough edges into downstream `inputs` (same tick per Q1); port names from edge source/target ports, defaulting to output name.
  - Variables: compile `behavior` for a `value({ inputs, config, tick, rand })` fn; fall back to `config.amount`. Evaluate in topo order before flow rates.
  - Fix `evalFlowRate` source: accept stock *or* variable value (gap 1); pass current-tick variable values, prev-tick stock values.
  - Fix gaps 4 (stock init via `init` behavior or schema-declared field, keep `initialBalance` fallback), 5 (compile-error state becomes `{ kind: "error", message }` variant in `EntityState`), 6 (passthrough snapshot state `{ kind: "passthrough", lastValue }`).
  - Tests: FIRE mini-model (salary variable → flow → savings stock) matches closed-form; DCF variable chain (`fcf = revenue - opex`) topo-evaluates same tick; two tick nodes A→B passthrough same-tick delivery; cycle A→B→A gets exactly one tick of delay; determinism preserved.
- **3b. Process nodes + channel edges** (needs Q3 decided)
  - `compileNodeBehavior` captures `run` (generator fn). Scheduler: per-node driver holding the iterator; `emit(port, value)` buffers outputs for routing; `yield wait.for(port, timeout)` / `yield wait.ticks(n)` suspend; resume at tick boundaries with matched input or null.
  - Channel edges: compile `tick({ state, pending, config, tick, rand })`, engine feeds pending messages, edge returns `{ state, deliver }`; delivered messages join the routing pass. Snapshot `{ kind: "channel", pending: buffer.length }` for real.
  - Snapshots for process nodes: `{ kind: "process", ctx, status: "running" | "waiting" | "done" }` (Q3a: ctx only, no generator position).
  - Tests: client/server ws-protocol mini-model from the design doc — send/ack/retry over a lossy channel; loss reproducible per seed; timeout resume gets null; determinism across two runs.
- **3c. PRNG streams + replay semantics** (needs Q4, Q5 decided)
  - Per-entity PRNG: `makePrng(hash(seed, entityId))`; thread through all archetype calls.
  - Apply `configOverrides` in `runSimulation` (per-entity config merge), plus `changesAtTick` per Q4.
  - Tests: adding an unrelated node leaves another node's random sequence unchanged; overrides change results without touching `GraphDef`; replay-with-change-at-t keeps ticks < t bit-identical.

Acceptance: all five design-doc domain examples expressible (write the ws-protocol and FIRE graphs as test fixtures — they become seed examples in phase 4).

### Phase 4 — Explore-mode UX

Goal: V1 items 2, 5, 6 — a human can author and iterate without the agent.

Read first: `src/client/shell/*`, `src/client/canvas/graph-canvas.tsx`, `src/client/state/workspace-store.ts`, `src/client/editor/code-editor.tsx`.

- **4a. Behavior editing.** Inspector gains a CodeMirror editor for the selected node/edge `behavior`; save → `updateNode`/`updateEdge` → auto re-run. Compile errors surface inline (compile in the sim worker via the existing `compile` RPC — implement it, it currently no-ops). Edge selection: canvas `onEdgeClick` → `selectedEdgeId` in store, inspector handles both.
- **4b. Canvas authoring.** `onConnect` → `addEdge` (kind picker default passthrough); node palette (4 archetypes) → `addNode` with sensible default schema/behavior template per kind; edge delete. Replace the control panel's throwaway editor/JSON dump with the seed-example buttons (compound interest + phase-3 fixtures).
- **4c. Transport + run config.** Timeline panel: seed input, tick-count input, play/pause (advance `currentTick` on rAF), run button uses them (kills gap 10). Show run status from worker.
- **4d. Control panel proper** (needs Q11). Auto-discover numeric/bool/enum config fields from selected node schemas; pin/unpin (pins persist in `workspace_meta`); slider drag → debounced worker re-sim with `configOverrides`; release → persist config. Derived controls deferred to post-V1 unless trivial.
- **4e. State-on-canvas.** Custom React Flow node renderers (finally use `node-types.tsx`): show label, kind badge, and current-tick state summary (stock value, variable value, process status); error variant styled distinctly.

Tests: store-level tests for new actions; component tests where cheap (existing chat-panel test shows the pattern); the rest is the manual browser checklist appended per task. Acceptance: build the FIRE model from scratch in the UI (palette → wire → edit behavior → pin savings-rate slider → drag it → curve moves live).

### Phase 5 — Properties, verify, shrink, investigate

Goal: V1 items 7, 8, and the agent half of 11 (needs Q6, Q7, Q12 decided).

Read first: `src/server/graph/store.ts` (properties/trace tables), `src/server/rpc/loom-server-impl.ts`, `src/server/services/sim-worker-bundle.ts` (bundling pattern), `docs/loom-design-v3.md` §Property & Verification.

- **5a. Property CRUD.** Store methods over the existing `properties` table; RPC (`listProperties`, `addProperty`, `updateProperty`, `deleteProperty`); compile+validate `check_source` on write (invariant + liveness kinds only). Properties panel: list, enable/disable, CodeMirror for check source.
- **5b. Headless server sim.** `src/server/verify/run-headless.ts`: worker_threads pool running the engine bundle; `runSeed(graph, seed, properties) → { seed, violations: [{ property, tick }] }` — checks evaluated per tick in-worker, fail-fast per Q12, no trace storage.
- **5c. Batch runner + report.** `verify({ seeds, workers, properties })` RPC streams `onVerifyProgress`; final report per property: pass count, failing seeds, first violation. Verify panel replaces the stub button: report table, click failure → investigate.
- **5d. Shrinker.** Dimensions per design doc: tick count (binary search), config values (halving toward defaults), seed neighborhood (±k scan). Output: minimal `{ graph-config, seed, toTick, property }`.
- **5e. Investigate loading.** `loadFailure(shrunk)` → client re-runs that seed/config in its own worker (determinism regenerates the trace), scrubber parks at violation tick, violated property + failing predicate shown, offending node highlighted on canvas.
- **5f. Agent verify tools.** `add_property`, `run_verify`, `run_simulation`, `read_trace` (Q7), plus the missing CRUD tools (`delete_node`, `delete_edge`, `update_edge`, `query_upstream`); raise MAX_ROUNDS to ~12.

Tests: property compile/eval unit tests; batch runner on the ws-protocol fixture with a known-failing property (assert failing seed found and report shape); shrinker reduces a constructed failure monotonically; tool-handler round-trips in the existing harness style. Acceptance: the design-doc verify narrative — declare "no message loss", run 1000 seeds, get failures, shrink, land in explorer at the failing tick.

### Phase 6 — Lenses

Goal: V1 item 9 solidly; leverage phase-3 routing events.

- **6a. Message capture.** Engine snapshots gain routed-message records per tick (`{ edgeId, from, to, payload }`) — required by sequence lens; keep payloads shallow.
- **6b. Sequence/swimlane lens.** Vertical lanes per node, arrows per message, current-tick cursor synced to scrubber. SVG, no library.
- **6c. DAG lens.** For `dependency` structural edges: layered layout + critical path (longest path over duration config). Pure function + tests for the path math.
- **6d. Lens registry growth + agent suggestion.** `suggest_lens` tool: heuristics on graph shape (has process+channel → sequence; has dependency edges → DAG; stocks/variables → timeline); agent can activate a lens via a new `onLensSuggestion` client callback.

State-matrix lens deferred to post-V1 unless a domain example demands it. Acceptance: ws-protocol fixture shows a legible message sequence; PERT fixture (build it here) shows critical path.

### Phase 7 — Workspace trust: undo/redo + snapshots

Goal: V1 items 12, 13 (needs Q8, Q9 decided).

- **7a. Command log.** Wrap every graph-store mutation with `{ op, inverse, batchId }`; in-memory log (persist later if needed); `undo`/`redo` RPC applying inverses in reverse batch order; broadcast mutations so all panels refresh. Agent `streamChat` allocates one batchId per turn.
- **7b. UI.** Undo/redo buttons + keyboard shortcuts; chat turns show a per-turn revert affordance.
- **7c. Named snapshots.** `saveSnapshot(name)` = checkpoint + file copy; `listSnapshots`, `loadSnapshot(name)` = swap DB + full client reload; fix the `saveWorkspace` alias while in there.

Tests: inverse round-trip per op type; batch undo restores exact pre-turn state (in-memory SQLite harness exists); snapshot save/load round-trips a workspace.

### Phase 8 — External agent surface: CLI + MCP

Goal: V1 item 15. Both are thin clients over the existing capnweb WS API — no new server logic.

- **8a. CLI.** `bin/loom.ts` (bun): connects to the running server, subcommands mirroring the design-doc CLI (`nodes list/add/update`, `edges …`, `sim run`, `trace get`, `verify`, `property …`, `problem-statement get/set`, `snapshot save/load`). JSON in/out; exit codes from RpcResult.
- **8b. MCP server.** Same client, MCP stdio wrapper exposing the tool set from phase 5f + CRUD for Claude Code use.
- **8c. Docs.** README agent-usage section; regenerate the assistant system prompt to mention the full tool surface.

Tests: e2e harness (spin server on ephemeral port — pattern exists in `src/server/utils/harness.ts`) driving the CLI end to end.

## Part 4 — Cleanups to fold into whichever phase touches them

- `saveWorkspace` alias (phase 7c), dead `getTrace`/`writeTraceBatch` become real in phase 5b, `compile` RPC no-op becomes real in phase 4a, timeline hardcoded run config in 4c, `node-types.tsx` stubs in 4e, edge snapshot mislabels in 3a.
- `.env.example` still carries teddygram VPS deploy vars; prune when convenient.
- Consider `name` (unique, human) column on nodes when doing Q6 — one migration, needed by property checks and nicer for the agent than nanoid ids.
