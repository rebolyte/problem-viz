import { useEffect, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { workspaceStore } from "../state/workspace-store.ts";

export function ProblemStatementPanel(_props: IDockviewPanelProps) {
  const problemStatement = workspaceStore.useStore((state) => state.problemStatement);
  const server = workspaceStore.useStore((state) => state.server);
  const [value, setValue] = useState(problemStatement);

  useEffect(() => {
    setValue(problemStatement);
  }, [problemStatement]);

  return (
    <div className="flex h-full flex-col gap-3 bg-neutral-950 p-3 text-sm text-neutral-100">
      <div className="text-xs uppercase tracking-wide text-neutral-400">Problem statement</div>
      <textarea
        className="min-h-0 flex-1 rounded border border-neutral-700 bg-neutral-900 p-3 outline-none"
        onBlur={async () => {
          workspaceStore.actions.setProblemStatementLocal(value);
          await server?.setProblemStatement(value);
        }}
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
    </div>
  );
}
