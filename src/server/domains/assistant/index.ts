import { Result } from "better-result";
import type { AgentMessage } from "../../../rpc/loom-client.ts";
import type { LLMMessageParam, LLMService } from "../../services/llm.ts";
import type { GraphStore } from "../../graph/store.ts";
import type { MessagesDomain } from "../messages/index.ts";
import type { Logger } from "../../services/logger.ts";
import type { Workspace } from "../../workspace/workspace.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { ASSISTANT_TOOLS } from "./tools.ts";

type AssistantDeps = {
  llm: LLMService;
  messages: MessagesDomain;
  workspace: Workspace;
  store: GraphStore;
  log: Logger;
};

type StreamChatInput = {
  chatId: string;
  userMessage: string;
  onEvent?: (event: AgentMessage) => Promise<void> | void;
};

const streamChat =
  ({ llm, messages, workspace, store, log }: AssistantDeps) =>
  async ({ chatId, userMessage, onEvent }: StreamChatInput) => {
    const storeResult = await messages.storeChatMessage({
      chatId,
      senderId: "user",
      senderName: "user",
      message: userMessage,
      isBot: false,
    });
    if (!storeResult.isOk()) {
      void log.warn`Failed to store user message: ${storeResult.error}`;
    }

    const historyResult = await messages.getChatHistory({ chatId });
    const history = historyResult.isOk() ? historyResult.value : [];
    if (!historyResult.isOk()) {
      void log.warn`Failed to fetch chat history: ${historyResult.error}`;
    }

    const problemStatement = await workspace.getProblemStatement();
    const nodes = await store.listNodes();
    const edges = await store.listEdges();

    const llmMessages: LLMMessageParam[] = messages.mapToLLM(history);
    const systemPrompt = buildSystemPrompt({
      problemStatement: problemStatement.isOk() ? problemStatement.value : "",
      nodeCount: nodes.isOk() ? nodes.value.length : 0,
      edgeCount: edges.isOk() ? edges.value.length : 0,
    });

    let assistantText = "";

    try {
      const stream = llm.streamWithTools({
        messages: llmMessages,
        systemPrompt,
        tools: ASSISTANT_TOOLS,
      });

      let currentToolName = "";
      let currentToolInput = "";

      for await (const event of stream) {
        switch (event.type) {
          case "content_block_start":
            if (event.content_block.type === "tool_use") {
              currentToolName = event.content_block.name;
              currentToolInput = "";
            }
            break;
          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              assistantText += event.delta.text;
              await onEvent?.({ type: "text", text: event.delta.text });
            } else if (event.delta.type === "input_json_delta") {
              currentToolInput += event.delta.partial_json;
            }
            break;
          case "content_block_stop":
            if (currentToolName) {
              await onEvent?.({
                type: "tool",
                name: currentToolName,
                input: currentToolInput ? JSON.parse(currentToolInput) : {},
              });
              currentToolName = "";
              currentToolInput = "";
            }
            break;
          case "message_stop":
            break;
        }
      }
    } catch (err) {
      void log.error`Stream error: ${err}`;
      return Result.err(err as never);
    }

    if (!assistantText) {
      assistantText = "Loom assistant is connected.";
      await onEvent?.({ type: "text", text: assistantText });
    }

    const saveResult = await messages.storeChatMessage({
      chatId,
      senderId: "assistant",
      senderName: "assistant",
      message: assistantText,
      isBot: true,
    });
    if (!saveResult.isOk()) {
      void log.warn`Failed to store assistant message: ${saveResult.error}`;
    }

    await onEvent?.({ type: "done" });
    return Result.ok(undefined);
  };

const getChatHistory =
  ({ messages }: AssistantDeps) =>
  async ({ chatId }: { chatId: string }) => {
    const result = await messages.getChatHistory({ chatId });
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
