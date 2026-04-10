import type { IDockviewPanelProps } from "dockview-react";
import { GraphCanvas } from "../canvas/graph-canvas.tsx";

export function CanvasPanel(_props: IDockviewPanelProps) {
  return (
    <div className="h-full w-full bg-neutral-950">
      <GraphCanvas />
    </div>
  );
}
