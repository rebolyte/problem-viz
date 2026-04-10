import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const ListNodesSchema = z.object({});
export const AddNodeSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["tick", "stock", "variable", "process"]),
  schema: z.record(z.string(), z.unknown()),
  behavior: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export const UpdateNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["tick", "stock", "variable", "process"]).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  behavior: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export const ListEdgesSchema = z.object({});
export const AddEdgeSchema = z.object({
  id: z.string().optional(),
  sourceNode: z.string(),
  sourcePort: z.string().nullable().optional(),
  targetNode: z.string(),
  targetPort: z.string().nullable().optional(),
  kind: z.enum([
    "passthrough",
    "channel",
    "flow",
    "dependency",
    "ownership",
    "causation",
    "custom",
  ]),
  behavior: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export const QueryDownstreamSchema = z.object({
  id: z.string(),
  hops: z.number().int().positive().optional(),
});
export const SetProblemStatementSchema = z.object({
  problemStatement: z.string(),
});

export const ASSISTANT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "list_nodes",
    description: "List nodes in the current workspace graph.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "add_node",
    description: "Add a node to the current workspace graph.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string", enum: ["tick", "stock", "variable", "process"] },
        schema: { type: "object" },
        behavior: { type: "string" },
        config: { type: "object" },
        meta: { type: "object" },
      },
      required: ["kind", "schema", "config", "meta"],
    },
  },
  {
    name: "update_node",
    description: "Update an existing node in the current workspace graph.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string", enum: ["tick", "stock", "variable", "process"] },
        schema: { type: "object" },
        behavior: { type: "string" },
        config: { type: "object" },
        meta: { type: "object" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_edges",
    description: "List edges in the current workspace graph.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "add_edge",
    description: "Add an edge to the current workspace graph.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        sourceNode: { type: "string" },
        sourcePort: { type: "string" },
        targetNode: { type: "string" },
        targetPort: { type: "string" },
        kind: {
          type: "string",
          enum: [
            "passthrough",
            "channel",
            "flow",
            "dependency",
            "ownership",
            "causation",
            "custom",
          ],
        },
        behavior: { type: "string" },
        config: { type: "object" },
        meta: { type: "object" },
      },
      required: ["sourceNode", "targetNode", "kind", "config", "meta"],
    },
  },
  {
    name: "query_downstream",
    description: "Return downstream node ids for a node.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        hops: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    name: "set_problem_statement",
    description: "Update the workspace problem statement.",
    input_schema: {
      type: "object",
      properties: {
        problemStatement: { type: "string" },
      },
      required: ["problemStatement"],
    },
  },
];
