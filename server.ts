import { newWebSocketRpcSession } from "capnweb";
import home from "./index.html";
import type { LoomClientApi } from "./src/rpc/loom-client.ts";
import { start } from "./src/server/main.ts";
import { BunWebSocketAdapter } from "./src/server/rpc/bun-websocket.ts";
import { LoomServerImpl } from "./src/server/rpc/loom-server-impl.ts";

const { container, api } = await start();
const sessions = new Map<string, { adapter?: BunWebSocketAdapter; server: LoomServerImpl }>();

const server = Bun.serve<{ sessionId: string }>({
  port: container.config.PORT,
  routes: {
    "/": home,
  },
  fetch: (req, server) => {
    const url = new URL(req.url);

    if (url.pathname === "/api/loom/rpc") {
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("This endpoint only accepts WebSocket requests.", { status: 400 });
      }

      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        server: new LoomServerImpl({
          workspace: container.workspace,
          store: container.graph,
          assistant: container.assistant,
          log: container.log,
        }),
      });

      if (server.upgrade(req, { data: { sessionId } })) {
        return;
      }

      sessions.delete(sessionId);
      return new Response("WebSocket upgrade failed.", { status: 500 });
    }

    return api.handle(req);
  },
  websocket: {
    open(ws) {
      const session = sessions.get(ws.data.sessionId);
      if (!session) {
        ws.close(1011, "Missing session");
        return;
      }

      const adapter = new BunWebSocketAdapter(ws);
      session.adapter = adapter;
      const client = newWebSocketRpcSession<LoomClientApi>(adapter as unknown as WebSocket, session.server);
      session.server.setClient(client);
    },
    message(ws, message) {
      const session = sessions.get(ws.data.sessionId);
      session?.adapter?.emitMessage(message);
    },
    close(ws, code, reason) {
      const session = sessions.get(ws.data.sessionId);
      session?.adapter?.emitClose(code, reason || "");
      sessions.delete(ws.data.sessionId);
    },
    drain() {},
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Listening on ${server.url}`);
