import type { IDockviewPanelProps } from "dockview-react";
import type { ConfigField, NodeSchemaV2 } from "../../engine/schema.ts";
import { workspaceStore } from "../state/workspace-store.ts";

export function NodeInspectorPanel(_props: IDockviewPanelProps) {
  const selectedId = workspaceStore.useStore((s) => s.selectedNodeId);
  const node = workspaceStore.useStore((s) =>
    selectedId ? (s.nodes.find((n) => n.id === selectedId) ?? null) : null,
  );
  const server = workspaceStore.useStore((s) => s.server);

  if (!node) {
    return (
      <div className="h-full bg-neutral-950 p-3 text-xs text-neutral-400">No node selected.</div>
    );
  }

  const schema = node.schema as NodeSchemaV2;
  const config = node.config as Record<string, unknown>;

  const commit = async (field: string, value: unknown) => {
    if (!server) return;
    await server.updateNode(node.id, { config: { ...config, [field]: value } });
    await workspaceStore.actions.refreshNodes(server);
  };

  const commitLabel = async (label: string) => {
    if (!server) return;
    const meta = node.meta;
    const next =
      meta && typeof meta === "object" && meta !== null && !Array.isArray(meta)
        ? { ...(meta as Record<string, unknown>), label }
        : { label };
    const result = await server.updateNode(node.id, { meta: next });
    if (result.ok) await workspaceStore.actions.refreshNodes(server);
  };

  const deleteNode = async () => {
    if (!server) return;
    const result = await server.deleteNode(node.id);
    if (!result.ok) return;
    workspaceStore.actions.setSelectedNodeId(null);
    await workspaceStore.actions.refreshNodes(server);
    await workspaceStore.actions.refreshEdges(server);
  };

  const labelValue = typeof node.meta.label === "string" ? node.meta.label : "";

  return (
    <div className="flex h-full flex-col gap-2 bg-neutral-950 p-3 text-sm text-neutral-100">
      <div className="text-xs uppercase tracking-wide text-neutral-400">
        {node.kind} · {node.id}
      </div>
      <label className="flex flex-col gap-1 text-xs">
        Label
        <input
          key={node.id}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
          defaultValue={labelValue}
          type="text"
          onBlur={(e) => void commitLabel(e.target.value)}
        />
      </label>
      <button
        className="rounded border border-red-800 bg-red-950/40 px-2 py-1 text-xs text-red-200 hover:bg-red-950/60"
        type="button"
        onClick={() => void deleteNode()}
      >
        Delete node
      </button>
      {Object.entries(schema.config ?? {}).map(([fieldName, field]) => (
        <ConfigFieldInput
          key={fieldName}
          field={field}
          name={fieldName}
          value={config[fieldName]}
          onCommit={(v) => void commit(fieldName, v)}
        />
      ))}
    </div>
  );
}

function ConfigFieldInput({
  name,
  field,
  value,
  onCommit,
}: {
  name: string;
  field: ConfigField;
  value: unknown;
  onCommit: (v: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-xs">
        <input
          checked={Boolean(value ?? field.default)}
          className="accent-blue-500"
          type="checkbox"
          onChange={(e) => onCommit(e.target.checked)}
        />
        {name}
      </label>
    );
  }

  if (field.type === "enum") {
    return (
      <label className="flex flex-col gap-1 text-xs">
        {name}
        <select
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
          value={String(value ?? field.default)}
          onChange={(e) => onCommit(e.target.value)}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="flex flex-col gap-1 text-xs">
        {name}
        <input
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
          defaultValue={Number(value ?? field.default)}
          max={field.max}
          min={field.min}
          step={field.step}
          type="number"
          onBlur={(e) => onCommit(Number(e.target.value))}
        />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-xs">
      {name}
      <input
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
        defaultValue={String(value ?? field.default)}
        type="text"
        onBlur={(e) => onCommit(e.target.value)}
      />
    </label>
  );
}
