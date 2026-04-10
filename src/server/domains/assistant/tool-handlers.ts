import { Result } from "better-result";
import type { GraphStore } from "../../graph/store.ts";
import type { Workspace } from "../../workspace/workspace.ts";
import { type AppError, ValidationError } from "../../errors.ts";
import {
  AddNodeSchema,
  UpdateNodeSchema,
  AddEdgeSchema,
  QueryDownstreamSchema,
  SetProblemStatementSchema,
} from "./tools.ts";

export type ToolDeps = { store: GraphStore; workspace: Workspace };

type Handler = (deps: ToolDeps, input: unknown) => Promise<Result<unknown, AppError>>;

const parseOr = <T>(
  schema: {
    safeParse: (v: unknown) => { success: boolean; data?: T; error?: { message: string } };
  },
  input: unknown,
): Result<T, AppError> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return Result.err(new ValidationError({ message: parsed.error?.message ?? "Invalid input" }));
  return Result.ok(parsed.data as T);
};

export const TOOL_HANDLERS: Record<string, Handler> = {
  list_nodes: async ({ store }) => store.listNodes(),

  add_node: async ({ store }, input) => {
    const parsed = parseOr(AddNodeSchema, input);
    if (!parsed.isOk()) return parsed;
    return store.addNode(parsed.value);
  },

  update_node: async ({ store }, input) => {
    const parsed = parseOr(UpdateNodeSchema, input);
    if (!parsed.isOk()) return parsed;
    return store.updateNode(parsed.value.id, parsed.value);
  },

  list_edges: async ({ store }) => store.listEdges(),

  add_edge: async ({ store }, input) => {
    const parsed = parseOr(AddEdgeSchema, input);
    if (!parsed.isOk()) return parsed;
    return store.addEdge(parsed.value);
  },

  query_downstream: async ({ store }, input) => {
    const parsed = parseOr(QueryDownstreamSchema, input);
    if (!parsed.isOk()) return parsed;
    return store.downstreamOf(parsed.value.id, parsed.value.hops);
  },

  set_problem_statement: async ({ workspace }, input) => {
    const parsed = parseOr(SetProblemStatementSchema, input);
    if (!parsed.isOk()) return parsed;
    return workspace.setProblemStatement(parsed.value.problemStatement);
  },
};

export const dispatchTool = async (
  deps: ToolDeps,
  name: string,
  input: unknown,
): Promise<Result<unknown, AppError>> => {
  const handler = TOOL_HANDLERS[name];
  if (!handler) return Result.err(new ValidationError({ message: `Unknown tool: ${name}` }));
  return handler(deps, input);
};
