import { CompiledQuery, type DatabaseConnection, type Driver, type QueryResult } from "kysely";
import { Database } from "bun:sqlite";

export class BunSqliteDriver implements Driver {
  readonly #db: Database;

  constructor(filename: string) {
    this.#db = new Database(filename);
    this.#db.exec("PRAGMA journal_mode = WAL");
    this.#db.exec("PRAGMA foreign_keys = ON");
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new BunSqliteConnection(this.#db);
  }

  async beginTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("BEGIN"));
  }

  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async releaseConnection(_conn: DatabaseConnection): Promise<void> {}

  async destroy(): Promise<void> {
    this.#db.close();
  }
}

export class BunSqliteConnection implements DatabaseConnection {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery<unknown>): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.#db.prepare(sql);

    if (isSelectQuery(sql)) {
      const rows = stmt.all(...(parameters as any[])) as R[];
      return { rows };
    }

    const result = stmt.run(...(parameters as any[]));
    return {
      rows: [],
      numAffectedRows: BigInt(result.changes),
      insertId: BigInt(result.lastInsertRowid),
    } as QueryResult<R>;
  }

  async *streamQuery<R>(
    _compiledQuery: unknown,
    _chunkSize: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    yield* [];
    throw new Error("Streaming not supported by this driver");
  }
}

function isSelectQuery(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  return s.startsWith("select") || s.startsWith("with") || s.includes("returning");
}
