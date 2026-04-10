import { Result } from "better-result";
import { dbError, type AppError } from "../errors.ts";
import type { GraphStore } from "../graph/store.ts";
import type { Database } from "../services/database.ts";

type WorkspaceMetaValue = unknown;

type WorkspaceDeps = {
  db: Database;
  store: GraphStore;
};

type UndoEntry = {
  key: string;
  previousValue: WorkspaceMetaValue | null;
  nextValue: WorkspaceMetaValue;
};

const WORKSPACE_KEYS = {
  problemStatement: "problem_statement",
  layout: "layout_json",
} as const;

const toJson = (value: unknown) => JSON.stringify(value);

const getMeta =
  ({ db }: WorkspaceDeps) =>
  async (key: string): Promise<Result<WorkspaceMetaValue | null, AppError>> =>
    Result.tryPromise({
      try: async () => {
        const row = await db
          .selectFrom("workspace_meta")
          .selectAll()
          .where("key", "=", key)
          .executeTakeFirst();
        return row ? JSON.parse(row.value) : null;
      },
      catch: dbError(`Failed to read workspace meta for ${key}`),
    });

const setMeta =
  ({ db }: WorkspaceDeps) =>
  async (key: string, value: WorkspaceMetaValue): Promise<Result<void, AppError>> =>
    Result.tryPromise({
      try: async () => {
        await db
          .insertInto("workspace_meta")
          .values({
            key,
            value: toJson(value),
          })
          .onConflict((oc) =>
            oc.column("key").doUpdateSet({
              value: toJson(value),
            }),
          )
          .execute();
      },
      catch: dbError(`Failed to write workspace meta for ${key}`),
    });

export const makeWorkspace = (deps: WorkspaceDeps) => {
  void deps.store;
  const readMeta = getMeta(deps);
  const writeMeta = setMeta(deps);
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];

  const applyChange = async (key: string, value: WorkspaceMetaValue, trackHistory: boolean) => {
    const previous = await readMeta(key);
    if (!previous.isOk()) {
      return previous;
    }

    const written = await writeMeta(key, value);
    if (!written.isOk()) {
      return written;
    }

    if (trackHistory) {
      undoStack.push({
        key,
        previousValue: previous.value,
        nextValue: value,
      });
      redoStack.length = 0;
    }

    return Result.ok(undefined);
  };

  const getProblemStatement = async () => {
    const result = await readMeta(WORKSPACE_KEYS.problemStatement);
    if (!result.isOk()) {
      return result;
    }

    return Result.ok(typeof result.value === "string" ? result.value : "");
  };

  const setProblemStatement = (problemStatement: string) =>
    applyChange(WORKSPACE_KEYS.problemStatement, problemStatement, true);

  const getLayout = async () => {
    const result = await readMeta(WORKSPACE_KEYS.layout);
    if (!result.isOk()) {
      return result;
    }

    return Result.ok(result.value);
  };

  const setLayout = (layout: WorkspaceMetaValue) =>
    applyChange(WORKSPACE_KEYS.layout, layout, true);

  const undo = async () => {
    const entry = undoStack.pop();
    if (!entry) {
      return Result.ok(false);
    }

    const nextValue = entry.previousValue ?? "";
    const applied = await writeMeta(entry.key, nextValue);
    if (!applied.isOk()) {
      undoStack.push(entry);
      return applied;
    }

    redoStack.push(entry);
    return Result.ok(true);
  };

  const redo = async () => {
    const entry = redoStack.pop();
    if (!entry) {
      return Result.ok(false);
    }

    const applied = await writeMeta(entry.key, entry.nextValue);
    if (!applied.isOk()) {
      redoStack.push(entry);
      return applied;
    }

    undoStack.push(entry);
    return Result.ok(true);
  };

  return {
    getProblemStatement,
    setProblemStatement,
    getLayout,
    setLayout,
    undo,
    redo,
  };
};

export type Workspace = ReturnType<typeof makeWorkspace>;
