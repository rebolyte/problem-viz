# Loom Simulation Semantics

The executable spec for the engine. Every rule has at least one test whose name carries the rule ID (e.g. `test("S4: entity array order does not affect trace", ...)`). Changing a rule requires changing spec + tests in one commit. A rule without a green test is marked pending with the phase that implements it (see `docs/roadmap.md` Part 4, `docs/plans/4-semantics-engine.md`).

## Rules

- **S1 — Discrete time.** A run over `[0, N]` emits N+1 snapshots. Snapshot 0 is initialized state before any step. Snapshot t (t ≥ 1) is the state after step t completes.
- **S2 — Step order within a tick:**
  1. **Variables** evaluate in topological order over passthrough dependencies, reading current-tick upstream variable values and previous-tick stock/tick/process values.
  2. **Flow rates** evaluate from current-tick variable values and previous-tick stock values.
  3. **Stocks** integrate: `v' = v + Σ inflows − Σ outflows` (Euler step from previous-tick stock values).
  4. **Channel edges** step: accept messages emitted in earlier ticks, decide deliveries for this tick.
  5. **Tick and process nodes** step in topological order, receiving same-tick passthrough inputs from upstream nodes that stepped earlier in this tick, plus this tick's channel deliveries.
- **S3 — Wire vs register.** Passthrough edges are combinational: delivery within the same tick, subject to topo order. Channel edges are sequential: a message emitted at tick t is available to targets no earlier than t+1 (plus configured latency). Cycles among passthrough edges are broken at back-edges, which behave as 1-tick delays.
- **S4 — Entity-order independence.** Engine iteration uses topological order with ties broken by entity id (lexicographic) — never by array position. Permuting the `nodes`/`edges` arrays of a GraphDef yields a bit-identical trace.
- **S5 — Capability injection.** Compiled behaviors receive only injected capabilities (`state`/`ctx`, `inputs`, `config`, `tick`, `rand`, and for process nodes `emit`/`wait`). `Math.random`, `Date`, `performance`, and `crypto` are shadowed in the compiled scope to throw with "use rand from context".
- **S6 — Overrides and replay.** `RunConfig.configOverrides` merges per-entity config before tick 0. `changesAtTick: { tick, configOverrides }` applies overrides from that tick onward; ticks before it are bit-identical to the base run. Replay is always re-execution from tick 0 — no state injection, ever.
- **S7 — Per-entity randomness.** Each entity gets its own PRNG stream seeded by `hash(runSeed, entityId)`. Adding or removing one entity does not change any other entity's random sequence.
- **S8 — Errors are values.** A behavior compile failure or runtime throw never aborts the run. The entity enters `{ kind: "error", archetype, phase: "compile" | "runtime", message, tick }` state, sticky for the rest of the run, rendered distinctly, visible to property checks. Archetype identity is preserved in the error record.
- **S9 — No silent numeric coercion.** A non-finite flow rate, stock value, or variable value puts the entity in error state (S8). Never coerce NaN/Infinity to 0. An errored flow edge poisons the stocks it feeds: they enter error state rather than silently integrating without it, and an errored source node errors the flow edges reading from it.
- **S10 — Flow conservation.** A stock→stock flow edge conserves: −r from source, +r to target per tick. A self-loop flow (source === target) is a source/sink shortcut: net inflow r (may be negative), reading the stock's own previous value — the compound-interest idiom. A flow whose source is a variable draws from a cloud (no depletion). In a graph whose flows are all stock→stock non-self-loop, total stock sum is constant across ticks.
- **S11 — Trace provenance.** Every graph mutation increments a `graphVersion` counter (server-side). Every run stamps the trace with the version it ran against. A trace whose version trails the current graph is stale and the UI must say so.
- **S12 — Snapshot sufficiency.** For tick/stock/variable/flow/channel entities, the snapshot state alone suffices to render lenses and evaluate property checks at that tick. Process nodes expose `{ ctx, status: "running" | "waiting" | "done" }`; generator position is deliberately not serialized (S6 re-execution covers rewind). Every snapshot survives `structuredClone` and JSON round-trip unchanged.

## Status

| Rule | Status                                                        | Test                                                                       |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| S1   | implemented                                                   | `src/engine/tick-loop.test.ts`, `src/engine/semantics/determinism.test.ts` |
| S2   | partial (stocks/variables/flows; no routing)                  | pending task 3.2                                                           |
| S3   | pending                                                       | task 3.2 (wire), 3.3 (register)                                            |
| S4   | implemented                                                   | `src/engine/semantics/order-independence.test.ts`                          |
| S5   | implemented                                                   | `src/engine/compile/compile-behavior.test.ts` (S5 cases)                   |
| S6   | pending                                                       | task 3.4                                                                   |
| S7   | pending (single shared PRNG today)                            | task 3.4                                                                   |
| S8   | implemented                                                   | `src/engine/semantics/error-containment.test.ts`                           |
| S9   | implemented (incl. flow→stock poisoning)                      | `src/engine/semantics/error-containment.test.ts`, archetype tests          |
| S10  | partial (self-loop inflow idiom works; conservation untested) | task 3.2                                                                   |
| S11  | pending                                                       | phase 5                                                                    |
| S12  | implemented (current entity kinds)                            | `src/engine/semantics/serialization.test.ts`                               |
