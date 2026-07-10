# Phase 3 Plan: Semantics, Harness, Engine Interop

Execution plan for roadmap Phase 3 (`docs/roadmap.md` Part 4). Each numbered step is one commit. Every step: failing test first, then implementation, then `mise run ts:check && mise run lint && mise run test` green (raw: `bunx tsc --noEmit && bunx oxlint . && bun test`).

Read first: `docs/semantics.md`, `src/engine/tick-loop.ts`, `src/engine/types.ts`, `src/engine/archetypes/*`, `src/engine/compile/compile-behavior.ts`, roadmap Parts 2–3.

## Task 3.0 — Spec + harness scaffolding

1. **Docs**: `docs/semantics.md` from roadmap Part 2 (S1–S12, status table mapping rule → test or pending phase). This plan doc.
2. **Fixture**: `src/fixtures/compound-interest.ts` — `buildGraph(params): GraphDef` + `oracle(tick, params) = P(1+r)^t`. Test `compound-interest.test.ts`: run 20 ticks, each snapshot matches oracle within 1e-9 relative. `src/client/state/seed-example.ts` becomes a mapper from the fixture to `CreateNodeInput`/`CreateEdgeInput` (unique ids + positions preserved; existing seed-example tests stay green).
3. **Arbitraries**: add `fast-check`; `src/engine/testing/fc.ts` (env-driven `seed`/`numRuns` params for CI reproducibility); `src/engine/testing/arbitraries.ts` — `arbGraph` (stocks, variables, tick nodes from a vetted behavior-template pool, flow + passthrough edges, self-loops included), `arbRunConfig`. Scope templates to what the current engine executes.
4. **Ratchet properties**: `src/engine/semantics/determinism.test.ts` (property 1 / S1+S7-weak: same graph + seed run twice → identical trace JSON) and `src/engine/semantics/serialization.test.ts` (property 7 / S12: every snapshot survives `structuredClone` and JSON round-trip). Both pass against the current engine — they are the ratchet later tasks must not break.
5. **CI + tasks**: `.github/workflows/ci.yml` (install → tsc → oxlint → oxfmt --check → test, `FC_SEED` pinned); mise task `test:props` (elevated `FC_NUM_RUNS`).

## Task 3.1 — Canonical ordering + capability injection

1. Failing test `semantics/order-independence.test.ts` (property 2 / S4): shuffle `nodes`/`edges` arrays → identical trace. Implement: engine iterates entities in topo order with lexicographic id tie-break, never array order. (Full topo lands with 3.2; this step at minimum sorts by id so array order is irrelevant.)
2. Failing test in `compile-behavior.test.ts`: behavior calling `Math.random()`/`Date.now()` → runtime error result, message says "use rand from context" (S5). Implement: `new Function("defineNode", "Math", "Date", "performance", "crypto", source)` with throwing shadows.
3. Failing tests for S8/S9: `EntityState` gains `{ kind: "error", archetype, phase: "compile" | "runtime", message, tick }`; erroring entity is sticky-error with correct archetype identity (kills the "everything becomes kind:tick" bug); non-finite flow rate / stock / variable value → error state, never silent 0. Update `flow-edge.ts` silent-0 paths. Property 6 (error containment) added to semantics suite.
4. Update `docs/semantics.md` status table; timeline lens + inspector render error state minimally (no styling work — just don't crash).

## Task 3.2 — Routing + derived variables

1. Fixtures first, failing: `src/fixtures/fire.ts` (salary variable → flow → savings stock; oracle: closed-form accumulation) and `src/fixtures/dcf.ts` (variable chain `fcf = revenue − opex`; NPV stock; spreadsheet-style oracle in test).
2. Topo order over passthrough edges (S2); back-edge detection → 1-tick delay (S3). Unit tests: two tick nodes A→B same-tick delivery; A→B→A cycle delays exactly one tick.
3. Variables compile `value({ inputs, config, tick, rand })` behavior; evaluate topo-first (S2 step 1). Flow rates accept stock and variable sources (fixes `tick-loop.ts:86`); current-tick variable values, prev-tick stock values (S2 step 2).
4. Stock init per D9 (init behavior → schema-declared field → `initialBalance` → 0). Passthrough snapshot `{ kind: "passthrough", lastValue }`.
5. Route tick-node outputs through passthrough edges into downstream `inputs` same tick. Conservation property 5 (S10) added: all-stock→stock-flow graphs keep total sum constant.
6. `fire` + `dcf` green; semantics status table updated.

## Task 3.3 — Process nodes + channel edges

1. Fixture first, failing: `src/fixtures/ws-protocol.ts` — client/server process nodes, lossy+latency channel edge, send/ack/retry; invariants ("no message loss", "seq converges") as plain test assertions for now (graduate to Loom properties in phase 6); hand-computed traces for 2 fixed seeds.
2. Compile `run` generator; per-node driver: `emit(port, value)` buffers into routing; `yield wait.for(port, timeout)` / `yield wait.ticks(n)` suspend, resume at tick boundary with matched input or null (S2 step 5). Snapshot `{ kind: "process", ctx, status }` (S12 — no generator position, rewind = re-run per S6).
3. Channel edges: compile `tick({ state, pending, config, tick, rand })` → `{ state, deliver }`; emitted-at-t available no earlier than t+1 (S3); real pending counts in snapshots.
4. Routed-message records `{ edgeId, from, to, payload }` added to snapshots (shallow payloads); S12 extended in spec same commit.
5. `ws-protocol` green; loss/latency reproducible per seed.

## Task 3.4 — PRNG streams + overrides + replay

1. Failing property 3 (S7): disconnected node added → all other entities' state sequences unchanged. Implement per-entity streams `makePrng(hash(seed, entityId))`.
2. Failing property 4 (S6): `changesAtTick { tick, configOverrides }` → ticks < t bit-identical to base run. Implement `configOverrides` merge at tick 0 + `changesAtTick` merge from t.
3. `graphVersion` groundwork deferred to phase 5 (S11 is a server/client concern).
4. Bench (`src/engine/bench.test.ts`, roadmap 3.5 budgets, 3× headroom) + mise `bench` task.

## Phase exit gate

Fixtures `compound-interest`, `fire`, `dcf`, `ws-protocol` green; properties 1–7 green; bench green; `docs/semantics.md` status table shows S1–S10, S12 implemented (S11 pending phase 5).
