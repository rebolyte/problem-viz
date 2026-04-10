import type { IDockviewPanelProps } from "dockview-react";
import { useState } from "react";
import { workspaceStore } from "../state/workspace-store.ts";

export function ChatPanel(_props: IDockviewPanelProps) {
  const [value, setValue] = useState("");
  const messages = workspaceStore.useStore((state) => state.chatMessages);
  const server = workspaceStore.useStore((state) => state.server);

  return (
    <div className="flex h-full flex-col gap-3 bg-neutral-950 p-3 text-sm text-neutral-100">
      <div className="text-xs uppercase tracking-wide text-neutral-400">Chat</div>
      <div className="min-h-0 flex-1 overflow-auto rounded border border-neutral-800 bg-neutral-900 p-3">
        <div className="flex flex-col gap-2">
          {messages.map((message, index) => (
            <div
              className={
                message.role === "user"
                  ? "self-end rounded bg-cyan-900 px-3 py-2"
                  : "self-start rounded bg-neutral-800 px-3 py-2"
              }
              key={`${message.role}-${index}`}
            >
              {message.content}
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
        <button
          className="rounded border border-neutral-700 px-3 py-2"
          onClick={async () => {
            if (!value.trim()) {
              return;
            }

            workspaceStore.actions.pushChatMessage({ role: "user", content: value.trim() });
            const message = value.trim();
            setValue("");
            await server?.streamChat(message);
          }}
          type="button"
        >
          Send
        </button>
      </div>
    </div>
  );
}
