# Cap'n Web RPC

We use Cap'n Web in HTTP batch mode (stateless sessions).

### Core Concepts

- **Schema-less**: Uses TypeScript interfaces/types shared between client/server.
- **Pass-by-reference**: Objects extending `RpcTarget` are passed by reference (stubs).
- **Pipelining**: Pass RPC promises to other RPC calls. Executed on server in one round-trip.

### Usage

1. **Define Types** (`src/types/shared.ts`):

Create interface extending `RpcTarget` (optional) or just define method signatures.

```typescript
export interface MyMethods {
  hello(name: string): Promise<string>;
}
```

2. **Server** (`src/services/`):

Implement class extending `RpcTarget`.

```typescript
class MyService extends RpcTarget implements MyMethods {
  /* ... */
}
```

Serve with `newHttpBatchRpcResponse(req, new MyService())`.

4. **Interactive UI**:

For independent UI events (clicks), create a **new session** for each event handler. Do not reuse a global batch session for sequential user interactions.
