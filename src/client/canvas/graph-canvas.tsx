import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { workspaceStore } from "../state/workspace-store.ts";

const defaultPosition = (index: number) => ({
  x: 80 + (index % 3) * 180,
  y: 80 + Math.floor(index / 3) * 120,
});

export function GraphCanvas() {
  const nodes = workspaceStore.useStore((state) =>
    state.nodes.map<Node>((node, index) => ({
      id: node.id,
      position:
        typeof node.meta.position === "object" &&
        node.meta.position !== null &&
        "x" in node.meta.position &&
        "y" in node.meta.position
          ? {
              x: Number(node.meta.position.x),
              y: Number(node.meta.position.y),
            }
          : defaultPosition(index),
      data: {
        label: typeof node.meta.label === "string" ? node.meta.label : node.id,
        kind: node.kind,
      },
      draggable: true,
    })),
  );
  const edges = workspaceStore.useStore((state) =>
    state.edges.map<Edge>((edge) => ({
      id: edge.id,
      source: edge.sourceNode,
      target: edge.targetNode,
      label: edge.kind,
      animated: edge.kind === "flow",
    })),
  );
  const server = workspaceStore.useStore((state) => state.server);

  const onNodeDragStop = async (_event: unknown, node: Node) => {
    workspaceStore.actions.updateNodePosition(node.id, node.position);
    const graphNode = workspaceStore.getSnapshot().nodes.find((n) => n.id === node.id);
    const meta = graphNode?.meta ?? { position: node.position };
    await server?.updateNode(node.id, { meta });
  };

  const onNodeClick = (_event: unknown, node: Node) => {
    workspaceStore.actions.setSelectedNodeId(node.id);
  };

  return (
    <div className="h-full w-full">
      <ReactFlow
        fitView
        edges={edges}
        nodes={nodes}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
