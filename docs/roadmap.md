# Loom Roadmap: Vision, Correctness Harness, Build Plan

This is the canonical build document. It supersedes `docs/plans/3-audit-and-roadmap.md` (the audit findings there remain valid and are summarized here). Read order for anyone (human or agent) picking up work: `CLAUDE.md` → `docs/loom-design-v3.md` (the vision) → this file → the phase you're assigned.

The premise of this document: Loom's product promises — determinism, rewind, replay, property verification — are themselves formal properties. So we build Loom the way Loom asks its users to build models: state the properties, generate adversarial inputs, verify continuously. A team of mid/senior engineers following this plan faithfully should land the tool the vision describes, and be able to prove it works.

---

## Part 1 — Does the prototype address the vision?

**Architecturally yes, functionally not yet.** The load-bearing decisions are correct and already paying rent:

- The engine is pure TS with no environment imports — exactly what "same tick loop in browser worker and server verify" requires. This is the single most important structural bet and it's right.
- Main-thread trace ownership makes scrubbing sub-millisecond with zero network. Right call for the Bret Victor experience.
- capnweb bidirectional RPC gives agents and humans the same mutation surface — the "both author the model" principle has the right plumbing.
- SQLite-as-graph-store with one-file-per-workspace makes snapshots trivially cheap later.
- The agent tool loop is genuinely re-entrant (executes tools server-side, feeds results back, broadcasts mutations). Not pantomime.

**But the heart of the vision doesn't exist yet.** The vision is about *interacting parts producing emergent behavior you can watch, rewind, and verify*. The prototype demonstrates one degenerate case: a single stock feeding itself. Specifically:

1. **Nodes cannot talk to each other.** Tick nodes always receive empty inputs; outputs are captured but never routed; passthrough edges are inert; flow edges read source values only from stocks. None of the five validation domains in the design doc except compound interest can be expressed. The entire "Archetype Interop" section of the vision is unimplemented.
2. **Time semantics are undefined.** "Deterministic rewind and replay" is only meaningful if what a tick *means* is precisely specified — what evaluates in what order, when a message emitted at tick t arrives, what snapshot t contains. Today those semantics are implicit in loop code and partially wrong. Braid-style rewind on vague semantics is a scrubber over noise.
3. **Determinism can silently rot.** Compiled behaviors (`new Function`) see all globals — a user or agent writing `Math.random()` or `Date.now()` in a node body breaks replay *silently*: the trace still renders, properties still "check", the answers are just wrong on re-run. The engine also iterates in graph-array order, so adding an unrelated node reshuffles every node's randomness. Determinism is currently a claim, not an enforced invariant.
4. **The three-mode cycle has one mode, partially.** Explore exists in skeletal form. Verify and Investigate — the modes that differentiate Loom from a diagramming toy — are stubs. Undo-as-trust (design principle 5) is absent while the agent already has live mutation power.
5. **The agent can build but not observe.** It mutates the graph but cannot run a simulation, read a trace, declare a property, or verify — half the collaboration loop from the vision's "Agent Integration with Verification" section is missing, and the trace lives in the browser where the server-side agent can't reach it.

None of this is architectural damage — it's unbuilt floors on a sound foundation. The risk isn't the code written so far; it's proceeding without (a) pinned-down semantics and (b) a harness that attacks determinism and interop continuously. Both are addressed below before any more features.

### Vision, restated as testable capabilities

Every phase below traces to these. V1 is done when all ten pass their stated verification.

| ID | Capability | Verified by |
| --- | --- | --- |
| C1 | Model interacting systems in all archetypes (the 5 design-doc domains) | Fixture suite (Part 3) — each domain is an executable test |
| C2 | Run deterministically, fast, with errors as values | Semantics tests S1–S9 + perf budget bench |
| C3 | Scrub to any tick instantly; canvas and lenses reflect that tick | Journey J2 + store selectors tests |
| C4 | Iterate: change config/behavior, replay; change-at-tick preserves prefix | S6 property test + journey J3 |
| C5 | See: state-on-canvas + ≥2 lenses + lens suggestion | Journeys J2, J5 |
| C6 | Author as human (canvas + editor) and as agent (tools) with parity | Tool-parity checklist + journeys J1, J4 |
| C7 | Trust: undo/redo everything including agent turns; named snapshots | Command-log inverse tests + journey J4 |
| C8 | Verify: invariant + liveness properties across thousands of seeds, headless | Batch-runner tests on ws-protocol fixture |
| C9 | Investigate: shrink to minimal repro, load into explorer at failing tick | Shrinker monotonicity tests + journey J5 |
| C10 | Steer: problem statement feeds agent context and lens suggestions | Prompt-assembly test + J5 |

### Top risks this plan is designed to kill

- **R1 Semantic drift.** No written tick semantics → every engine change renegotiates meaning. Mitigation: executable spec (Part 2), rule-tagged tests, spec edits require test edits in the same commit.
- **R2 Silent nondeterminism.** Global access in behaviors, iteration-order dependence, float accumulation order, silent NaN→0 coercion. Mitigation: capability-injection compilation, canonical entity ordering, adversarial property tests that permute and re-run.
- **R3 Degenerate-demo ossification.** Everything so far is tuned to one self-loop stock. Mitigation: fixture-first development — the ws-protocol model (two process nodes over a lossy channel) is the north-star fixture; engine work isn't done until it runs.
- **R4 Graph-state divergence.** Three replicas (SQLite, client store, worker GraphDef) with manual refresh; traces silently outlive the graph that produced them. Mitigation: authority rules + `graphVersion` staleness stamping (D13).
- **R5 Agent asymmetry.** UI grows capabilities the agent doesn't get. Mitigation: tool-parity checklist reviewed at every phase close.
- **R6 Unverifiable UI.** Agents build UI they can't see. Mitigation: browser journey harness (Part 3) so agents can run the app and assert on it.

---

## Part 2 — Simulation semantics: the executable spec

Phase 3 task 0 copies these rules into `docs/semantics.md` as the living spec. Every rule gets at least one test whose name carries the rule ID (e.g. `test("S4: entity array order does not affect trace", ...)`). Changing a rule requires changing spec + tests in one commit. These are **decisions, not options** — flagged items are the ones worth a veto before phase 3 starts.

- **S1 — Discrete time.** A run over `[0, N]` emits N+1 snapshots. Snapshot 0 is initialized state before any step. Snapshot t (t ≥ 1) is the state after step t completes.
- **S2 — Step order within a tick** *(veto-worthy: this is the semantic core)*:
  1. **Variables** evaluate in topological order over passthrough dependencies, reading current-tick upstream variable values and previous-tick stock/tick/process values.
  2. **Flow rates** evaluate from current-tick variable values and previous-tick stock values.
  3. **Stocks** integrate: `v' = v + Σ inflows − Σ outflows` (Euler step from previous-tick stock values).
  4. **Channel edges** step: accept messages emitted in earlier ticks, decide deliveries for this tick.
  5. **Tick and process nodes** step in topological order, receiving same-tick passthrough inputs from upstream nodes that stepped earlier in this tick, plus this tick's channel deliveries.
- **S3 — Wire vs register.** Passthrough edges are combinational: delivery within the same tick, subject to topo order. Channel edges are sequential: a message emitted at tick t is available to targets no earlier than t+1 (plus configured latency). Cycles among passthrough edges are broken at back-edges, which behave as 1-tick delays. (Digital-circuit analogy: passthrough = wire, channel/back-edge = register.)
- **S4 — Entity-order independence.** Engine iteration uses topological order with ties broken by entity id (lexicographic) — never by array position. Permuting the `nodes`/`edges` arrays of a GraphDef yields a bit-identical trace.
- **S5 — Capability injection.** Compiled behaviors receive *only* injected capabilities (`state/ctx`, `inputs`, `config`, `tick`, `rand`, and for process nodes `emit`/`wait`). `Math.random`, `Date`, `performance`, and `crypto` are shadowed in the compiled scope to throw with "use rand from context". Determinism by construction, and a first step toward sandboxing.
- **S6 — Overrides and replay.** `RunConfig.configOverrides` merges per-entity config before tick 0. `changesAtTick: { tick, configOverrides }` applies overrides from that tick onward; ticks before it are bit-identical to the base run (same seed, same effective config until t). Replay is always re-execution from tick 0 — no state injection, ever. Determinism makes re-execution exact; V1 scale makes it cheap.
- **S7 — Per-entity randomness.** Each entity gets its own PRNG stream seeded by `hash(runSeed, entityId)`. Adding or removing one entity does not change any other entity's random sequence.
- **S8 — Errors are values.** A behavior compile failure or runtime throw never aborts the run. The entity enters `{ kind: "error", phase: "compile" | "runtime", message, tick }` state, sticky for the rest of the run, rendered distinctly, and visible to property checks. Correct archetype identity is preserved in the error record (fixes the current "everything becomes kind:tick" bug).
- **S9 — No silent numeric coercion.** A non-finite flow rate, stock value, or variable value puts the entity in error state (S8). Never coerce NaN/Infinity to 0 — a finance model with silent zeros produces plausible-looking wrong answers, the worst failure mode a thinking tool can have. (Current code silently 0s several paths; change it.)
- **S10 — Flow conservation.** A stock→stock flow edge conserves: −r from source, +r to target per tick. A self-loop flow (source === target) is a source/sink shortcut: net inflow r (may be negative), reading the stock's own previous value — this is the compound-interest idiom. A flow whose source is a variable draws from a cloud (no depletion), matching system-dynamics tradition. Property: in a graph whose flows are all stock→stock non-self-loop, total stock sum is constant across ticks.
- **S11 — Trace provenance.** Every graph mutation increments a `graphVersion` counter (server-side). Every run stamps the trace with the version it ran against. A trace whose version trails the current graph is *stale* and the UI must say so — a stale trace is a static picture, and static pictures lie.
- **S12 — Snapshot sufficiency.** For tick/stock/variable/flow/channel entities, the snapshot state alone suffices to render lenses and evaluate property checks at that tick. Process nodes expose `{ ctx, status: "running" | "waiting" | "done" }`; their internal generator position is deliberately not serialized (S6 re-execution covers rewind).

### Architecture decisions (carried from the audit, now resolved)

- **D1** Verify runs server-side: `node:worker_threads` pool over the same engine (bundled like the existing sim-worker bundle). The browser worker stays for interactive runs — two consumers, one pure engine.
- **D2** Property checks are TypeScript compiled like behaviors, with context `({ nodes, edges, tick })` where `nodes` is keyed by a new unique human `name` field on nodes (one migration; nanoid ids stay as the machine key).
- **D3** Verify stores per-seed verdicts only (pass/fail + first violation tick + property id). Failing traces are regenerated on demand by deterministic re-run. Determinism *is* the storage format.
- **D4** The agent gets `run_simulation`, `read_trace`, `run_verify`, `add_property` tools backed by server-side headless runs persisted to the existing `trace` table. This closes the build-but-can't-observe gap.
- **D5** Undo/redo is a server-side command log: every store mutation records `{ op, inverse, batchId }`; one agent conversation turn = one batch; undo applies inverses and broadcasts. **Moved earlier in the plan (phase 4)** — trust must arrive before we hand more power to the agent and before humans build models worth protecting.
- **D6** Named snapshots = SQLite file copy under `data/snapshots/<name>.sqlite` + RPC to save/list/load. Atomic, includes everything.
- **D7** Slider drag re-simulates via `configOverrides` in the worker (no SQLite writes per pixel); persistence happens on release/blur.
- **D8** `new Function` stays for V1 (single-tenant localhost, accepted per design doc), hardened by S5 capability injection. smolVM/Firecracker remains post-V1.
- **D9** Stock initial value: `init` behavior if present, else schema-declared initial config field, else `initialBalance`, else 0 — stop hardcoding a single key name.

---

## Part 3 — The development harness

This is how we and the agents *know* the thing works. Built in phase 3 task 0, before any new engine feature, then extended per phase. New dev dependency: `fast-check`. Optional but recommended: `@playwright/test` for journeys.

### 3.1 Test pyramid

| Layer | What | Where | Runs |
| --- | --- | --- | --- |
| L0 unit | Pure function tests (existing 87) | colocated `*.test.ts` | every commit |
| L1 property | fast-check over generated graphs/configs attacking S-rules | `src/engine/semantics/*.test.ts` | every commit (fixed FC seed in CI, random locally) |
| L2 oracle | Domain fixtures with closed-form/reference expectations | `src/fixtures/*.ts` + `*.test.ts` | every commit |
| L3 differential | Client `run()` vs server headless runner: identical trace JSON per fixture | `src/server/verify/differential.test.ts` (from phase 5) | every commit |
| L4 RPC e2e | Server on ephemeral port + capnweb client, full loops (agent tool → mutation → sim → trace) | `src/e2e/*.test.ts` (harness pattern exists in `src/server/utils/harness.ts`) | every commit |
| L5 journeys | Scripted browser flows against `bun server.ts` | `e2e/journeys/*.spec.ts` (Playwright) | pre-merge / on demand |
| L6 bench | Perf budgets as regression gates | `src/engine/bench.test.ts` | pre-merge |

### 3.2 Property arbitraries (`src/engine/testing/arbitraries.ts`)

Generating arbitrary *code* is not useful; generating arbitrary *structure over vetted behaviors* is. Build:

- `arbBehavior(kind)` — picks from a pool of ~10 parameterized behavior templates per archetype (counter, accumulator, echo, threshold-alarm, lossy-channel, proportional-flow, …), instantiated with generated numeric params. Every template is individually oracle-tested, so structural generation explores composition, not syntax.
- `arbGraph` — small graphs (2–12 nodes) mixing archetypes: DAG segments, deliberate passthrough cycles, self-loop flows, stock chains, process pairs over channels. Shrinks toward fewer entities (fast-check's shrinking gives us minimal counterexamples of our own engine bugs — dogfooding the Investigate mode's philosophy on ourselves).
- `arbRunConfig` — seeds, tick ranges, overrides, changesAtTick points.

Core properties (each tagged with its S-rule):

1. **Determinism**: run twice, identical `JSON.stringify(trace)`. (S1/S7)
2. **Order independence**: shuffle nodes/edges arrays, identical trace. (S4)
3. **PRNG isolation**: add a disconnected node, all pre-existing entities' state sequences unchanged. (S7)
4. **Prefix stability**: `changesAtTick at t` → ticks < t bit-identical to base run. (S6)
5. **Conservation**: all-stock→stock-flow graphs keep total sum constant. (S10)
6. **Error containment**: inject a throwing/NaN behavior at a random entity → run completes, exactly that entity in error state, all others match the run without it... (weaker: run completes + error is sticky + deterministic). (S8/S9)
7. **Snapshot serializability**: every snapshot survives `structuredClone` and JSON round-trip unchanged (it must cross capnweb). (S12)

### 3.3 Oracle fixtures (`src/fixtures/`)

One module per design-doc domain. Each exports `buildGraph(): GraphDef`, `oracle` (closed-form or reference implementation), and `properties` (used later as *user-level* Loom properties — the fixtures graduate into seed examples and verify-mode test subjects). These are the acceptance tests for C1.

| Fixture | Exercises | Oracle |
| --- | --- | --- |
| `compound-interest` | stock + self-loop flow | `P(1+r)^t` analytical |
| `fire` | variable → flow → stock chains, liveness ("FIRE by tick N") | closed-form annuity accumulation |
| `dcf` | derived-variable topo chains (`fcf = revenue − opex − capex − tax`), NPV accumulator stock | spreadsheet-style reference calc in the test |
| `ws-protocol` | **north star**: 2 process nodes, lossy/latency channel edge, send/ack/retry, invariant ("no message loss") + liveness ("seq converges") | hand-computed traces for fixed seeds + invariants |
| `pert` | tick nodes + dependency structural edges + resource stock | reference critical-path algorithm |
| `traffic` (stretch) | tick state machines + process cars + road channels | invariant only ("no conflicting greens") |

Rule: **an engine phase is complete when its fixtures pass, not when its unit tests pass.**

### 3.4 Browser journeys (`e2e/journeys/`)

Playwright specs so agents can verify UI work without a human watching. Server boots via `bun server.ts` on an ephemeral port; each journey is independent (fresh temp SQLite via `DATABASE_PATH`).

- **J1 author**: palette → add stock + variable → connect flow edge → edit rate behavior in editor → save → entities persist across reload.
- **J2 explore**: seed fixture → run → scrub → canvas node badge and timeline lens reflect the scrubbed tick.
- **J3 iterate**: pin a slider → drag → curve updates live (override path) → release → config persisted → change-at-tick replay keeps prefix.
- **J4 trust**: agent chat adds nodes (LLM stubbed via a fake `LLMService` — the harness already fakes it in tests) → undo reverts the whole turn → redo restores.
- **J5 verify/investigate**: declare property on ws-protocol fixture → verify 500 seeds → open a failure → scrubber parked at violation tick, property highlighted.

J1–J2 land with phase 4; J3–J4 with their features; J5 with phase 5. Keep the total under ~2 minutes runtime.

### 3.5 Perf budgets (`src/engine/bench.test.ts`)

The Bret Victor promise is a latency budget. Encode with 3× headroom as plain timed tests (catches quadratic regressions, not micro-noise):

- Headless: 200 entities × 1,000 ticks < 250 ms.
- Interactive re-sim (slider path): 50 entities × 200 ticks < 50 ms.
- Scrub: `trace[tick]` selector < 1 ms (it's an array index; the test guards accidental recomputation).

### 3.6 CI and tasks

- Add `.github/workflows/ci.yml`: `bun install --frozen-lockfile` → `bunx tsc --noEmit` → `bunx oxlint .` → `bun test`. Property tests run with a fixed fast-check seed in CI (reproducible) and random seeds locally (exploratory); on failure fast-check prints the shrunk counterexample — paste it into a regression test.
- Add mise tasks: `test:props` (elevated `FC_NUM_RUNS`), `test:journeys` (playwright), `bench`. Keep `mise run ts:check && mise run lint && mise run test` as the universal gate (raw equivalents: `bunx tsc --noEmit && bunx oxlint . && bun test` where mise is unavailable).

### 3.7 Working agreement (definition of done for every task)

1. Failing test first — at the highest layer that can express the requirement (fixture > property > unit).
2. If behavior semantics changed: `docs/semantics.md` edited in the same commit, rule-tagged test updated.
3. `ts:check`, `lint`, `test` green; journeys green if UI touched; bench green if engine touched.
4. Errors are values (`Result`), no new classes outside RpcTargets, no comments except high-complexity spots — per CLAUDE.md.
5. Tool-parity check: if you added an RPC method a user can reach from the UI, either add the agent tool or note the gap in the phase-close checklist.
6. Commit per task, concise message.

Agent prompt preamble (paste verbatim when delegating):

> Read CLAUDE.md, docs/loom-design-v3.md (sections relevant to your task), docs/semantics.md, and docs/roadmap.md Part 3.7 (working agreement) + your assigned phase section. Follow the working agreement exactly: failing test first, semantics spec in sync, all gates green, commit per task.

---

## Part 4 — Build plan

Ordering: harness + semantics first (everything else renders or verifies what the engine means), then interop, then the explore loop with trust, then verify/investigate (the differentiator), then lenses, snapshots, external agent surface. Each phase is one agent-session-sized unit with fixture-level acceptance.

### Phase 3 — Semantics, harness, engine interop

Read first: `src/engine/tick-loop.ts`, `src/engine/types.ts`, `src/engine/archetypes/*`, `src/engine/compile/compile-behavior.ts`, this doc Parts 2–3.

- **3.0 Spec + harness scaffolding.** Write `docs/semantics.md` from Part 2 (S1–S12). Add `fast-check`. Create `src/engine/testing/arbitraries.ts`, `src/fixtures/` (move the compound-interest seed builder here; add oracle test `P(1+r)^t`). Add CI workflow + mise tasks (3.6). Write properties 1 and 7 from 3.2 against the *current* engine — they should pass and become the ratchet.
- **3.1 Canonical ordering + capability injection.** Topo order with id tie-break (S4); shadow `Math`/`Date`/`performance`/`crypto` in compiled behaviors (S5); error-state variant in `EntityState` with correct archetype identity (S8) and NaN policy (S9). Properties 2 and 6 written first, failing, then green.
- **3.2 Routing + derived variables.** Route tick/process outputs through passthrough edges into downstream inputs same-tick per S2/S3; back-edge delay for cycles. Variables compile a `value({ inputs, config, tick, rand })` behavior, evaluated topo-first; flow rates accept stock *and* variable sources (fixes the FIRE-breaking bug at `tick-loop.ts:86`); stock init per D9; passthrough snapshot state `{ kind: "passthrough", lastValue }`. Fixtures first: `fire` and `dcf` written failing, then green. Two-tick-node same-tick delivery test; cycle 1-tick-delay test.
- **3.3 Process nodes + channel edges.** Generator scheduler: compile `run`, drive per-node iterator, `emit` buffers into routing, `yield wait.for(port, timeout)` / `wait.ticks(n)` suspend/resume at tick boundaries (S2 step 5, S3 register rule). Channel edges compile `tick({ state, pending, config, tick, rand })` returning `{ state, deliver }`; snapshot real pending counts. Fixture first: `ws-protocol` — the north star — written failing with its invariants, then green. Loss/latency reproducible per seed.
- **3.4 PRNG streams + overrides + replay.** Per-entity streams `hash(seed, entityId)` (S7); apply `configOverrides` and `changesAtTick` (S6). Properties 3 and 4 first, then green. Conservation property 5 (S10).

Acceptance: fixtures `compound-interest`, `fire`, `dcf`, `ws-protocol` all green; all seven core properties green; bench green.

### Phase 4 — Explore loop + trust

Read first: `src/client/shell/*`, `src/client/canvas/graph-canvas.tsx`, `src/client/state/workspace-store.ts`, `src/client/editor/code-editor.tsx`, `src/server/graph/store.ts`.

- **4.1 Behavior editing.** Inspector gains CodeMirror for selected node/edge behavior; save → update → auto re-run; compile errors inline (implement the currently no-op worker `compile` RPC). Edge selection (`onEdgeClick` → `selectedEdgeId`).
- **4.2 Canvas authoring.** `onConnect` → addEdge with kind picker; node palette per archetype with default schema/behavior templates (reuse fixture templates); edge delete. Control panel drops its smoke-test editor/JSON dump; gains fixture seed buttons.
- **4.3 Transport.** Seed + tick-count inputs, play/pause (rAF over `currentTick`), run status; kill the hardcoded `{ seed: 42, toTick: 50 }`.
- **4.4 Undo/redo (D5, moved up).** Command log with inverses and batch ids in the graph store; agent turn = one batch; `undo`/`redo` RPC + buttons + shortcuts; mutation broadcasts refresh clients. Tests: inverse round-trip per op type; batch undo restores exact pre-turn state (in-memory SQLite harness exists).
- **4.5 Control panel proper (D7).** Auto-discover config fields from schemas; pin/unpin persisted in `workspace_meta`; slider drag → debounced worker re-sim via overrides; release → persist.
- **4.6 State-on-canvas + provenance.** Custom React Flow renderers (`node-types.tsx` finally used): label, kind badge, current-tick state summary, error styling. `graphVersion` stamping + stale-trace banner (S11).

Acceptance: journeys J1–J4 green. Manual north-star check: build the FIRE model from scratch in the UI, pin savings-rate, drag it, watch the FIRE date move.

### Phase 5 — Verify, shrink, investigate + agent parity

Read first: `src/server/graph/store.ts` (properties/trace tables), `src/server/services/sim-worker-bundle.ts`, `src/server/rpc/loom-server-impl.ts`, design doc §Property & Verification.

- **5.1 Node names + property CRUD (D2).** Migration: unique `name` on nodes; store + RPC + panel (list, enable/disable, CodeMirror check source, compile-on-save). Invariant + liveness kinds; statistical stays V2.
- **5.2 Headless server runner (D1).** `worker_threads` pool over the engine bundle; `runSeed(graph, seed, properties)` evaluates checks per tick in-worker, fail-fast, returns verdicts only (D3). **Differential test lands here**: server runner vs client `run()` on every fixture → identical traces (L3).
- **5.3 Batch runner + report.** `verify({ seeds, workers, properties })` streaming `onVerifyProgress`; verify panel: per-property pass counts, failing seeds, first violations.
- **5.4 Shrinker.** Dimensions per design doc: tick count (binary search), config values (halve toward defaults), seed neighborhood (±k). Tests: monotonicity (each accepted shrink step still fails the property) and idempotence on a constructed failure.
- **5.5 Investigate.** `loadFailure` → client re-runs that seed/config (D3), scrubber parked at violation tick, property + failing predicate shown, offending entities highlighted.
- **5.6 Agent parity (D4).** Tools: `run_simulation`, `read_trace`, `run_verify`, `add_property`, plus missing CRUD (`delete_node`, `delete_edge`, `update_edge`, `query_upstream`). Raise `MAX_ROUNDS` to ~12. E2e: agent builds ws-protocol from a prompt (fake LLM script), runs verify, reads the report.

Acceptance: the design doc's verify narrative runs end to end on the ws-protocol fixture: declare "no message loss" → 1,000 seeds → failures found → shrunk → explorer parked at the failing tick. Journey J5 green.

### Phase 6 — Lenses

- **6.1 Message capture.** Snapshots gain routed-message records `{ edgeId, from, to, payload }` (shallow payloads) — S12 extension, spec + tests updated.
- **6.2 Sequence lens.** Swimlanes per node, message arrows, cursor synced to scrubber. Plain SVG.
- **6.3 DAG lens.** Layered layout + critical path over `dependency` edges (pure function, oracle-tested via `pert` fixture).
- **6.4 Suggestion.** `suggest_lens` tool: structural heuristics (process+channel → sequence; dependency edges → DAG; stocks → timeline) + problem-statement keywords; `onLensSuggestion` client callback (C10).

Acceptance: ws-protocol renders a legible message sequence; `pert` fixture shows its critical path; agent suggests sensibly on all fixtures.

### Phase 7 — Snapshots + workspace polish

- **7.1 Named snapshots (D6).** Save = checkpoint + file copy; list/load RPC; load = reopen DB + full client reload. Fix the `saveWorkspace`-aliases-`loadWorkspace` stub. Round-trip test.
- **7.2 Chat-turn revert affordance** in the chat panel (batch undo from 4.4, surfaced per-turn).
- **7.3 Cleanups.** Prune teddygram vars from `.env.example`; dead code sweep.

### Phase 8 — External agent surface

- **8.1 CLI.** `bin/loom.ts` over the capnweb WS API, subcommands mirroring the design doc's Agent Interface section; JSON in/out; exit codes from RpcResult. E2e-tested against an ephemeral server.
- **8.2 MCP server.** Stdio wrapper exposing the phase-5 tool surface for Claude Code.
- **8.3 Docs.** README agent-usage section; system prompt regenerated for the full tool surface.

### V1 exit criterion — the demo script

One scripted narrative, run live, no rehearsed state (this is the vision's three-mode cycle made concrete, and the final acceptance test):

1. Open a fresh workspace; write the problem statement: "verify session resume in a websocket protocol over a lossy network".
2. Ask the agent to model it → it builds client/server process nodes + lossy channel (or seed the ws-protocol fixture and have the agent explain it).
3. **Explore**: run, watch the sequence lens, scrub a retry storm, drag the loss-rate slider and watch behavior change live.
4. **Verify**: declare "no message loss" + "seq converges by tick 100"; run 1,000 seeds; failures reported.
5. **Investigate**: shrink a failure, land in the explorer at the violating tick, understand it.
6. Fix the retry behavior in the editor; re-verify green; undo/redo the whole session's agent turns to prove trust; save a named snapshot.

When that script runs clean, Loom is the tool the vision describes — and the harness proves it keeps working.
