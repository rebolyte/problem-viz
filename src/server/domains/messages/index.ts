import { Result } from "better-result";
import type { AppConfig } from "../../services/config.ts";
import {
  type CreateMessageInput,
  type Message,
  parseMessage,
  parseMessageInput,
  toInsert,
} from "./schema.ts";
import { dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";
import type { LLMMessageParam } from "../../services/llm.ts";

type MessagesDeps = { config: AppConfig; db: Database; log: Logger };

const storeChatMessage =
  ({ db, log }: MessagesDeps) =>
  (input: CreateMessageInput) => {
    log.info("Storing chat message...");

    return Result.gen(async function* () {
      const parsed = yield* parseMessageInput(input);
      const row = yield* Result.await(
        Result.tryPromise({
          try: () =>
            db
              .insertInto("messages")
              .values(toInsert(parsed))
              .returningAll()
              .executeTakeFirstOrThrow(),
          catch: dbError("Failed to store message"),
        }),
      );
      const msg = yield* parseMessage(row);
      return Result.ok(msg);
    });
  };

const getChatHistory =
  ({ db }: MessagesDeps) =>
  ({ chatId, limit = 50 }: { chatId: string; limit?: number }) =>
    Result.gen(async function* () {
      const rows = yield* Result.await(
        Result.tryPromise({
          try: () =>
            db
              .selectFrom("messages")
              .selectAll()
              .where("chatId", "=", chatId)
              .orderBy("createdAt", "desc")
              .limit(limit)
              .execute(),
          catch: dbError("Failed to get chat history"),
        }),
      );
      const parsed: Message[] = [];
      for (const row of rows.toReversed()) {
        parsed.push(yield* parseMessage(row));
      }
      return Result.ok(parsed);
    });

const mapToLLM = (
  history: Message[],
  { ensureUser = true }: { ensureUser?: boolean } = {},
): LLMMessageParam[] => {
  const mapped = history.map((msg) =>
    msg.isBot
      ? { role: "assistant" as const, content: msg.message }
      : { role: "user" as const, content: `${msg.senderName} says: ${msg.message}` },
  );
  // ensure final message isn't used to constrain/prefill model response
  if (ensureUser && mapped.at(-1)?.role === "assistant") {
    mapped.push({ role: "user", content: "[Please continue]" });
  }
  return mapped;
};

export const makeMessagesDomain = (deps: MessagesDeps) => ({
  storeChatMessage: storeChatMessage(deps),
  getChatHistory: getChatHistory(deps),
  mapToLLM,
});

export type MessagesDomain = ReturnType<typeof makeMessagesDomain>;
