import { describe, expect, it } from "bun:test";
import { buildCompoundInterestGraph } from "./seed-example.ts";

describe("buildCompoundInterestGraph", () => {
  it("creates unique node and edge ids per seed", () => {
    const first = buildCompoundInterestGraph();
    const second = buildCompoundInterestGraph();
    const firstNode = first.nodes[0]!;
    const firstEdge = first.edges[0]!;
    const secondNode = second.nodes[0]!;
    const secondEdge = second.edges[0]!;

    expect(first.nodes).toHaveLength(1);
    expect(first.edges).toHaveLength(1);
    expect(second.nodes).toHaveLength(1);
    expect(second.edges).toHaveLength(1);
    expect(firstNode.id).toBeDefined();
    expect(firstEdge.id).toBeDefined();
    expect(secondNode.id).toBeDefined();
    expect(secondEdge.id).toBeDefined();

    const firstNodeId = firstNode.id!;
    const firstEdgeId = firstEdge.id!;
    const secondNodeId = secondNode.id!;
    const secondEdgeId = secondEdge.id!;

    expect(firstNodeId).not.toBe(secondNodeId);
    expect(firstEdgeId).not.toBe(secondEdgeId);
    expect(firstEdge.sourceNode).toBe(firstNodeId);
    expect(firstEdge.targetNode).toBe(firstNodeId);
    expect(secondEdge.sourceNode).toBe(secondNodeId);
    expect(secondEdge.targetNode).toBe(secondNodeId);
  });

  it("gives distinct stock positions per seed so nodes do not stack", () => {
    const positions = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { nodes } = buildCompoundInterestGraph();
      const stock = nodes[0]!;
      const pos = stock.meta.position;
      expect(pos !== null && typeof pos === "object").toBe(true);
      const px = pos as { x?: unknown; y?: unknown };
      const key = `${Number(px.x)},${Number(px.y)}`;
      positions.add(key);
    }
    expect(positions.size).toBeGreaterThan(1);
  });
});
