import { Result } from "better-result";
import type { LLMService } from "../../services/llm.ts";
import type { MessagesDomain } from "../messages/index.ts";
import type { Logger } from "../../services/logger.ts";

type AssistantDeps = { llm: LLMService; messages: MessagesDomain; log: Logger };

type StreamChatInput = {
  chatId?: string;
  userId?: number | string;
  userMessage: string;
  currentDocument?: unknown;
};

const streamChat =
  ({ llm, messages, log }: AssistantDeps) =>
  async ({ chatId, userId, userMessage }: StreamChatInput) => {
    void llm;
    const resolvedChatId = chatId ?? String(userId ?? "local");

    const storeResult = await messages.storeChatMessage({
      chatId: resolvedChatId,
      senderId: "user",
      senderName: "user",
      message: userMessage,
      isBot: false,
    });
    if (!storeResult.isOk()) {
      void log.warn`Failed to store user message: ${storeResult.error}`;
    }

    const encoder = new TextEncoder();
    const assistantText = "Loom assistant bootstrapping.";

    return new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const saveResult = await messages.storeChatMessage({
            chatId: resolvedChatId,
            senderId: "assistant",
            senderName: "assistant",
            message: assistantText,
            isBot: true,
          });
          if (!saveResult.isOk()) {
            void log.warn`Failed to store assistant message: ${saveResult.error}`;
          }
          send("text", { delta: assistantText });
          send("done", {});
          controller.close();
        } catch (err) {
          void log.error`Stream error: ${err}`;
          controller.error(err);
        }
      },
    });
  };

const getChatHistory =
  ({ messages }: AssistantDeps) =>
  async ({ chatId, userId }: { chatId?: string; userId?: string | number }) => {
    const result = await messages.getChatHistory({ chatId: chatId ?? String(userId ?? "local") });
    if (!result.isOk()) return result;
    return Result.ok(
      result.value.map((msg) => ({
        role: msg.isBot ? ("assistant" as const) : ("user" as const),
        content: msg.message,
      })),
    );
  };

export const makeAssistantDomain = (deps: AssistantDeps) => ({
  streamChat: streamChat(deps),
  getChatHistory: getChatHistory(deps),
});

export type AssistantDomain = ReturnType<typeof makeAssistantDomain>;
