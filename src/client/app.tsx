import { useEffect, useState } from "react";
import type { LoomServerApi } from "../rpc/loom-server.ts";
import { SimClientImpl } from "./worker/sim-client-impl.ts";
import { LoomClientImpl } from "./rpc/loom-client-impl.ts";
import { connectLoomServer } from "./rpc/server-connection.ts";
import { connectSimWorker } from "./rpc/sim-connection.ts";
import { toGraphDef } from "./state/selectors.ts";
import { workspaceStore } from "./state/workspace-store.ts";
import { DockviewLayout } from "./shell/dockview-layout.tsx";

const createDevtoolsServer = (server: LoomServerApi) => ({
  listNodes: (...args: Parameters<LoomServerApi["listNodes"]>) => server.listNodes(...args),
  queryDownstream: (...args: Parameters<LoomServerApi["queryDownstream"]>) =>
    server.queryDownstream(...args),
  queryUpstream: (...args: Parameters<LoomServerApi["queryUpstream"]>) =>
    server.queryUpstream(...args),
  addNode: async (...args: Parameters<LoomServerApi["addNode"]>) => {
    const result = await server.addNode(...args);
    if (result.ok) {
      workspaceStore.actions.setNodesLocal([...workspaceStore.getSnapshot().nodes, result.value]);
    }
    return result;
  },
  addEdge: async (...args: Parameters<LoomServerApi["addEdge"]>) => {
    const result = await server.addEdge(...args);
    if (result.ok) {
      workspaceStore.actions.setEdgesLocal([...workspaceStore.getSnapshot().edges, result.value]);
    }
    return result;
  },
  setProblemStatement: async (...args: Parameters<LoomServerApi["setProblemStatement"]>) => {
    const result = await server.setProblemStatement(...args);
    if (result.ok) {
      workspaceStore.actions.setProblemStatementLocal(args[0]);
    }
    return result;
  },
  raw: server,
});

export function App() {
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const clientImpl = new LoomClientImpl((event) => {
          if (event.type === "verify-progress") {
            workspaceStore.actions.setVerifyProgress(event.payload);
          }
          if (event.type === "agent-message") {
            workspaceStore.actions.handleAgentEvent(event.payload);
          }
        });

        const simClient = new SimClientImpl(
          (snapshot) => workspaceStore.actions.appendTick(snapshot),
          (trace) => workspaceStore.actions.finishRun(trace),
        );

        const [server, sim] = await Promise.all([
          connectLoomServer(clientImpl),
          connectSimWorker(simClient),
        ]);

        if (cancelled) {
          return;
        }

        workspaceStore.actions.setConnections({ server, sim });

        const workspace = await server.loadWorkspace();
        if (workspace.ok) {
          workspaceStore.actions.loadWorkspace(workspace.value);
        }

        await sim.loadGraph(toGraphDef(workspaceStore.getSnapshot()));

        window.__loom = {
          server: createDevtoolsServer(server),
          sim,
          store: workspaceStore,
        };
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) {
          setBootstrapped(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootstrapped) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-neutral-200">
        Loom bootstrapping...
      </div>
    );
  }

  return <DockviewLayout />;
}
