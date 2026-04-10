// NOTE: we would want to use the websocket transport this, see docs

// /types/shared.ts
export interface ExampleRpcMethods {
  getCounter(): Promise<number>;
  incrementCounter(): Promise<number>;
  decrementCounter(): Promise<number>;
  resetCounter(): Promise<number>;
}

// other files

/**
 * Example RPC service using Cap'n Web
 * Demonstrates type sharing between frontend and backend
 */

import { RpcTarget } from "capnweb";
import type { ExampleRpcMethods } from "../types/shared.ts";

let counter = 0;

export class ExampleRpcService extends RpcTarget implements ExampleRpcMethods {
  getCounter(): Promise<number> {
    return Promise.resolve(counter);
  }

  incrementCounter(): Promise<number> {
    counter++;
    return Promise.resolve(counter);
  }

  decrementCounter(): Promise<number> {
    counter--;
    return Promise.resolve(counter);
  }

  resetCounter(): Promise<number> {
    counter = 0;
    return Promise.resolve(counter);
  }
}

import { Hono } from "hono";
import { newHttpBatchRpcResponse } from "capnweb";

const api = new Hono<HonoEnv>();

export const makeApiRoutes = () => {
  api.all("/rpc", async (c) => {
    const request = c.req.raw;
    const response = await newHttpBatchRpcResponse(
      request,
      new ExampleRpcService(),
    );
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  });

  return api;
};

export default api;

// client
const Layout = (props: LayoutProps) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{props.title}</title>
      {/* deno-fmt-ignore */}
      <script
        type="module"
        dangerouslySetInnerHTML={{
          __html: `
          import { newHttpBatchRpcSession } from 'https://cdn.jsdelivr.net/npm/capnweb@0.2.0/+esm';

          // Expose session creator for interactive batch calls
          window.newHttpBatchRpcSession = newHttpBatchRpcSession;

          // Helper for simple RPC calls (creates fresh session per call)
          window.rpc = async function(method, ...params) {
            try {
              const stub = window.newHttpBatchRpcSession('/api/rpc');
              return await stub[method](...params);
            } catch (error) {
              console.error('RPC error:', error);
              throw error;
            }
          };

          console.log('Cap\\'n Web RPC client initialized');
        `,
        }}
      />
      {/* deno-fmt-ignore */}
      <script
        defer
        src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"
      />
    </head>
    <body>
      <div class="container">{props.children}</div>
    </body>
  </html>
);

// Dashboard route with AlpineJS
api.get("/dashboard", (c) => {
  return c.html(
    <Layout title="RPC Dashboard - Deno + Hono + CapnWeb">
      <h1>
        RPC Dashboard <span class="badge">Powered by Cap'n Web</span>
      </h1>

      {/* Counter Example */}
      <div
        class="card"
        x-data="{ count: 0, loading: false }"
        x-init="window.rpc('getCounter').then(c => count = c)"
      >
        <h2>
          Counter Example <span class="badge">Server-side State</span>
        </h2>
        <div class="counter" x-text="count"></div>
        <button
          x-on:click="loading = true; window.rpc('incrementCounter').then(c => { count = c; loading = false; })"
          x-bind:disabled="loading"
          x-bind:style="loading ? 'opacity: 0.5; cursor: not-allowed;' : ''"
        >
          Increment
        </button>
        <button
          x-on:click="loading = true; window.rpc('decrementCounter').then(c => { count = c; loading = false; })"
          x-bind:disabled="loading"
          x-bind:style="loading ? 'opacity: 0.5; cursor: not-allowed;' : ''"
        >
          Decrement
        </button>
        <button
          x-on:click="loading = true; window.rpc('resetCounter').then(c => { count = c; loading = false; })"
          x-bind:disabled="loading"
          x-bind:style="loading ? 'opacity: 0.5; cursor: not-allowed;' : ''"
        >
          Reset
        </button>
      </div>

      {/* RPC Calculator */}
      <div class="card" x-data="{ a: 5, b: 3, result: null, loading: false }">
        <h2>
          RPC Calculator <span class="badge">Cap'n Web Client</span>
        </h2>
        <div>
          <input type="number" x-model="a" />
          +
          <input type="number" x-model="b" />
          <button
            x-on:click={`
              loading = true;
              window.rpc('add', Number(a), Number(b))
                .then(r => { result = r; loading = false; })
                .catch(() => loading = false)
            `}
          >
            Calculate via RPC
          </button>
        </div>
        <div x-show="loading" style="margin-top: 1rem;">
          Loading...
        </div>
        <div x-show="result !== null" class="result">
          Result: <span x-text="result"></span>
        </div>
      </div>

      {/* RPC Hello */}
      <div class="card" x-data="{ name: 'World', message: null }">
        <h2>
          RPC Greeting <span class="badge">Cap'n Web Client</span>
        </h2>
        <div>
          <input
            type="text"
            x-model="name"
            placeholder="Enter name"
            style="width: 200px;"
          />
          <button
            x-on:click={`
              window.rpc('hello', name)
                .then(msg => message = msg)
            `}
          >
            Say Hello via RPC
          </button>
        </div>
        <div x-show="message" class="result" x-text="message"></div>
      </div>

      {/* Batched RPC Calls - Cap'n Web's killer feature! */}
      <div class="card" x-data="{ results: null, loading: false }">
        <h2>
          Batched RPC Calls <span class="badge">One HTTP Request!</span>
        </h2>
        <div>
          <button
            x-on:click={`
              loading = true;
              // Create a fresh session for this interaction
              const batch = window.newHttpBatchRpcSession('/api/rpc');
              
              // All three calls will be sent in a SINGLE HTTP request!
              const sum = batch.add(10, 5);
              const product = batch.multiply(7, 3);
              const greeting = batch.hello('Batching');

              Promise.all([sum, product, greeting])
                .then(([s, p, g]) => {
                  results = {
                    sum: s,
                    product: p.result,
                    operation: p.operation,
                    greeting: g
                  };
                  loading = false;
                })
                .catch(() => loading = false);
            `}
          >
            Execute 3 RPC Calls in One Request
          </button>
        </div>
        <div x-show="loading" style="margin-top: 1rem;">
          Loading...
        </div>
        <div x-show="results" class="result">
          <div>
            <strong>All results from ONE HTTP request:</strong>
          </div>
          <div>
            Sum (10 + 5): <span x-text="results?.sum"></span>
          </div>
          <div>
            Product: <span x-text="results?.product"></span> (
            <span x-text="results?.operation"></span>)
          </div>
          <div>
            Greeting: <span x-text="results?.greeting"></span>
          </div>
        </div>
      </div>

      {/* Batch Processing */}
      <div
        class="card"
        x-data="{ items: ['hello', 'world', 'deno'], processed: null }"
      >
        <h2>
          RPC Batch Processing <span class="badge">Cap'n Web Client</span>
        </h2>
        <div>
          <button
            x-on:click={`
              window.rpc('processBatch', items)
                .then(data => processed = data)
            `}
          >
            Process Batch via RPC
          </button>
        </div>
        <div x-show="processed" class="result">
          Processed <span x-text="processed?.processed"></span> items:
          <span x-text="processed?.results?.join(', ')"></span>
        </div>
      </div>

      {/* User Creation - Demonstrates shared types */}
      <div
        class="card"
        x-data="{ name: 'Alice', email: 'alice@example.com', user: null }"
      >
        <h2>
          Create User (Typed RPC){" "}
          <span class="badge">Cap'n Web + Shared Types</span>
        </h2>
        <div>
          <input
            type="text"
            x-model="name"
            placeholder="Name"
            style="width: 150px;"
          />
          <input
            type="email"
            x-model="email"
            placeholder="Email"
            style="width: 200px;"
          />
          <button
            x-on:click={`
              window.rpc('createUser', name, email)
                .then(u => user = u)
            `}
          >
            Create User via RPC
          </button>
        </div>
        <div x-show="user" class="result">
          <div>
            <strong>Created User:</strong>
          </div>
          <div>
            ID: <span x-text="user?.id"></span>
          </div>
          <div>
            Name: <span x-text="user?.name"></span>
          </div>
          <div>
            Email: <span x-text="user?.email"></span>
          </div>
          <div>
            Theme: <span x-text="user?.preferences?.theme"></span>
          </div>
        </div>
      </div>

      {/* Todo Management - Demonstrates complex types */}
      <div
        class="card"
        x-data="{ userId: 'demo-user', title: 'Learn Capn Web', priority: 'high', todos: [], newTodo: null }"
      >
        <h2>
          Todo Manager <span class="badge">Cap'n Web + Complex Types</span>
        </h2>
        <div style="margin-bottom: 1rem;">
          <input
            type="text"
            x-model="title"
            placeholder="Todo title"
            style="width: 200px;"
          />
          <select
            x-model="priority"
            style="padding: 0.75rem; border: 2px solid #e0e0e0; border-radius: 0.5rem; margin-right: 0.5rem;"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button
            x-on:click={`
              // Create todo and refresh list using Cap'n Web
              window.rpc('createTodo', userId, title, priority)
                .then(todo => {
                  newTodo = todo;
                  return window.rpc('getTodos', userId);
                })
                .then(list => todos = list);
            `}
          >
            Add Todo
          </button>
          <button
            x-on:click={`
              window.rpc('getTodos', userId)
                .then(list => todos = list);
            `}
          >
            Load Todos
          </button>
        </div>
        <div x-show="todos.length > 0" class="result">
          <div>
            <strong>Todos:</strong>
          </div>
          <template x-for="todo in todos" x-bind:key="todo.id">
            <div style="padding: 0.5rem; margin: 0.5rem 0; background: white; border-radius: 0.25rem;">
              <span x-text="todo.title"></span>
              <span
                x-text="' [' + todo.priority + ']'"
                style="font-size: 0.875rem; color: #666;"
              ></span>
              <span
                x-show="todo.completed"
                style="color: green; margin-left: 0.5rem;"
              >
                ✓ Done
              </span>
            </div>
          </template>
        </div>
      </div>
    </Layout>,
  );
});
