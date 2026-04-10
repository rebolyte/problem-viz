import { Result } from "better-result";
import { sql, type Kysely, type Selectable } from "kysely";
import { nanoid } from "nanoid";
import { dbError, type AppError } from "../errors.ts";
import type { DatabaseSchema } from "../services/database.ts";
import type { EdgeKind, NodeKind } from "./schema.ts";

type JsonValue = Record<string, unknown>;

export type GraphNode = {
  id: string;
  kind: NodeKind;
  schema: JsonValue;
  behavior: string | null;
  config: JsonValue;
  meta: JsonValue;
  createdAt: string;
};

export type GraphEdge = {
  id: string;
  sourceNode: string;
  sourcePort: string | null;
  targetNode: string;
  targetPort: string | null;
  kind: EdgeKind;
  behavior: string | null;
  config: JsonValue;
  meta: JsonValue;
  createdAt: string;
};

export type GraphTraceRow = {
  tick: number;
  entityId: string;
  entityType: "node" | "edge";
  state: JsonValue;
  log: string | null;
};

export type CreateNodeInput = {
  id?: string;
  kind: NodeKind;
  schema: JsonValue;
  behavior?: string | null;
  config: JsonValue;
  meta: JsonValue;
};

export type UpdateNodeInput = Partial<Omit<CreateNodeInput, "id" | "kind">> & {
  kind?: NodeKind;
};

export type CreateEdgeInput = {
  id?: string;
  sourceNode: string;
  sourcePort?: string | null;
  targetNode: string;
  targetPort?: string | null;
  kind: EdgeKind;
  behavior?: string | null;
  config: JsonValue;
  meta: JsonValue;
};

export type UpdateEdgeInput = Partial<
  Omit<CreateEdgeInput, "id" | "sourceNode" | "targetNode" | "kind">
> & {
  sourceNode?: string;
  targetNode?: string;
  kind?: EdgeKind;
};

type TraceFilter = {
  entityId?: string;
  tickRange?: { start: number; end: number };
};

const toJson = (value: unknown) => JSON.stringify(value ?? {});
const fromJson = <T>(value: string): T => JSON.parse(value) as T;

type NodeRow = Selectable<DatabaseSchema["nodes"]>;
type EdgeRow = Selectable<DatabaseSchema["edges"]>;
type TraceRow = Selectable<DatabaseSchema["trace"]>;

const toNode = (row: NodeRow): GraphNode => ({
  id: row.id,
  kind: row.kind,
  schema: fromJson<JsonValue>(row.schema),
  behavior: row.behavior,
  config: fromJson<JsonValue>(row.config),
  meta: fromJson<JsonValue>(row.meta),
  createdAt: row.createdAt,
});

const toEdge = (row: EdgeRow): GraphEdge => ({
  id: row.id,
  sourceNode: row.sourceNode,
  sourcePort: row.sourcePort,
  targetNode: row.targetNode,
  targetPort: row.targetPort,
  kind: row.kind,
  behavior: row.behavior,
  config: fromJson<JsonValue>(row.config),
  meta: fromJson<JsonValue>(row.meta),
  createdAt: row.createdAt,
});

const toTraceRow = (row: TraceRow): GraphTraceRow => ({
  tick: row.tick,
  entityId: row.entityId,
  entityType: row.entityType,
  state: fromJson<JsonValue>(row.state),
  log: row.log,
});

export const makeGraphStore = (db: Kysely<DatabaseSchema>) => {
  const addNode = (input: CreateNodeInput): Promise<Result<GraphNode, AppError>> =>
    Result.tryPromise({
      try: async () => {
        const row = await db
          .insertInto("nodes")
          .values({
            id: input.id ?? nanoid(),
            kind: input.kind,
            schema: toJson(input.schema),
            behavior: input.behavior ?? null,
            config: toJson(input.config),
            meta: toJson(input.meta),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return toNode(row);
      },
      catch: dbError("Failed to add node"),
    });

  const updateNode = (
    id: string,
    input: UpdateNodeInput,
  ): Promise<Result<GraphNode | null, AppError>> =>
    Result.tryPromise({
      try: async () => {
        const row = await db
          .updateTable("nodes")
          .set({
            ...(input.kind ? { kind: input.kind } : {}),
            ...(input.schema ? { schema: toJson(input.schema) } : {}),
            ...(input.behavior !== undefined ? { behavior: input.behavior } : {}),
            ...(input.config ? { config: toJson(input.config) } : {}),
            ...(input.meta ? { meta: toJson(input.meta) } : {}),
          })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirst();

        return row ? toNode(row) : null;
      },
      catch: dbError("Failed to update node"),
    });

  const deleteNode = (id: string): Promise<Result<void, AppError>> =>
    Result.tryPromise({
      try: async () => {
        await db.deleteFrom("nodes").where("id", "=", id).execute();
      },
      catch: dbError("Failed to delete node"),
    });

  const getNode = (id: string): Promise<Result<GraphNode | null, AppError>> =>
    Result.tryPromise({
      try: async () => {
        const row = await db
          .selectFrom("nodes")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirst();
        return row ? toNode(row) : null;
      },
      catch: dbError("Failed to get node"),
    });

  const listNodes = (): Promise<Result<GraphNode[], AppError>> =>
    Result.tryPromise({
      try: async () => {
        const rows = await db.selectFrom("nodes").selectAll().orderBy("id").execute();
        return rows.map(toNode);
      },
      catch: dbError("Failed to list nodes"),
    });

  const addEdge = (input: CreateEdgeInput): Promise<Result<GraphEdge, AppError>> =>
    Result.tryPromise({
      try: async () => {
        const row = await db
          .insertInto("edges")
          .values({
            id: input.id ?? nanoid(),
            sourceNode: input.sourceNode,
            sourcePort: input.sourcePort ?? null,
            targetNode: input.targetNode,
            targetPort: input.targetPort ?? null,
            kind: input.kind,
            behavior: input.behavior ?? null,
            config: toJson(input.config),
            meta: toJson(input.meta),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        return toEdge(row);
      },
      catch: dbError("Failed to add edge"),
    });

  const updateEdge = (
    id: string,
    input: UpdateEdgeInput,
  ): Promise<Result<GraphEdge | null, AppError>> =>
    Result.tryPromise({
      try: async () => {
        const row = await db
          .updateTable("edges")
          .set({
            ...(input.sourceNode ? { sourceNode: input.sourceNode } : {}),
            ...(input.sourcePort !== undefined ? { sourcePort: input.sourcePort } : {}),
            ...(input.targetNode ? { targetNode: input.targetNode } : {}),
            ...(input.targetPort !== undefined ? { targetPort: input.targetPort } : {}),
            ...(input.kind ? { kind: input.kind } : {}),
            ...(input.behavior !== undefined ? { behavior: input.behavior } : {}),
            ...(input.config ? { config: toJson(input.config) } : {}),
            ...(input.meta ? { meta: toJson(input.meta) } : {}),
          })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirst();

        return row ? toEdge(row) : null;
      },
      catch: dbError("Failed to update edge"),
    });

  const deleteEdge = (id: string): Promise<Result<void, AppError>> =>
    Result.tryPromise({
      try: async () => {
        await db.deleteFrom("edges").where("id", "=", id).execute();
      },
      catch: dbError("Failed to delete edge"),
    });

  const getEdge = (id: string): Promise<Result<GraphEdge | null, AppError>> =>
    Result.tryPromise({
      try: async () => {
        const row = await db
          .selectFrom("edges")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirst();
        return row ? toEdge(row) : null;
      },
      catch: dbError("Failed to get edge"),
    });

  const listEdges = (): Promise<Result<GraphEdge[], AppError>> =>
    Result.tryPromise({
      try: async () => {
        const rows = await db.selectFrom("edges").selectAll().orderBy("id").execute();
        return rows.map(toEdge);
      },
      catch: dbError("Failed to list edges"),
    });

  const downstreamOf = (id: string, hops?: number): Promise<Result<string[], AppError>> =>
    Result.tryPromise({
      try: async () => {
        const query = hops
          ? sql<{ id: string }>`
              WITH RECURSIVE downstream(id, depth) AS (
                SELECT target_node AS id, 1 AS depth
                FROM edges
                WHERE source_node = ${id}
                UNION ALL
                SELECT edges.target_node AS id, downstream.depth + 1 AS depth
                FROM edges
                JOIN downstream ON edges.source_node = downstream.id
                WHERE downstream.depth < ${hops}
              )
              SELECT DISTINCT id
              FROM downstream
              ORDER BY id
            `
          : sql<{ id: string }>`
              WITH RECURSIVE downstream(id, depth) AS (
                SELECT target_node AS id, 1 AS depth
                FROM edges
                WHERE source_node = ${id}
                UNION ALL
                SELECT edges.target_node AS id, downstream.depth + 1 AS depth
                FROM edges
                JOIN downstream ON edges.source_node = downstream.id
              )
              SELECT DISTINCT id
              FROM downstream
              ORDER BY id
            `;

        const rows = await query.execute(db);
        return rows.rows.map((row) => row.id);
      },
      catch: dbError("Failed to query downstream nodes"),
    });

  const upstreamOf = (id: string, hops?: number): Promise<Result<string[], AppError>> =>
    Result.tryPromise({
      try: async () => {
        const query = hops
          ? sql<{ id: string }>`
              WITH RECURSIVE upstream(id, depth) AS (
                SELECT source_node AS id, 1 AS depth
                FROM edges
                WHERE target_node = ${id}
                UNION ALL
                SELECT edges.source_node AS id, upstream.depth + 1 AS depth
                FROM edges
                JOIN upstream ON edges.target_node = upstream.id
                WHERE upstream.depth < ${hops}
              )
              SELECT DISTINCT id
              FROM upstream
              ORDER BY id DESC
            `
          : sql<{ id: string }>`
              WITH RECURSIVE upstream(id, depth) AS (
                SELECT source_node AS id, 1 AS depth
                FROM edges
                WHERE target_node = ${id}
                UNION ALL
                SELECT edges.source_node AS id, upstream.depth + 1 AS depth
                FROM edges
                JOIN upstream ON edges.target_node = upstream.id
              )
              SELECT DISTINCT id
              FROM upstream
              ORDER BY id DESC
            `;

        const rows = await query.execute(db);
        return rows.rows.map((row) => row.id);
      },
      catch: dbError("Failed to query upstream nodes"),
    });

  const listByJsonQuery = (
    table: "nodes" | "edges" | "properties",
    jsonPath: string,
    op: "=" | "!=" | ">" | ">=" | "<" | "<=",
    value: string | number,
  ): Promise<Result<unknown[], AppError>> =>
    Result.tryPromise({
      try: async () => {
        const rows = await sql<Record<string, unknown>>`
          SELECT *
          FROM ${sql.raw(table)}
          WHERE json_extract(config, ${jsonPath}) ${sql.raw(op)} ${value}
        `.execute(db);
        return rows.rows;
      },
      catch: dbError("Failed to query json fields"),
    });

  const writeTraceBatch = (rows: GraphTraceRow[]): Promise<Result<void, AppError>> =>
    Result.tryPromise({
      try: async () => {
        if (rows.length === 0) return;
        for (const row of rows) {
          await db
            .replaceInto("trace")
            .values({
              tick: row.tick,
              entityId: row.entityId,
              entityType: row.entityType,
              state: toJson(row.state),
              log: row.log ?? null,
            })
            .execute();
        }
      },
      catch: dbError("Failed to write trace"),
    });

  const readTrace = (filter: TraceFilter = {}): Promise<Result<GraphTraceRow[], AppError>> =>
    Result.tryPromise({
      try: async () => {
        let query = db.selectFrom("trace").selectAll();

        if (filter.entityId) {
          query = query.where("entityId", "=", filter.entityId);
        }

        if (filter.tickRange) {
          query = query
            .where("tick", ">=", filter.tickRange.start)
            .where("tick", "<=", filter.tickRange.end);
        }

        const rows = await query.orderBy("tick").orderBy("entityId").execute();
        return rows.map(toTraceRow);
      },
      catch: dbError("Failed to read trace"),
    });

  return {
    addNode,
    updateNode,
    deleteNode,
    getNode,
    listNodes,
    addEdge,
    updateEdge,
    deleteEdge,
    getEdge,
    listEdges,
    downstreamOf,
    upstreamOf,
    listByJsonQuery,
    writeTraceBatch,
    readTrace,
  };
};

export type GraphStore = ReturnType<typeof makeGraphStore>;
