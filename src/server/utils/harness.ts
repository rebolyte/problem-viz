import { promises as fs } from "node:fs";
import * as path from "node:path";
import { FileMigrationProvider, Kysely, Migrator } from "kysely";
import { createDatabase, type DatabaseSchema } from "../services/database.ts";

export async function createTestDb() {
  const db = createDatabase(":memory:");

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(process.cwd(), "migrations"),
    }),
  });

  const { error } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  return db;
}

export function useHarness() {
  let db: Kysely<DatabaseSchema>;

  return {
    get db() {
      return db;
    },

    async setup() {
      db = await createTestDb();
    },

    async reset() {
      await db.deleteFrom("messages").execute();
    },

    async teardown() {
      await db.destroy();
    },
  };
}
