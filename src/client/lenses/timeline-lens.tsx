import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TickSnapshot } from "../../engine/types.ts";
import { workspaceStore } from "../state/workspace-store.ts";

const extractValue = (snapshot: TickSnapshot, nodeId: string): number | null => {
  const entity = snapshot.entities.find((e) => e.id === nodeId);
  if (!entity) return null;
  const state = entity.state;
  if (state.kind === "stock" || state.kind === "variable") return state.value;
  return null;
};

export function TimelineLens() {
  const selectedNodeId = workspaceStore.useStore((s) => s.selectedNodeId);
  const trace = workspaceStore.useStore((s) => s.trace);
  const selectedNode = workspaceStore.useStore((s) =>
    selectedNodeId ? (s.nodes.find((n) => n.id === selectedNodeId) ?? null) : null,
  );

  if (!selectedNodeId || !selectedNode) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        Select a node to see its timeline.
      </div>
    );
  }

  const data = trace
    .map((snapshot) => {
      const value = extractValue(snapshot, selectedNodeId);
      if (value === null) return null;
      return { tick: snapshot.tick, value };
    })
    .filter((point): point is { tick: number; value: number } => point !== null);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">
        {selectedNode.kind === "stock" || selectedNode.kind === "variable"
          ? "No trace yet. Run the simulation."
          : `No numeric timeline for ${selectedNode.kind} node.`}
      </div>
    );
  }

  return (
    <ResponsiveContainer height="100%" width="100%">
      <LineChart data={data}>
        <XAxis dataKey="tick" stroke="#a3a3a3" />
        <YAxis stroke="#a3a3a3" />
        <Tooltip />
        <Line dataKey="value" stroke="#22d3ee" strokeWidth={2} type="monotone" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
