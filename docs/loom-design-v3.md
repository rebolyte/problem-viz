# Loom: A Problem Visualization Toolkit

*"If you do not have a visualization for a problem, you will never solve it."*

## One-Liner

An interactive simulation canvas where humans and agents collaboratively model, run, verify, and visually explore problems — TLA+ meets Braid meets n8n meets fast-check.

---

## Core Concept

Loom is not a diagramming tool. It is a **simulation runtime with a visual frontend**. The graph isn't a picture — the nodes *run*. They hold state, emit events, react to inputs. Edges carry data between them — and can transform, delay, or drop it. You scrub through time and watch the system evolve, rewind to any tick, change a node's behavior, and replay forward to see the consequences cascade. Or you declare properties the system must satisfy and throw 10,000 seeds at it to find where it breaks.

The graph is the shared source of truth. Humans see it through an interactive canvas. Agents see it through a programmatic API. Both can read, write, query, and mutate the model. A living **Problem Statement** steers the workspace, updated collaboratively — like a system prompt for the entire visualization.

---

## Design Principles

1. **The map is not the territory, but it is how we understand it.** Tap into the visual brain. Every problem gets a visualization — start with the visualization if you have to. (Seve / autorouter philosophy)
2. **Simulate, don't just diagram.** Static pictures lie. Running models reveal emergent behavior, edge cases, and "how dumb" an approach is by showing wasted iterations. (Bret Victor, Factorio, SimCity)
3. **Deterministic rewind and replay.** Full state snapshots at every tick. Fork from any point, change behavior, play forward. Time is a scrubber, not an arrow. (Braid, Lamport's temporal logic)
4. **Graph substrate, multiple lenses.** One underlying graph, many ways to see it. The tool suggests representations based on structure and intent, but never forces a metaphor. (Tufte, Donella Meadows)
5. **Human-agent collaboration, not approval gates.** Both author the model. Undo/redo is the trust mechanism. No permission dialogs — just snapshots and revert. (Dennett's "tools for thinking")
6. **Scriptable everything, describable intent.** Node and edge behavior is always code, but you can write it yourself or describe what you want and the agent writes it. The authoring path is flexible; the execution model is uniform.
7. **Properties over proofs.** We can't exhaustively check all reachable states like TLA+, but we can throw thousands of seeds at declared properties, find failures, shrink to minimal reproductions, and hand you a scrubber parked at the exact tick where things went wrong. (fast-check, property-based testing, QuickCheck)

---

## Three Interaction Modes

### Mode 1: Explore

Single seed, interactive scrubber, Braid-style rewind. The default. You build a model, run it, watch it play out, rewind, tweak, replay. This is the thinking tool — the Bret Victor experience.

### Mode 2: Verify

Declare properties the system must satisfy. Run 10,000 seeds headless — no rendering, no canvas, just the engine. The batch runner reports which seeds fail which properties, and when. This is the property-based testing experience.

### Mode 3: Investigate

Verification found a failure at seed 7432, tick 83. The shrinker reduces it to a minimal reproduction — fewest nodes, shortest run, simplest config that still triggers the failure. That minimal case loads into the explorer with the scrubber parked at the failing tick, the violated property highlighted on the canvas. This is the bridge between "something is wrong" and "I understand why."

The three modes form a cycle: **Explore** to build intuition → **Verify** to find what you missed → **Investigate** to understand the failure → **Explore** to fix it.

---

## Architecture

### Layers

```
┌─────────────────────────────────────────────────────┐
│  UI Shell (Dockview)                                │  ← Panel windowing
│  Control Panel, Chat, Code Editor, Lens tabs         │
├─────────────────────────────────────────────────────┤
│  Canvas (React Flow + custom renderers)             │  ← Humans see this
│  Lenses: state grid, timeline, DAG, flow, plot      │
│  Charts: Recharts (+ D3 escape hatch)               │
├─────────────────────────────────────────────────────┤
│  Workspace Controller                               │  ← Problem statement,
│  Undo/redo stack, snapshot export/import             │     session management
├─────────────────────────────────────────────────────┤
│  Property & Verification System                     │  ← Declare, verify,
│  Property declarations, batch runner, shrinker       │     shrink, investigate
├─────────────────────────────────────────────────────┤
│  Agent API (CLI / MCP / HTTP)                       │  ← Agents see this
│  Query graph, mutate nodes, read traces, run verify  │
├─────────────────────────────────────────────────────┤
│  Simulation Engine                                  │  ← The runtime
│  Discrete tick loop, deterministic execution         │
│  Three node archetypes, coded edges                  │
│  Full state capture per tick                         │
├─────────────────────────────────────────────────────┤
│  Sandboxed Node Runtime (smolVM / Firecracker)      │  ← Isolation
│  Each node/edge's TypeScript runs in isolation        │
├─────────────────────────────────────────────────────┤
│  Graph Store (property graph)                       │  ← The model
│  Nodes, edges, types, properties, behavior code      │
└─────────────────────────────────────────────────────┘
```

---

## Simulation Engine

- **Discrete time**: every problem is discretized. Financial projections advance by period, protocols advance by message, project schedules advance by unit of time.
- **Tick loop**: each tick, the engine evaluates all nodes and coded edges, routes outputs, and captures state. The three node archetypes and coded edges are unified under one tick loop.
- **Deterministic**: same graph + same starting state + same seed + same tick = same result. Always. All randomness goes through a seeded PRNG.
- **Full state snapshots**: the complete state of all nodes and coded edges is captured every tick. This is the trace.
- **Rewind and modify**: scrub to any tick, change a node's code or parameters, replay forward. The old future is replaced (single mutable timeline).
- **Exported snapshots**: manually save a named snapshot of a full run. Open in another window to compare side by side. No branching infrastructure.
- **Headless mode**: for verification, the engine runs without any rendering layer. Same deterministic execution, no React Flow overhead. Parallelizable across seeds.

---

## Node Model: Three Archetypes

Informed by SimPy (process-based discrete event simulation), Mesa (agent-based tick/step modeling), XState v5 (actor model with typed state machines), Node-RED (message passing), and system dynamics tradition (Vensim, Stella, Donella Meadows).

Not every problem fits a single `tick()` function. Different problem domains have different natural grains. Loom provides three node archetypes that all participate in the same simulation timeline and can wire to each other.

### Archetype 1: Tick Nodes (Mesa-style)

A pure function called every tick. Takes immutable context, returns new state and outputs. Best for discrete agents, protocol actors, game-theoretic players, traffic light controllers — anything with simple per-step logic.

```typescript
const trafficLight = defineNode({
  kind: 'tick',
  schema: {
    context: {} as { phase: 'green' | 'yellow' | 'red'; timer: number },
    inputs: { emergency: 'boolean' },
    outputs: { signal: 'string' },
    config: { greenDuration: 'number', yellowDuration: 'number', redDuration: 'number' },
  },
  init: (config) => ({ phase: 'green', timer: config.greenDuration }),
  tick({ state, inputs, config, tick, rand }) {
    if (inputs.emergency) return { state: { phase: 'red', timer: 0 }, outputs: { signal: 'red' } };
    if (state.timer > 0) return { state: { ...state, timer: state.timer - 1 }, outputs: { signal: state.phase } };
    // Cycle to next phase
    const next = { green: 'yellow', yellow: 'red', red: 'green' } as const;
    const nextPhase = next[state.phase];
    const duration = config[`${nextPhase}Duration`];
    return { state: { phase: nextPhase, timer: duration }, outputs: { signal: nextPhase } };
  },
});
```

**Design note**: `tick()` is a pure function — no side effects. The seeded `rand()` function ensures deterministic replay even when nodes use randomness.

### Archetype 2: Stock/Flow Nodes (System Dynamics)

Accumulate values based on inflow/outflow rates defined as expressions. Best for financial models, population dynamics, resource pools, inventory — anything that's fundamentally about quantities changing over time.

```typescript
const savings = defineNode({
  kind: 'stock',
  schema: {
    config: { initialBalance: 'number' },
  },
  initial: (config) => config.initialBalance,
  // Flows are defined as edges, not code inside the node.
  // The engine calls each flow edge's rate() function each tick
  // and updates the stock: stock(t+1) = stock(t) + inflows - outflows
});

const salary = defineNode({
  kind: 'variable',  // A constant or expression, not a stock
  schema: { config: { amount: 'number' } },
  value: (config) => config.amount,
});

// The flow edge between salary and savings has a rate() function:
// rate({ source, config }) => source.value * config.savingsRate
// No string expressions — same TypeScript everywhere.
```

**Design note**: follows the system dynamics tradition from Vensim/Stella. Stocks accumulate. Flows are coded edges with typed rate functions. Variables/converters compute derived values. The engine handles the integration math. No embedded expression DSL — everything is TypeScript.

### Archetype 3: Process Nodes (SimPy-style)

Generator/async functions that yield to wait for events or durations. Best for modeling sequential behavior with waits — a client that sends a message, waits for an ack, retries on timeout. A customer that arrives, waits in line, gets served, leaves.

```typescript
const wsClient = defineNode({
  kind: 'process',
  schema: {
    context: {} as { seq: number; connected: boolean; buffer: unknown[] },
    inputs: { serverMsg: 'json' },
    outputs: { clientMsg: 'json' },
    config: { retryAfter: 'number', disconnectAtTick: 'number' },
  },
  async *run({ ctx, config, receive, emit, wait, tick }) {
    ctx.seq = 0;
    ctx.connected = true;

    while (ctx.connected) {
      if (tick() === config.disconnectAtTick) {
        ctx.connected = false;
        break;
      }
      ctx.seq++;
      emit('clientMsg', { type: 'data', seq: ctx.seq });

      // Wait for ack or timeout — yields control back to engine
      const response = yield wait.for('serverMsg', config.retryAfter);
      if (!response) {
        emit('clientMsg', { type: 'retry', seq: ctx.seq });
      }
    }
  },
});
```

**Design note**: the engine suspends and resumes process nodes at tick boundaries. A `yield wait.for('serverMsg', 5)` means "give me the next message on the serverMsg input, but if 5 ticks pass with nothing, resume with null." The generator's internal position is part of the snapshot, enabling deterministic replay and rewind.

### Archetype Interop

All three archetypes participate in the same tick loop and can wire to each other freely:

- A **process** node (websocket client) sends messages through a **coded edge** (unreliable channel with latency) to a **tick** node (server that processes one message per tick).
- A **stock** node (account balance) receives inflows from a **variable** node (salary) via a **flow edge**, and its current value is read by a **tick** node (budget checker that fires alerts).
- A **tick** node (traffic light) outputs a signal through a **passthrough edge** to a **process** node (car deciding whether to go or wait).

The engine handles the scheduling: stocks integrate flows, tick nodes run their step function, process nodes resume from their yield point. All state is captured uniformly.

### Node Authoring

Nodes are authored by:
1. **Writing TypeScript directly** — full control, any archetype
2. **Describing behavior in natural language** → agent generates the code using the `defineNode` API
3. **Selecting from a library of built-in archetypes** — pre-built nodes for common patterns: event emitter, state machine, accumulator, queue, counter, timer, etc.

The XState v5 `setup()` pattern inspires the `defineNode` schema declaration: declare your types upfront, get TypeScript inference throughout. The schema is also used by the canvas to render ports and by the agent to understand what a node accepts.

---

## Edge Model: Coded Edges

Edges are not just wires. They can carry behavior — and they participate in the simulation and snapshot system just like nodes.

### Passthrough Edges (default)

No code, instant delivery. An output value appears at the downstream input on the same tick. This is the default when you drag a connection on the canvas.

### Coded Edges

Edges with behavior: delay, loss, rate-limiting, transformation, rate expressions. Defined with the same `defineEdge` pattern:

```typescript
const unreliableChannel = defineEdge({
  kind: 'channel',
  schema: {
    config: { latency: 'number', lossRate: 'number' },
    state: {} as { buffer: Array<{ msg: unknown; deliverAt: number }> },
  },
  tick({ state, pending, config, tick, rand }) {
    // Enqueue new messages with delay, drop some
    for (const msg of pending) {
      if (rand() > config.lossRate) {
        state.buffer.push({ msg, deliverAt: tick + config.latency });
      }
    }
    // Deliver what's ready
    const ready = state.buffer.filter(m => m.deliverAt <= tick);
    state.buffer = state.buffer.filter(m => m.deliverAt > tick);
    return { state, deliver: ready.map(m => m.msg) };
  },
});
```

### Flow Edges (System Dynamics)

A special coded edge for stock-to-stock flows. The rate is a TypeScript function — no embedded expression DSL, same language everywhere:

```typescript
const investmentReturn = defineEdge({
  kind: 'flow',
  schema: {
    config: { annualReturn: 'number' },
  },
  // source.value is the current stock value, strongly typed
  rate({ source, config }) {
    return source.value * config.annualReturn;
  },
});

const savingsDeposit = defineEdge({
  kind: 'flow',
  schema: {
    config: { savingsRate: 'number' },
  },
  // source is the upstream node (e.g. salary variable)
  rate({ source, config }) {
    return source.value * config.savingsRate;
  },
});
```

The engine calls `rate()` each tick and applies the result: `stock(t+1) = stock(t) + sum(inflows) - sum(outflows)`. The rate function receives typed references to connected nodes — no magic string resolution.

### Structural Edges (non-simulated)

Some edges don't participate in the tick loop at all. They exist for the graph structure and are used by lenses:

- **Dependency**: A must complete before B starts (used by DAG/PERT lens for critical path)
- **Ownership / containment**: A contains B (used by topology lens for grouping)
- **Causation**: A caused B (used by trace analysis)

---

## Property & Verification System

The bridge between interactive exploration and systematic correctness checking. Inspired by property-based testing (fast-check, QuickCheck, Hypothesis), TLA+ safety/liveness properties, and Monte Carlo simulation.

### Property Declarations

Properties are predicates that the simulation must satisfy. They live at the workspace level alongside the problem statement and graph definition.

```typescript
const workspace = defineWorkspace({
  // ... nodes, edges, problem statement ...

  properties: {
    // INVARIANT — must hold at every tick of every run
    noMessageLoss: {
      kind: 'invariant',
      check: ({ nodes }) =>
        nodes.server.state.received.length >=
        nodes.client.state.sent.length - nodes.channel.state.inFlight.length,
      description: 'Server has received all messages not currently in flight',
    },

    // LIVENESS — must hold eventually (by a specified tick)
    sequenceConverges: {
      kind: 'liveness',
      by: 100,
      check: ({ nodes }) =>
        nodes.client.state.seq === nodes.server.state.lastAcked,
      description: 'Client and server agree on sequence number by tick 100',
    },

    // STATISTICAL — property of the distribution across runs, not a single run
    p99Latency: {
      kind: 'statistical',
      check: ({ runs }) =>
        percentile(runs.map(r => r.metrics.maxLatency), 99) < 50,
      description: 'P99 max latency across runs is under 50 ticks',
    },

    // STATISTICAL — ruin probability for financial models
    ruinProbability: {
      kind: 'statistical',
      check: ({ runs }) => {
        const ruined = runs.filter(r => r.finalState.nodes.netWorth.value <= 0);
        return ruined.length / runs.length < 0.05;
      },
      description: 'Probability of ruin (net worth ≤ 0) is under 5%',
    },
  },
});
```

### Three Kinds of Properties

**Invariants** — must hold at every tick of every run. These are safety properties. "No node holds a lock it didn't acquire." "Account balance never goes negative." "Server has received all non-in-flight messages." The verifier checks after every tick and fails fast on violation.

**Liveness / Convergence** — must hold *eventually*, by a specified tick or by end of run. "All peers agree on the leader by tick N." "The system drains its message queue before termination." The verifier checks at the specified tick and reports failure if the predicate is false.

**Statistical** — properties of the *distribution* across runs, not any single run. "P99 latency under 50 ticks." "Bankruptcy probability under 5% across 10k FIRE simulations." "Mean throughput within 10% of theoretical maximum." These are evaluated after all seeds complete. This is where the DCF model and FIRE projections become genuinely useful — not "what happens with WACC=8%" but "what's my ruin probability across a distribution of market conditions."

### Batch Runner

The verification engine runs simulations headless — same deterministic engine, no rendering overhead. Parallelizable across seeds and (eventually) across machines.

```
loom verify --seeds=10000 --workers=8
```

Output: a report of which properties passed, which failed, and for failures: the seed, the tick, and the failing property.

```
✓ noMessageLoss          10000/10000 seeds passed
✗ sequenceConverges      9847/10000 seeds passed
  → 153 failures, first at seed 7432 tick 83
  → shrunk to seed 7432, 3 nodes, 47 ticks (minimal reproduction)
✓ p99Latency             p99 = 34 ticks (threshold: 50)
✓ ruinProbability        2.3% (threshold: 5%)
```

### Shrinker

When a property fails, the shrinker searches for a minimal reproduction — the smallest config, fewest nodes, and shortest run that still triggers the failure. Shrinking dimensions are configurable:

- **Tick count**: does a shorter run still fail?
- **Config values**: does a simpler config still fail? (fewer clients, lower emit rate, shorter timeouts)
- **Seed neighborhood**: does the failure reproduce with nearby seeds? (fragile vs. structural)

The shrinker produces a minimal failing case that can be loaded directly into the explorer (Mode 3: Investigate).

### Investigate: From Failure to Understanding

The minimal reproduction loads into the explorer with:
- The scrubber parked at the failing tick
- The violated property highlighted in the UI
- Failing nodes/edges visually marked (red glow, expanded state panel)
- The property's description shown alongside the state that violates it

From there, it's Braid: rewind, inspect state at each tick, understand the sequence of events that led to failure, modify behavior, replay, re-verify.

### Agent Integration with Verification

The agent can participate in the full verify cycle:

1. **Describe a property in natural language** → agent writes the check function
2. **Run verification** → agent kicks off the batch runner
3. **Interpret results** → agent reads the failure report, loads the minimal reproduction
4. **Propose a fix** → agent modifies node behavior, re-runs verification
5. **Confirm** → human reviews the fix in the explorer, accepts or reverts

---

## Lenses

A lens is a rendering strategy that maps the graph (or a subgraph) to a visual representation. The tool ships with built-in lenses and supports custom ones:

| Lens | Good for | Renders as |
|------|----------|------------|
| **State Matrix** | Protocol design, game theory | Grid of (entity_A_state × entity_B_state) with action/outcome per cell |
| **Timeline / Sequence** | Distributed systems, message protocols | Vertical swimlanes with messages as arrows, scrubber for time |
| **DAG** | Project management (PERT), dependency graphs | Directed graph with critical path highlighting |
| **Flow** | Data pipelines, n8n-style workflows | Left-to-right dataflow with animated data on edges |
| **Plot / Chart** | Financial projections, metrics over time | Line/bar charts of node state properties over ticks |
| **Distribution** | Verification results, Monte Carlo | Histograms, CDFs, scatter plots across seeds |
| **Topology** | Network architecture, system design | Spatial layout of nodes with connection types |
| **Custom** | Anything | User-defined React component that receives graph + trace data |

Multiple lenses can be active simultaneously in split panes. The agent can suggest lenses based on graph structure and the problem statement.

The **Distribution lens** is new — it only activates in verify mode and shows aggregate results across seeds: histograms of final values, CDF curves for latency, scatter plots of (seed × failure tick), heatmaps of which config regions produce failures.

---

## Problem Statement

A persistent, editable text block at the workspace level. Functions as:
- Context for the agent (like a system prompt)
- Steering for lens suggestions ("I need to understand capacity over time" → plot lens, DAG lens)
- Documentation for the model's purpose
- Updated collaboratively: human types directly, or agent proposes updates based on conversation

---

## Agent Interface

The agent interacts through a structured API (exposed via CLI, MCP server, or HTTP):

```
# Graph manipulation
loom nodes list [--type=<type>]
loom nodes add <type> [--properties=<json>] [--behavior=<file>]
loom nodes update <id> [--properties=<json>] [--behavior=<file>]
loom edges add <from> <to> [--type=<type>] [--properties=<json>] [--behavior=<file>]
loom edges update <id> [--properties=<json>] [--behavior=<file>]
loom graph query <cypher-like-query>

# Simulation (explore mode)
loom sim run [--seed=<n>] [--from-tick=<n>] [--to-tick=<n>]
loom sim state [--tick=<n>]
loom trace get [--node=<id>] [--tick-range=<start:end>]

# Verification (verify mode)
loom verify [--seeds=<n>] [--workers=<n>] [--property=<name>]
loom verify shrink <seed> <property>
loom verify report [--format=json|text]
loom verify load <seed> [--tick=<n>]  # Load failure into explorer

# Properties
loom property list
loom property add <name> --kind=<invariant|liveness|statistical> --check=<file>
loom property update <name> [--check=<file>]

# Workspace
loom problem-statement get
loom problem-statement set "<text>"
loom snapshot save <name>
loom snapshot load <name>
loom lens suggest
loom lens activate <lens> [--config=<json>]
```

---

## Graph Store

A property graph (nodes and edges with typed properties). Implementation for V1: in-memory TypeScript data structure, serialized to JSON on disk.

Every node has:
- `id: string`
- `kind: 'tick' | 'stock' | 'variable' | 'process'`
- `schema: NodeSchema` (typed inputs, outputs, config, context)
- `behavior: string` (TypeScript source for the node's logic)
- `config: Record<string, unknown>` (current config values)
- `properties: Record<string, unknown>` (metadata, display properties)

Every edge has:
- `id: string`
- `source: string` (node id + optional port name)
- `target: string` (node id + optional port name)
- `kind: 'passthrough' | 'channel' | 'flow' | 'dependency' | 'ownership' | 'causation' | 'custom'`
- `behavior?: string` (TypeScript source, for coded edges)
- `config: Record<string, unknown>`
- `properties: Record<string, unknown>`

---

## Undo/Redo & Snapshots

- **Undo/redo stack**: all canvas and model mutations are tracked. Conversation turns are also revertible as a unit.
- **Named snapshots**: manually export full workspace state (graph + trace + problem statement + properties + lens config + panel layout + pinned controls) as a file. Import into another window for comparison.
- **No branching**: single mutable timeline. Change behavior and replay = new timeline replaces old.

---

## UI Framework & Layout

### Windowing: Dockview

The workspace uses Dockview as the panel/docking framework — zero dependency, React-native, supports tabs, groups, grids, splitviews, drag and drop, floating panels, and popout windows. Layout state serializes with `api.toJSON()` / `api.fromJSON()`, so workspace snapshots include the full panel arrangement.

### Default Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Problem Statement                                    [Edit] │
├───────────────┬───────────────────────────────┬──────────────┤
│ Control Panel │                               │     Chat     │
│ ┌───────────┐ │        Canvas                 │              │
│ │ WACC      │ │     (React Flow)              │ You: model   │
│ │ ○────●─── │ │                               │ the session  │
│ │ 0.08      │ │  [client]──ch──[server]       │ resume...    │
│ ├───────────┤ │      \          │            │              │
│ │ Growth    │ │      [node]────[node]        │ Agent: I've  │
│ │ ○──●───── │ │                               │ added two    │
│ │ 0.10      │ │                               │ process      │
│ ├───────────┤ │   [floating: Code Editor]    │ nodes...     │
│ │ Loss Rate │ │   ┌──────────────────────┐   │              │
│ │ ○●─────── │ │   │ async *run({ ctx }) { │   │              │
│ │ 0.02      │ │   │   ctx.seq++;          │   │              │
│ ├───────────┤ │   │   emit('msg', ...);   │   │              │
│ │ Seed      │ │   └──────────────────────┘   │              │
│ │ [7432   ] │ │                               │ [input...  ] │
│ └───────────┘ │                               │              │
├───────────────┴───────────────────────────────┴──────────────┤
│  ◄━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━► │
│  Tick: 83/200   ▶ ⏸ ⏪                          [Snapshot ▼] │
├──────────────────────────────────────────────────────────────┤
│  Lens: Timeline ║ Plot ║ State Matrix ║ Verify Results       │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Client  ──msg(seq=4)──►  Channel  ──msg(seq=4)──►  Srv ││
│  │          ◄──ack(seq=3)──           ◄──ack(seq=3)──       ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

Every panel is a Dockview panel — users can drag, dock, float, pop out to separate windows. The agent can open/close/focus panels programmatically. The full layout persists with workspace snapshots.

**Left sidebar: Control Panel** — pinned sliders, inputs, and derived controls for the parameters that matter right now. Always visible.

**Center: Canvas** — React Flow graph. The main visual workspace. Code editors float over it when you click a node or edge to edit behavior.

**Right sidebar: Chat** — conversation with the agent. The agent can update the model, suggest lenses, write properties, kick off verification. Conversation turns are undoable.

**Bottom: Timeline scrubber** — always visible transport bar. Play, pause, rewind, scrub to any tick.

**Bottom: Lens tabs** — tabbed lens panels below the canvas. Multiple lenses can be active. Switch between timeline, plot, state matrix, verify results.

### Code Editor: CodeMirror

Inline code editing uses CodeMirror (not Monaco) — lighter weight, better extensibility, composition-friendly for embedding in floating panels and inline node editing. Configured with TypeScript language support and completions for the `defineNode` / `defineEdge` API.

Code editors appear as:
- **Floating panel**: click a node on the canvas → CodeMirror panel floats over the canvas. Drag to dock it if you want it persistent.
- **Inline on node**: small code preview directly on the canvas node, click to expand into full editor.
- **Docked panel**: drag the floating editor to any edge to dock it alongside the canvas, lens panels, etc.

### Charts: Recharts

Plot and distribution lenses use Recharts for V1 — React-native, handles line/bar/scatter/area well, minimal setup. D3 is available as an escape hatch for custom lenses that need full SVG control, but Recharts covers the standard cases without the ceremony.

---

## Control Panel

The Control Panel is a persistent workspace-level UI where parameters surface as interactive controls. It is the primary mechanism for the Bret Victor "scrub and see" experience.

### Auto-Discovery

Every config field on every node and edge declares its type and constraints in the schema:

```typescript
schema: {
  config: {
    wacc: { type: 'number', min: 0.01, max: 0.20, step: 0.005, default: 0.08 },
    growthRate: { type: 'number', min: -0.05, max: 0.30, step: 0.01, default: 0.10 },
    retryEnabled: { type: 'boolean', default: true },
    strategy: { type: 'enum', options: ['aggressive', 'conservative', 'balanced'], default: 'balanced' },
  },
}
```

The system auto-generates the appropriate control: sliders for numbers (with min/max/step), toggles for booleans, dropdowns for enums. These live on the node's inspector, but the important ones get **pinned** to the Control Panel for persistent access.

### Pinning

Not every config field needs a persistent slider — 40 sliders is noise. Controls are pinned to the Control Panel by:
- **Human**: drag a config field from a node's inspector to the Control Panel
- **Agent**: "these are the key parameters for your problem statement" → agent pins the relevant controls
- **Auto-suggest**: the agent can analyze the problem statement and graph structure to suggest which controls to pin

### Derived Controls

Sometimes you want a single knob that adjusts multiple parameters. Derived controls are definable as functions:

```typescript
defineControl({
  name: 'Risk Tolerance',
  type: 'number', min: 0, max: 1, step: 0.1,
  apply(value, graph) {
    graph.nodes.portfolio.config.returnRate = 0.04 + value * 0.12;
    graph.nodes.portfolio.config.volatility = 0.05 + value * 0.25;
    graph.edges.allocation.config.stockRatio = 0.3 + value * 0.5;
  },
});
```

These appear alongside pinned controls in the Control Panel. The agent can create them from natural language: "give me a risk tolerance knob that adjusts return rate, volatility, and stock allocation together."

### Instant Re-Simulation

When you drag a slider, the simulation re-runs from tick 0 (or from the current rewind point) and the visualization updates live. For small models this is instant. For larger ones, the engine debounces and shows a preview indicator during re-simulation.

### Control Types

| Schema type | Control | Behavior on change |
|-------------|---------|-------------------|
| `number` with min/max | Slider | Re-simulate from current rewind point |
| `number` without bounds | Number input | Re-simulate on blur/enter |
| `boolean` | Toggle | Re-simulate immediately |
| `enum` | Dropdown | Re-simulate on selection |
| `Derived` | Slider/custom | Applies function, then re-simulates |
| `Seed` | Number input | Re-simulate with new seed |

---

## V1 Scope

### Target user
James, working on SDLC / system design / basic finance problems.

### Tech stack
- **UI framework**: React + Dockview (panel windowing/docking) + UnoCSS (styling)
- **Canvas**: React Flow (node graph with custom animated SVG edges)
- **Code editor**: CodeMirror (inline/floating code editing with TypeScript support)
- **Charts**: Recharts (plot/distribution lenses), D3 escape hatch for custom lenses
- **Simulation server**: TypeScript (Node.js), sandboxed node/edge execution via smolVM or Firecracker
- **Batch runner**: headless simulation engine, parallelizable across seeds via worker threads
- **Deployment**: single tenant, local (Tauri or Electron wrapper optional, or just localhost)
- **Storage**: filesystem (JSON) for V1
- **Agent integration**: CLI + MCP server for Claude Code / Claude chat

### What V1 must do
1. Define a graph with typed nodes (all three archetypes) and edges (passthrough + coded) through the canvas or the agent API
2. Write or generate node/edge behavior as TypeScript functions via embedded CodeMirror editor
3. Run a discrete deterministic simulation and capture full state traces
4. Scrub through the timeline — see state at any tick (Mode 1: Explore)
5. Rewind to any tick, modify a node's config or behavior, replay forward
6. Control Panel with pinned sliders/inputs, auto-generated from node schemas, with instant re-simulation on change
7. Declare properties (invariants and liveness) and run batch verification across seeds (Mode 2: Verify)
8. Shrink failing seeds to minimal reproductions and load into explorer (Mode 3: Investigate)
9. Render the graph through at least 2 lenses: topology/flow view and timeline/sequence view
10. Dockview-based panel layout with canvas, control panel, chat, lenses, floating code editors
11. Chat sidebar for agent conversation — agent can mutate graph, suggest lenses, write properties, run verification
12. Save/load named snapshots (including panel layout and pinned controls)
13. Undo/redo for all mutations (including agent conversation turns)
14. Problem statement as a live editable workspace field
15. Agent can query, mutate, simulate, and verify through CLI

### What V1 does not do
- Statistical properties across runs (V1 verifies per-run properties; statistical aggregation is V2)
- Distribution lens (requires statistical properties)
- Branching timelines or side-by-side comparison (manual via separate windows)
- Continuous time simulation
- Dynamic node creation mid-simulation (fixed topology per run)
- Spatial primitives (grids, continuous 2D space)
- Multi-user / multi-tenant
- Cross-workspace linking
- Custom lens authoring (hardcoded lenses only in V1)
- Production-grade sandboxing (V1 can use basic isolation; Firecracker is stretch)

---

## Problem Domains to Validate Against

### 1. Distributed WebSocket Protocol (system design)

Model client and server as **process nodes** with sequential connect/send/ack/retry behavior. Communication channel as a **coded edge** with configurable latency and loss. State matrix lens for (client_state × server_state) pairs. Timeline lens for message sequence.

**Properties:**
- Invariant: server received count >= client sent count minus in-flight count
- Liveness: client and server agree on sequence number by tick 100
- Invariant: no duplicate message delivery

**Verify**: 10k seeds with varying disconnect timing and loss rates. Shrinker finds minimal scenario where session resume fails.

### 2. PERT Chart / Project Schedule (SDLC)

Tasks as **tick nodes** with duration and resource requirements. Dependencies as **structural edges**. Resource pool as a **stock node** (available developer-hours). DAG lens with critical path highlighting. Plot lens for resource utilization over time.

**Properties:**
- Invariant: no task starts before all dependencies complete
- Liveness: all tasks complete by deadline tick
- Statistical (V2): P90 project duration across runs with stochastic task durations

### 3. FIRE Projection (personal finance)

Income, expenses, investments as **stock nodes**. Salary, savings rate, return rate as **variable nodes**. Money flows as **flow edges** with typed rate functions (e.g. `rate({ source, config }) => source.value * config.savingsRate`). Plot lens for net worth, portfolio value, passive income over time.

**Properties:**
- Invariant: no negative account balances (or flag if this happens)
- Liveness: passive income exceeds expenses by tick N (FIRE number reached)
- Statistical (V2): ruin probability under 5% across 10k seeds with stochastic market returns

**Explore**: scrub the savings rate or return rate and watch the FIRE date shift in real time.

### 4. Traffic Simulation

Intersections as **tick nodes** (traffic light state machines). Cars as **process nodes** (drive to A, wait for green, drive to B). Roads as **coded edges** with travel time based on speed limit and congestion. Topology lens for the road network. Plot lens for throughput per intersection.

**Properties:**
- Invariant: no two conflicting green signals at same intersection
- Liveness: all cars reach destination within 200 ticks
- Statistical (V2): mean commute time under threshold

### 5. DCF Valuation Model

Revenue, OpEx, CapEx, tax as **stock/variable nodes**. Free cash flow as a **variable** node: `[Revenue] - [OpEx] - [CapEx] - [Tax]`. Discount factor as a variable: `1 / (1 + [WACC]) ^ [tick]`. NPV as a **stock** accumulating `[FCF] * [DiscountFactor]` each period. Terminal value plugs in at final tick.

**Properties:**
- Invariant: FCF calculation is consistent (sum of parts = total)
- Liveness: model reaches terminal value calculation

**Explore**: scrub WACC or growth rate and watch NPV curve shift.

---

## What Loom Handles Well vs. Not

### Strong fit
- Distributed systems and protocols
- System dynamics (stocks, flows, feedback loops)
- Financial modeling and projections
- Project management simulation
- Queuing theory (call centers, ER triage)
- Game theory (iterated games, strategy tournaments)
- Supply chain / inventory modeling
- Digital circuit / logic simulation
- Epidemic models (SIR, SEIR)
- Predator-prey and population dynamics

### Workable with known limitations
- **Load balancing / autoscaling**: needs dynamic node creation (not in V1, use pre-allocated inactive nodes)
- **Large network routing**: 1000s of nodes stress React Flow rendering and snapshot storage
- **Cellular automata**: needs spatial grid primitive, not graph nodes (out of scope for V1)
- **Monte Carlo sampling**: works for property verification, but not designed as a general batch computation framework

### Wrong tool
- **Continuous physics** (fluid dynamics, orbital mechanics): needs adaptive step sizes and PDE solvers
- **Analog circuit simulation**: needs simultaneous equation solving (SPICE), not independent tick functions
- **Optimization / search** (TSP, constraint satisfaction): needs solution space exploration, not single-path simulation
- **Exhaustive model checking**: can't prove "no deadlock exists" across all reachable states — use TLA+ for that
- **ML training**: wrong grain, wrong computation model
- **Real-time streaming**: deterministic replay breaks with live external data

---

## Influences

| Source | What to take |
|--------|-------------|
| **Bret Victor** | Direct manipulation, immediate feedback, scrubbing through time |
| **TLA+** (Lamport) | Temporal logic, safety/liveness properties, specification-first thinking |
| **Braid** (Blow) | Rewind-and-modify as a core mechanic, deterministic replay |
| **fast-check / QuickCheck** | Property declarations, seed-based verification, shrinking to minimal reproductions |
| **Donella Meadows** | Systems thinking, stocks & flows, feedback loops, leverage points |
| **Daniel Dennett** | Thinking tools, intuition pumps, making the implicit explicit |
| **Factorio / SimCity** | Emergent complexity from simple rules, visual feedback on throughput |
| **n8n / Node-RED** | Dataflow graph as UI, nodes with behavior, visual wiring, message passing |
| **SimPy** | Process-based simulation, generator functions for sequential wait-based behavior |
| **Mesa** | Agent-based tick/step model, scheduler, data collection, hybrid event scheduling |
| **XState v5** | Actor model, typed state machines, `setup()` pattern for schema declaration |
| **System dynamics** (Vensim, Stella) | Stocks, flows, rate expressions, visual integration |
| **Mathematica** | Notebook-style exploration, symbolic + numeric, instant visualization |
| **Seve (autorouter)** | Visualize the problem first, animate iterations, cache pre-solved subproblems |
| **Tufte** | Right representation for the data, information density, no chart junk |
| **Transformer architecture** | Attention as a lens — what is this node "attending to"? |
