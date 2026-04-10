This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.
The content has been processed where security check has been disabled.

<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<file_format>
The content is organized as follows:

1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:

- File path as an attribute
- Full contents of the file
  </file_format>

<usage_guidelines>

- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.
  </usage_guidelines>

<notes>
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: examples/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Security check has been disabled - content may contain sensitive information
- Files are sorted by Git change count (files with more changes are at the bottom)
</notes>

</file_summary>

<directory_structure>
examples/
batch-pipelining/
client.mjs
README.md
server-node.mjs
worker-react/
src/
worker.ts
web/
src/
main/
App.tsx
main.tsx
index.html
package.json
tsconfig.json
vite.config.ts
README.md
wrangler.toml
README.md
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="examples/batch-pipelining/client.mjs">
// Client demonstrating:
// - Batching + pipelining: multiple dependent calls, one round trip.
// - Non-batched sequential calls: multiple round trips.
//
// Usage (separate terminal from server):
//   node examples/batch-pipelining/client.mjs

import { performance } from 'node:perf_hooks';
import { newHttpBatchRpcSession } from '../../dist/index.js';

// Mirror of the server API shape (for reference only).
// authenticate(sessionToken) -> { id, name }
// getUserProfile(userId) -> { id, bio }
// getNotifications(userId) -> string[]

const RPC_URL = process.env.RPC_URL || 'http://localhost:3000/rpc';
const SIMULATED_RTT_MS = Number(process.env.SIMULATED_RTT_MS ?? 120); // per-direction
const SIMULATED_RTT_JITTER_MS = Number(process.env.SIMULATED_RTT_JITTER_MS ?? 40);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jittered = () => SIMULATED_RTT_MS + (SIMULATED_RTT_JITTER_MS ? Math.random() \* SIMULATED_RTT_JITTER_MS : 0);

// Wrap fetch to count RPC POSTs for clear logging.
const originalFetch = globalThis.fetch;
let fetchCount = 0;
globalThis.fetch = async (input, init) => {
const method = init?.method || (input instanceof Request ? input.method : 'GET');
const url = input instanceof Request ? input.url : String(input);
if (url.startsWith(RPC_URL) && method === 'POST') {
fetchCount++;
// Simulate uplink and downlink latency for each RPC POST.
await sleep(jittered());
const resp = await originalFetch(input, init);
await sleep(jittered());
return resp;
}
return originalFetch(input, init);
};

async function runPipelined() {
fetchCount = 0;
const t0 = performance.now();

const api = newHttpBatchRpcSession(RPC_URL);
const user = api.authenticate('cookie-123');
const profile = api.getUserProfile(user.id);
const notifications = api.getNotifications(user.id);

const [u, p, n] = await Promise.all([user, profile, notifications]);

const t1 = performance.now();
return { u, p, n, ms: t1 - t0, posts: fetchCount };
}

async function runSequential() {
fetchCount = 0;
const t0 = performance.now();

// 1) Authenticate (1 round trip)
const api1 = newHttpBatchRpcSession(RPC_URL);
const u = await api1.authenticate('cookie-123');

// 2) Fetch profile (2nd round trip)
const api2 = newHttpBatchRpcSession(RPC_URL);
const p = await api2.getUserProfile(u.id);

// 3) Fetch notifications (3rd round trip)
const api3 = newHttpBatchRpcSession(RPC_URL);
const n = await api3.getNotifications(u.id);

const t1 = performance.now();
return { u, p, n, ms: t1 - t0, posts: fetchCount };
}

async function main() {
console.log(`Simulated network RTT (each direction): ~${SIMULATED_RTT_MS}ms ±${SIMULATED_RTT_JITTER_MS}ms`);
console.log('--- Running pipelined (batched, single round trip) ---');
const pipelined = await runPipelined();
console.log(`HTTP POSTs: ${pipelined.posts}`);
console.log(`Time: ${pipelined.ms.toFixed(2)} ms`);
console.log('Authenticated user:', pipelined.u);
console.log('Profile:', pipelined.p);
console.log('Notifications:', pipelined.n);

console.log('\n--- Running sequential (non-batched, multiple round trips) ---');
const sequential = await runSequential();
console.log(`HTTP POSTs: ${sequential.posts}`);
console.log(`Time: ${sequential.ms.toFixed(2)} ms`);
console.log('Authenticated user:', sequential.u);
console.log('Profile:', sequential.p);
console.log('Notifications:', sequential.n);

console.log('\nSummary:');
console.log(`Pipelined: ${pipelined.posts} POST, ${pipelined.ms.toFixed(2)} ms`);
console.log(`Sequential: ${sequential.posts} POSTs, ${sequential.ms.toFixed(2)} ms`);
}

main().catch((err) => {
console.error(err);
process.exitCode = 1;
});
</file>

<file path="examples/batch-pipelining/README.md">
Batch + Pipelining (Single Round Trip)

This example shows how to issue a sequence of dependent RPC calls that all execute on the server in a single HTTP round trip using batching and promise pipelining.

What it does

- Authenticates a user.
- Uses the returned user ID (without awaiting) to fetch the profile and notifications.
- Awaits all results together. Even though there are multiple calls and dependencies, they travel in one request and one response.

Run locally (Node 18+)

1. Build the library at repo root:
   npm run build

2. Start the server:
   node examples/batch-pipelining/server-node.mjs

3. In a separate terminal, run the client:
   node examples/batch-pipelining/client.mjs

Files

- server-node.mjs: Minimal Node HTTP server bridging to `newHttpBatchRpcResponse()`.
- client.mjs: Batching + pipelining client using `newHttpBatchRpcSession()`.

Why this matters

- With normal HTTP or naive GraphQL usage, each dependent call often needs another round trip. Here, dependent calls are constructed locally, sent once, and executed on the server with results streamed back — minimizing latency dramatically.
  </file>

<file path="examples/batch-pipelining/server-node.mjs">
// Minimal Node HTTP server exposing an RPC endpoint over HTTP batching.
//
// Usage:
//   1) From repo root: npm run build
//   2) Start: node examples/batch-pipelining/server-node.mjs
//   3) Client: node examples/batch-pipelining/client.mjs

import http from 'node:http';
import { nodeHttpBatchRpcResponse, RpcTarget } from '../../dist/index.js';

// Simple helper to simulate server-side processing latency.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Simple in-memory data
const USERS = new Map([
['cookie-123', { id: 'u_1', name: 'Ada Lovelace' }],
['cookie-456', { id: 'u_2', name: 'Alan Turing' }],
]);

const PROFILES = new Map([
['u_1', { id: 'u_1', bio: 'Mathematician & first programmer' }],
['u_2', { id: 'u_2', bio: 'Mathematician & computer science pioneer' }],
]);

const NOTIFICATIONS = new Map([
['u_1', ['Welcome to jsrpc!', 'You have 2 new followers']],
['u_2', ['New feature: pipelining!', 'Security tips for your account']],
]);

// Define the server-side API by extending RpcTarget.
class Api extends RpcTarget {
// Simulate authentication from a session cookie/token.
async authenticate(sessionToken) {
await sleep(Number(process.env.DELAY_AUTH_MS ?? 80));
const user = USERS.get(sessionToken);
if (!user) throw new Error('Invalid session');
return user; // { id, name }
}

async getUserProfile(userId) {
await sleep(Number(process.env.DELAY_PROFILE_MS ?? 120));
const profile = PROFILES.get(userId);
if (!profile) throw new Error('No such user');
return profile; // { id, bio }
}

async getNotifications(userId) {
await sleep(Number(process.env.DELAY_NOTIFS_MS ?? 120));
return NOTIFICATIONS.get(userId) ?? [];
}
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = http.createServer(async (req, res) => {
// Only handle POST /rpc as a batch endpoint.
if (req.method !== 'POST' || req.url !== '/rpc') {
res.writeHead(404, { 'content-type': 'text/plain' });
res.end('Not Found');
return;
}

try {
await nodeHttpBatchRpcResponse(req, res, new Api());
} catch (err) {
res.writeHead(500, { 'content-type': 'text/plain' });
res.end(String(err?.stack || err));
}
});

server.listen(PORT, () => {
console.log(`RPC server listening on http://localhost:${PORT}/rpc`);
});
</file>

<file path="examples/worker-react/src/worker.ts">
// Use local build output so this example runs without publishing to npm.
import { newWorkersRpcResponse, RpcTarget } from '../../../dist/index.js';

type Env = {
DELAY_AUTH_MS?: string;
DELAY_PROFILE_MS?: string;
DELAY_NOTIFS_MS?: string;
SIMULATED_RTT_MS?: string;
SIMULATED_RTT_JITTER_MS?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jittered = (base: number, jitter: number) => base + (jitter ? Math.random() \* jitter : 0);

const USERS = new Map([
['cookie-123', { id: 'u_1', name: 'Ada Lovelace' }],
['cookie-456', { id: 'u_2', name: 'Alan Turing' }],
]);

const PROFILES = new Map([
['u_1', { id: 'u_1', bio: 'Mathematician & first programmer' }],
['u_2', { id: 'u_2', bio: 'Mathematician & CS pioneer' }],
]);

const NOTIFICATIONS = new Map([
['u_1', ['Welcome to jsrpc!', 'You have 2 new followers']],
['u_2', ['New feature: pipelining!', 'Security tips for your account']],
]);

class Api extends RpcTarget {
constructor(private env: Env) { super(); }

async authenticate(sessionToken: string) {
await sleep(Number(this.env.DELAY_AUTH_MS ?? 80));
const user = USERS.get(sessionToken);
if (!user) throw new Error('Invalid session');
return user;
}

async getUserProfile(userId: string) {
await sleep(Number(this.env.DELAY_PROFILE_MS ?? 120));
const profile = PROFILES.get(userId);
if (!profile) throw new Error('No such user');
return profile;
}

async getNotifications(userId: string) {
await sleep(Number(this.env.DELAY_NOTIFS_MS ?? 120));
return NOTIFICATIONS.get(userId) ?? [];
}
}

export default {
async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/api') {
      // Basic CORS preflight support if testing cross-origin
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
          Vary: 'Origin',
        },
      });
    }

    if (url.pathname === '/api') {
      // Simulate uplink latency (browser -> server)
      const rttBase = Number(env.SIMULATED_RTT_MS ?? 0);
      const rttJitter = Number(env.SIMULATED_RTT_JITTER_MS ?? 0);
      if (rttBase || rttJitter) await sleep(jittered(rttBase, rttJitter));

      const resp = await newWorkersRpcResponse(request, new Api(env));

      // Simulate downlink latency (server -> browser)
      if (rttBase || rttJitter) await sleep(jittered(rttBase, rttJitter));
      // Add CORS so the example also works cross-origin
      const headers = new Headers(resp.headers);
      const origin = request.headers.get('Origin');
      if (origin) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
      }
      return new Response(resp.body, { status: resp.status, headers });
    }

    // Static assets are served from web/dist by Wrangler assets config.
    return new Response('Not found', { status: 404 });

},
};
</file>

<file path="examples/worker-react/web/src/main/App.tsx">
import { useMemo, useState } from 'react'
import { newHttpBatchRpcSession } from '@cloudflare/jsrpc'
import type { Api } from '../../../src/worker'

type Result = {
posts: number
ms: number
user: any
profile: any
notifications: any
trace: Trace
}

type CallEvent = { label: string, start: number, end: number }
type NetEvent = { label: string, start: number, end: number }
type Trace = { total: number, calls: CallEvent[], network: NetEvent[] }

export function App() {
const [pipelined, setPipelined] = useState<Result | null>(null)
const [sequential, setSequential] = useState<Result | null>(null)
const [running, setRunning] = useState(false)

// Network RTT is now simulated on the server (Worker). See wrangler.toml vars.

// Count RPC POSTs and capture network timing by wrapping fetch while this component is mounted.
const wrapFetch = useMemo(() => {
let posts = 0
let origin = 0
let events: NetEvent[] = []
const orig = globalThis.fetch
function install() {
;(globalThis as any).fetch = async (input: RequestInfo, init?: RequestInit) => {
const method = (init?.method) || (input instanceof Request ? input.method : 'GET')
const url = input instanceof Request ? input.url : String(input)
if (url.endsWith('/api') && method === 'POST') {
posts++
const start = performance.now() - origin
const resp = await orig(input as any, init)
const end = performance.now() - origin
events.push({ label: 'POST /api', start, end })
return resp
}
return orig(input as any, init)
}
}
function uninstall() { ;(globalThis as any).fetch = orig }
function get() { return posts }
function reset() { posts = 0; events = [] }
function setOrigin(o: number) { origin = o }
function getEvents(): NetEvent[] { return events.slice() }
return { install, uninstall, get, reset, setOrigin, getEvents }
}, [])

async function runPipelined() {
wrapFetch.reset()
const t0 = performance.now()
wrapFetch.setOrigin(t0)
const calls: CallEvent[] = []
const api = newHttpBatchRpcSession<Api>('/api')
const userStart = 0; calls.push({ label: 'authenticate', start: userStart, end: NaN })
const user = api.authenticate('cookie-123')
user.then(() => { calls.find(c => c.label==='authenticate')!.end = performance.now() - t0 })

    const profStart = performance.now() - t0; calls.push({ label: 'getUserProfile', start: profStart, end: NaN })
    const profile = api.getUserProfile(user.id)
    profile.then(() => { calls.find(c => c.label==='getUserProfile')!.end = performance.now() - t0 })

    const notiStart = performance.now() - t0; calls.push({ label: 'getNotifications', start: notiStart, end: NaN })
    const notifications = api.getNotifications(user.id)
    notifications.then(() => { calls.find(c => c.label==='getNotifications')!.end = performance.now() - t0 })

    const [u, p, n] = await Promise.all([user, profile, notifications])
    const t1 = performance.now()
    const net = wrapFetch.getEvents()
    const total = t1 - t0
    // Ensure any missing ends are set
    calls.forEach(c => { if (!Number.isFinite(c.end)) c.end = total })
    return { posts: wrapFetch.get(), ms: total, user: u, profile: p, notifications: n,
      trace: { total, calls, network: net } }

}

async function runSequential() {
wrapFetch.reset()
const t0 = performance.now()
wrapFetch.setOrigin(t0)
const calls: CallEvent[] = []
const api1 = newHttpBatchRpcSession<Api>('/api')
const aStart = 0; calls.push({ label: 'authenticate', start: aStart, end: NaN })
const uPromise = api1.authenticate('cookie-123')
uPromise.then(() => { calls.find(c => c.label==='authenticate')!.end = performance.now() - t0 })
const u = await uPromise

    const api2 = newHttpBatchRpcSession<Api>('/api')
    const pStart = performance.now() - t0; calls.push({ label: 'getUserProfile', start: pStart, end: NaN })
    const pPromise = api2.getUserProfile(u.id)
    pPromise.then(() => { calls.find(c => c.label==='getUserProfile')!.end = performance.now() - t0 })
    const p = await pPromise

    const api3 = newHttpBatchRpcSession<Api>('/api')
    const nStart = performance.now() - t0; calls.push({ label: 'getNotifications', start: nStart, end: NaN })
    const nPromise = api3.getNotifications(u.id)
    nPromise.then(() => { calls.find(c => c.label==='getNotifications')!.end = performance.now() - t0 })
    const n = await nPromise

    const t1 = performance.now()
    const net = wrapFetch.getEvents()
    const total = t1 - t0
    calls.forEach(c => { if (!Number.isFinite(c.end)) c.end = total })
    return { posts: wrapFetch.get(), ms: total, user: u, profile: p, notifications: n,
      trace: { total, calls, network: net } }

}

async function runDemo() {
if (running) return
setRunning(true)
wrapFetch.install()
try {
const piped = await runPipelined()
setPipelined(piped)
const seq = await runSequential()
setSequential(seq)
} finally {
wrapFetch.uninstall()
setRunning(false)
}
}

return (

<div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, lineHeight: 1.5 }}>
<h1>JSRPC: Workers + React</h1>
<div style={{ opacity: 0.8 }}>Network RTT is simulated on the server (configurable via SIMULATED_RTT_MS/SIMULATED_RTT_JITTER_MS in wrangler.toml).</div>
<p>This demo calls the Worker API in two ways:</p>
<ul>
<li><b>Pipelined batch</b>: dependent calls in one round trip</li>
<li><b>Sequential non-batched</b>: three separate round trips</li>
</ul>
<button onClick={runDemo} disabled={running}>
{running ? 'Running…' : 'Run demo'}
</button>

      {pipelined && (
        <section style={{ marginTop: 24 }}>
          <h2>Pipelined (batched)</h2>
          <div>HTTP POSTs: {pipelined.posts}</div>
          <div>Time: {pipelined.ms.toFixed(1)} ms</div>
          <TraceView trace={pipelined.trace} />
          <pre>{JSON.stringify({
            user: pipelined.user,
            profile: pipelined.profile,
            notifications: pipelined.notifications,
          }, null, 2)}</pre>
        </section>
      )}

      {sequential && (
        <section style={{ marginTop: 24 }}>
          <h2>Sequential (non-batched)</h2>
          <div>HTTP POSTs: {sequential.posts}</div>
          <div>Time: {sequential.ms.toFixed(1)} ms</div>
          <TraceView trace={sequential.trace} />
          <pre>{JSON.stringify({
            user: sequential.user,
            profile: sequential.profile,
            notifications: sequential.notifications,
          }, null, 2)}</pre>
        </section>
      )}

      {(pipelined && sequential) && (
        <section style={{ marginTop: 24 }}>
          <h2>Summary</h2>
          <div>Pipelined: {pipelined.posts} POST, {pipelined.ms.toFixed(1)} ms</div>
          <div>Sequential: {sequential.posts} POSTs, {sequential.ms.toFixed(1)} ms</div>
        </section>
      )}
    </div>

)
}

function TraceView({ trace }: { trace: Trace }) {
const width = 700
const rowHeight = 22
const gap = 8
const rows = [ 'Network', ...trace.calls.map(c => c.label) ]
const totalHeight = rows.length _ (rowHeight + gap) + 10
const scale = (t: number) => (t / Math.max(trace.total, 1)) _ width

// Deduplicate call labels in case of repeats
const renderedCalls = trace.calls.map((c, i) => ({...c, idx: i}))

return (
<svg width={width + 160} height={totalHeight} style={{ border: '1px solid #eee', background: '#fafafa', margin: '12px 0' }}>
{rows.map((label, i) => (
<text key={`label-${i}`} x={8} y={i \* (rowHeight + gap) + rowHeight - 6} fill="#444" fontSize="12" fontFamily="system-ui, sans-serif">{label}</text>
))}

      {/* Network row */}
      {trace.network.map((e, i) => (
        <g key={`net-${i}`}>
          <rect x={140 + scale(e.start)} y={i * 0 + 4} width={Math.max(2, scale(e.end - e.start))} height={rowHeight - 6} fill="#bbb" transform={`translate(0, ${0 * (rowHeight + gap)})`} />
        </g>
      ))}

      {/* Call rows */}
      {renderedCalls.map((c, idx) => (
        <g key={`call-${idx}`} transform={`translate(0, ${(idx + 1) * (rowHeight + gap)})`}>
          <rect x={140 + scale(c.start)} y={4} width={Math.max(2, scale(c.end - c.start))} height={rowHeight - 6} fill={colorFor(idx)} />
          <text x={140 + scale(c.start) + 4} y={rowHeight - 6} fill="#fff" fontSize="11" fontFamily="system-ui, sans-serif">{(c.end - c.start).toFixed(0)}ms</text>
        </g>
      ))}

      {/* Axis */}
      <line x1={140} x2={140 + width} y1={rows.length * (rowHeight + gap) + 2} y2={rows.length * (rowHeight + gap) + 2} stroke="#ddd" />
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <g key={`tick-${i}`}>
          <line x1={140 + width * f} x2={140 + width * f} y1={5} y2={rows.length * (rowHeight + gap)} stroke="#eee" />
          <text x={140 + width * f - 10} y={rows.length * (rowHeight + gap) + 14} fill="#666" fontSize="10">{(trace.total * f).toFixed(0)}ms</text>
        </g>
      ))}
    </svg>

)
}

function colorFor(i: number): string {
const palette = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']
return palette[i % palette.length]
}
</file>

<file path="examples/worker-react/web/src/main.tsx">
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './main/App'

ReactDOM.createRoot(document.getElementById('root')!).render(
<React.StrictMode>
<App />
</React.StrictMode>
)
</file>

<file path="examples/worker-react/web/index.html">
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JSRPC Workers + React Example</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
  </html>
</file>

<file path="examples/worker-react/web/package.json">
{
  "name": "jsrpc-react-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.2",
    "vite": "^7.1.11"
  }
}
</file>

<file path="examples/worker-react/web/tsconfig.json">
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@cloudflare/jsrpc": ["../../../dist/index.d.ts"]
    }
  },
  "include": ["src"]
}
</file>

<file path="examples/worker-react/web/vite.config.ts">
import { defineConfig } from 'vite'
import path from 'node:path'

// Map '@cloudflare/jsrpc' to the repo's local dist build so we can run
// the example without publishing to npm.
export default defineConfig({
resolve: {
alias: {
'@cloudflare/jsrpc': path.resolve(\_\_dirname, '../../../dist/index.js'),
},
},
// Ensure modern output so top-level await is allowed (library uses it).
build: {
target: 'esnext',
},
esbuild: {
target: 'esnext',
supported: {
'top-level-await': true,
},
},
})
</file>

<file path="examples/worker-react/README.md">
Cloudflare Workers + React Example

This example shows a Cloudflare Worker exposing a JSRPC API and a React app calling it from the browser. It demonstrates batching + promise pipelining vs sequential requests, with timing and request counts.

Prerequisites

- Node 18+
- Wrangler 3+ (for Workers)
- npm

Overview

- Worker endpoint: `/api` using `newWorkersRpcResponse()`
- Static assets (React build) served by the same Worker via Wrangler assets
- Client demonstrates:
  - Pipelined batch: authenticate -> get profile + notifications using the returned user.id without awaiting
  - Sequential non-batched: authenticate, then profile, then notifications in separate round trips

Run locally

1. Build the library at repo root (the example uses the local dist build):
   npm run build

2. Install and build the React app (Vite aliases `@cloudflare/jsrpc` to the local `dist`):
   cd examples/worker-react/web
   npm install
   npm run build

3. Run the Worker:
   cd ..
   npx wrangler dev

4. Open the app in your browser:
   http://127.0.0.1:8787

Tuning delays

- The Worker simulates server-side latency. Override defaults via Wrangler vars or env:
  - `DELAY_AUTH_MS` (default 80)
  - `DELAY_PROFILE_MS` (default 120)
  - `DELAY_NOTIFS_MS` (default 120)
  - `SIMULATED_RTT_MS` per direction (default 120)
  - `SIMULATED_RTT_JITTER_MS` per direction (default 40)

Notes

- The frontend imports `@cloudflare/jsrpc`. If trying this example before publish, you can `npm link` the built package into the `web` app or adjust imports to point at a local path.
  </file>

<file path="examples/worker-react/wrangler.toml">
name = "jsrpc-react-example"
main = "src/worker.ts"
compatibility_date = "2024-09-01"

[assets]
directory = "web/dist"

[vars]

# Optional per-method artificial delays (ms)

DELAY_AUTH_MS = 80
DELAY_PROFILE_MS = 120
DELAY_NOTIFS_MS = 120

# Optional simulated network latency per direction (ms)

SIMULATED_RTT_MS = 120
SIMULATED_RTT_JITTER_MS = 40
</file>

<file path="examples/README.md">
Examples

- batch-pipelining: Node server + client. Shows batching and pipelining to execute a dependent sequence of RPC calls in a single HTTP round trip, with timing vs sequential.
- worker-react: Cloudflare Worker backend + React frontend. Shows the same pattern from a browser app, served by the Worker.

Notes

- Examples import from `../../dist/index.js`. Run `npm run build` at the repo root before running an example.
- Requires Node 18+ (built-in `fetch`, `Request`, `Response`).
  </file>

</files>
