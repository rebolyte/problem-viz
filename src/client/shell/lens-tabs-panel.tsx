import type { IDockviewPanelProps } from "dockview-react";
import { useState } from "react";
import { LENSES } from "../lenses/lens-registry.ts";

export function LensTabsPanel(_props: IDockviewPanelProps) {
  const [activeId, setActiveId] = useState<string>(LENSES[0]?.id ?? "");
  const active = LENSES.find((lens) => lens.id === activeId) ?? LENSES[0];

  return (
    <div className="flex h-full flex-col gap-2 bg-neutral-950 p-3 text-sm text-neutral-100">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-400">Lens</span>
        {LENSES.map((lens) => (
          <button
            key={lens.id}
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              lens.id === activeId
                ? "border-cyan-500 text-cyan-300"
                : "border-neutral-700 text-neutral-400"
            }`}
            onClick={() => setActiveId(lens.id)}
          >
            {lens.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded border border-neutral-800 bg-neutral-900 p-2">
        {active ? <active.Component /> : null}
      </div>
    </div>
  );
}
