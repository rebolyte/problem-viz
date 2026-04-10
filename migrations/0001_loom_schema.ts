import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("messages")
      .ifNotExists()
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("chat_id", "text", (col) => col.notNull())
      .addColumn("sender_id", "text", (col) => col.notNull())
      .addColumn("sender_name", "text", (col) => col.notNull())
      .addColumn("message", "text", (col) => col.notNull())
      .addColumn("is_bot", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    await trx.schema
      .createIndex("idx_messages_chat_id")
      .ifNotExists()
      .on("messages")
      .column("chat_id")
      .execute();

    await trx.schema
      .createTable("workspace_meta")
      .ifNotExists()
      .addColumn("key", "text", (col) => col.primaryKey())
      .addColumn("value", "text", (col) => col.notNull().check(sql`json_valid(value)`))
      .execute();

    await trx.schema
      .createTable("nodes")
      .ifNotExists()
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("kind", "text", (col) =>
        col.notNull().check(sql`kind IN ('tick', 'stock', 'variable', 'process')`),
      )
      .addColumn("schema", "text", (col) => col.notNull().check(sql`json_valid(schema)`))
      .addColumn("behavior", "text")
      .addColumn("config", "text", (col) =>
        col
          .notNull()
          .defaultTo("{}")
          .check(sql`json_valid(config)`),
      )
      .addColumn("meta", "text", (col) =>
        col
          .notNull()
          .defaultTo("{}")
          .check(sql`json_valid(meta)`),
      )
      .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    await trx.schema
      .createTable("edges")
      .ifNotExists()
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("source_node", "text", (col) =>
        col.notNull().references("nodes.id").onDelete("cascade"),
      )
      .addColumn("source_port", "text")
      .addColumn("target_node", "text", (col) =>
        col.notNull().references("nodes.id").onDelete("cascade"),
      )
      .addColumn("target_port", "text")
      .addColumn("kind", "text", (col) =>
        col
          .notNull()
          .check(
            sql`kind IN ('passthrough', 'channel', 'flow', 'dependency', 'ownership', 'causation', 'custom')`,
          ),
      )
      .addColumn("behavior", "text")
      .addColumn("config", "text", (col) =>
        col
          .notNull()
          .defaultTo("{}")
          .check(sql`json_valid(config)`),
      )
      .addColumn("meta", "text", (col) =>
        col
          .notNull()
          .defaultTo("{}")
          .check(sql`json_valid(meta)`),
      )
      .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    await trx.schema
      .createIndex("idx_edges_source")
      .ifNotExists()
      .on("edges")
      .column("source_node")
      .execute();

    await trx.schema
      .createIndex("idx_edges_target")
      .ifNotExists()
      .on("edges")
      .column("target_node")
      .execute();

    await trx.schema
      .createTable("trace")
      .ifNotExists()
      .addColumn("tick", "integer", (col) => col.notNull())
      .addColumn("entity_id", "text", (col) => col.notNull())
      .addColumn("entity_type", "text", (col) =>
        col.notNull().check(sql`entity_type IN ('node', 'edge')`),
      )
      .addColumn("state", "text", (col) => col.notNull().check(sql`json_valid(state)`))
      .addColumn("log", "text")
      .addPrimaryKeyConstraint("trace_pk", ["tick", "entity_id"])
      .execute();

    await trx.schema
      .createIndex("idx_trace_entity")
      .ifNotExists()
      .on("trace")
      .columns(["entity_id", "tick"])
      .execute();

    await trx.schema
      .createTable("properties")
      .ifNotExists()
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("kind", "text", (col) =>
        col.notNull().check(sql`kind IN ('invariant', 'liveness', 'statistical')`),
      )
      .addColumn("description", "text")
      .addColumn("check_source", "text", (col) => col.notNull())
      .addColumn("config", "text", (col) =>
        col
          .notNull()
          .defaultTo("{}")
          .check(sql`json_valid(config)`),
      )
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema.dropTable("properties").ifExists().execute();
    await trx.schema.dropTable("trace").ifExists().execute();
    await trx.schema.dropTable("edges").ifExists().execute();
    await trx.schema.dropTable("nodes").ifExists().execute();
    await trx.schema.dropTable("workspace_meta").ifExists().execute();
    await trx.schema.dropTable("messages").ifExists().execute();
  });
}
