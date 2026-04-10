import type { IDockviewPanelProps } from "dockview-react";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { chartData } from "../state/selectors.ts";
import { workspaceStore } from "../state/workspace-store.ts";

export function LensTabsPanel(_props: IDockviewPanelProps) {
  const data = workspaceStore.useStore(chartData);

  return (
    <div className="flex h-full flex-col gap-3 bg-neutral-950 p-3 text-sm text-neutral-100">
      <div className="text-xs uppercase tracking-wide text-neutral-400">Lens tabs</div>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-neutral-800 bg-neutral-900 p-2">
        <div className="flex min-h-full items-center justify-center">
          <LineChart
            data={data.length > 0 ? data : [{ tick: 0, v: 0 }, { tick: 1, v: 3 }, { tick: 2, v: 1 }]}
            height={220}
            width={420}
          >
            <XAxis dataKey="tick" />
            <YAxis />
            <Tooltip />
            <Line dataKey="v" stroke="#22d3ee" strokeWidth={2} type="monotone" />
          </LineChart>
        </div>
      </div>
    </div>
  );
}
