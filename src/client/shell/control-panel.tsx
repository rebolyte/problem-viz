import type { IDockviewPanelProps } from "dockview-react";
import { useState } from "react";
import { CodeEditor } from "../editor/code-editor.tsx";
import { currentSnapshot } from "../state/selectors.ts";
import { workspaceStore } from "../state/workspace-store.ts";

const initialSource = `export function step(state: unknown) {
  return state;
}
`;

export function ControlPanel(_props: IDockviewPanelProps) {
  const [source, setSource] = useState(initialSource);
  const server = workspaceStore.useStore((state) => state.server);
  const verifyProgress = workspaceStore.useStore((state) => state.verifyProgress);
  const snapshot = workspaceStore.useStore(currentSnapshot);

  return (
    <div className="flex h-full flex-col gap-3 bg-neutral-950 p-3 text-sm text-neutral-100">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-400">Control panel</span>
        <button
          className="rounded border border-neutral-700 px-2 py-1 text-xs"
          onClick={async () => {
            await server?.verify({});
          }}
          type="button"
        >
          Verify
        </button>
      </div>
      <div className="text-xs text-neutral-400">
        {verifyProgress ? `${verifyProgress.phase} ${verifyProgress.completed}/${verifyProgress.total}` : "Verify idle"}
      </div>
      <div className="min-h-0 flex-1">
        <CodeEditor onChange={setSource} value={source} />
      </div>
      <pre className="overflow-auto rounded border border-neutral-800 bg-neutral-900 p-2 text-[11px] text-neutral-300">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </div>
  );
}
