import type { IDockviewPanelProps } from "dockview-react";
import { toGraphDef } from "../state/selectors.ts";
import { workspaceStore } from "../state/workspace-store.ts";

export function TimelinePanel(_props: IDockviewPanelProps) {
  const trace = workspaceStore.useStore((state) => state.trace);
  const currentTick = workspaceStore.useStore((state) => state.currentTick);
  const sim = workspaceStore.useStore((state) => state.sim);

  return (
    <div className="flex h-full flex-col gap-3 bg-neutral-950 p-3 text-sm text-neutral-100">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-400">Timeline</span>
        <button
          className="rounded border border-neutral-700 px-3 py-1 text-xs"
          onClick={async () => {
            if (!sim) {
              return;
            }

            workspaceStore.actions.clearTrace();
            await sim.loadGraph(toGraphDef(workspaceStore.getSnapshot()));
            await sim.runStreaming({ seed: 42, fromTick: 0, toTick: 50 });
          }}
          type="button"
        >
          Run
        </button>
      </div>
      <input
        max={Math.max(0, trace.length - 1)}
        min={0}
        onChange={(event) => workspaceStore.actions.setCurrentTick(Number(event.target.value))}
        type="range"
        value={Math.min(currentTick, Math.max(0, trace.length - 1))}
      />
      <div className="text-xs text-neutral-400">Tick {trace[currentTick]?.tick ?? 0}</div>
      <pre className="min-h-0 flex-1 overflow-auto rounded border border-neutral-800 bg-neutral-900 p-2 text-[11px] text-neutral-300">
        {JSON.stringify(trace[currentTick] ?? null, null, 2)}
      </pre>
    </div>
  );
}
