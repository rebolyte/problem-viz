import { Result } from "better-result";
import type Anthropic from "@anthropic-ai/sdk";
import type { RpcStub } from "capnweb";
import type { AgentMessage, LoomClientApi } from "../../../rpc/loom-client.ts";
import type { LLMMessageParam, LLMService } from "../../services/llm.ts";
import type { GraphStore } from "../../graph/store.ts";
import type { MessagesDomain } from "../messages/index.ts";
import type { Logger } from "../../services/logger.ts";
import type { Workspace } from "../../workspace/workspace.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { ASSISTANT_TOOLS } from "./tools.ts";
import { dispatchTool } from "./tool-handlers.ts";

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
  client?: RpcStub<LoomClientApi> | null;
  onEvent?: (event: AgentMessage) => Promise<void> | void;
};

const MAX_ROUNDS = 5;

const streamChat =
  ({ llm, messages, workspace, store, log }: AssistantDeps) =>
  async ({ chatId, userMessage, client, onEvent }: StreamChatInput) => {
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

    const systemPrompt = buildSystemPrompt({
      problemStatement: problemStatement.isOk() ? problemStatement.value : "",
      nodeCount: nodes.isOk() ? nodes.value.length : 0,
      edgeCount: edges.isOk() ? edges.value.length : 0,
    });

    let conversation: LLMMessageParam[] = messages.mapToLLM(history);
    let finalAssistantText = "";

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const stream = llm.streamWithTools({
          messages: conversation,
          systemPrompt,
          tools: ASSISTANT_TOOLS,
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            await onEvent?.({ type: "text", text: event.delta.text });
          }
        }

        const finalMessage = await stream.finalMessage();
        const assistantContent = finalMessage.content;

        for (const block of assistantContent) {
          if (block.type === "text") finalAssistantText += block.text;
        }

        if (finalMessage.stop_reason !== "tool_use") break;

        const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const block of assistantContent) {
          if (block.type !== "tool_use") continue;

          await onEvent?.({ type: "tool", name: block.name, input: block.input });

          const result = await dispatchTool({ store, workspace }, block.name, block.input);

          if (result.isOk()) {
            await onEvent?.({ type: "tool_result", name: block.name, result: result.value });
            if (client) {
              await client.onAgentMutation({ type: block.name, payload: result.value });
            }
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result.value ?? null),
            });
          } else {
            await onEvent?.({
              type: "tool_result",
              name: block.name,
              result: { error: result.error.message },
            });
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ error: result.error.message ?? String(result.error) }),
              is_error: true,
            });
          }
        }

        conversation = [
          ...conversation,
          { role: "assistant", content: assistantContent },
          { role: "user", content: toolResultBlocks },
        ];
      }
    } catch (err) {
      void log.error`Stream error: ${err}`;
      return Result.err(err as never);
    }

    if (!finalAssistantText) {
      finalAssistantText = "Loom assistant is connected.";
      await onEvent?.({ type: "text", text: finalAssistantText });
    }

    const saveResult = await messages.storeChatMessage({
      chatId,
      senderId: "assistant",
      senderName: "assistant",
      message: finalAssistantText,
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
