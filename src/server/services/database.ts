import {
  CamelCasePlugin,
  Generated,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import type { LoomDatabase } from "../graph/schema.ts";
import { BunSqliteDriver } from "./sqlite.ts";

export interface MessagesTable {
  id: Generated<number>;
  chatId: string;
  senderId: string;
  senderName: string;
  message: string;
  isBot: number;
  createdAt: Generated<string>;
}

export type DatabaseSchema = { messages: MessagesTable } & LoomDatabase;

export type Database = Kysely<DatabaseSchema>;

export const createDatabase = (path: string): Database =>
  new Kysely<DatabaseSchema>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createDriver: () => new BunSqliteDriver(path),
      createIntrospector: (db) => new SqliteIntrospector(db),
      createQueryCompiler: () => new SqliteQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
