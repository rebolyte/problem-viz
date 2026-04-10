import { promises as fs } from "node:fs";
import * as path from "node:path";
import { FileMigrationProvider, Migrator } from "kysely";
import { parseArgs } from "node:util";
import { createDatabase } from "./src/server/services/database.ts";
import { createConfig } from "./src/server/services/config.ts";

async function runMigration() {
  const config = createConfig();
  const db = createDatabase(config.DATABASE_PATH);

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(process.cwd(), "migrations"),
    }),
  });

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      direction: { type: "string", short: "d", default: "latest" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log("Usage: bun migrate.ts [direction]");
    console.log("Directions: latest (default), up, down");
    process.exit(0);
  }

  const direction = positionals[0] || values.direction;

  let result;

  switch (direction) {
    case "up":
      console.log("Migrating up...");
      result = await migrator.migrateUp();
      break;
    case "down":
      console.log("Migrating down...");
      result = await migrator.migrateDown();
      break;
    case "latest":
      console.log("Migrating to latest...");
      result = await migrator.migrateToLatest();
      break;
    default:
      console.error(`Unknown direction: ${direction}`);
      process.exit(1);
  }

  const { error, results } = result;

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("failed to migrate");
    console.error(error);
    process.exit(1);
  }

  await db.destroy();
}

runMigration();
