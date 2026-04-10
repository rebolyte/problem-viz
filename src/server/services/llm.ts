import Anthropic from "@anthropic-ai/sdk";
import { Result } from "better-result";
import { match, P } from "ts-pattern";
import * as R from "remeda";
import type { AppConfig } from "./config.ts";
import type { Logger } from "./logger.ts";
import { type AppError, llmError } from "../errors.ts";

export type LLMMessageParam = Anthropic.MessageParam;

type LlmDeps = {
  config: AppConfig;
  anthropic: Anthropic;
  log: Logger;
  systemPrompt?: string;
};

type Rates = { input: number; output: number };

// https://platform.claude.com/docs/en/about-claude/pricing
const MODEL_RATES: Record<string, Rates> = {
  "opus-4-5": { input: 5, output: 25 },
  "opus-4-1": { input: 15, output: 75 },
  "opus-4-0": { input: 15, output: 75 },
  "sonnet-4-5": { input: 3, output: 15 },
  "sonnet-4-0": { input: 3, output: 15 },
  "sonnet-3-7": { input: 3, output: 15 },
  "haiku-4-5": { input: 1, output: 5 },
  "haiku-3-5": { input: 0.8, output: 4 },
  "opus-3": { input: 15, output: 75 },
  "haiku-3": { input: 0.25, output: 1.25 },
};

const getRates = (model: string): Rates => {
  for (const [key, rates] of Object.entries(MODEL_RATES)) {
    if (model.includes(key)) return rates;
  }
  return { input: 3, output: 15 };
};

export const estimateCost = (
  model: Anthropic.Messages.Model,
  usage: Anthropic.Messages.Usage,
): string => {
  const rates = getRates(model);
  const cost =
    (usage.input_tokens / 1_000_000) * rates.input +
    (usage.output_tokens / 1_000_000) * rates.output;
  return `$${cost.toFixed(4)}`;
};

export const generateText =
  ({ config, anthropic, log, systemPrompt }: LlmDeps) =>
  ({
    messages,
    systemPrompt: systemPromptOverride,
  }: {
    messages: LLMMessageParam[];
    systemPrompt?: string;
  }): Promise<Result<string, AppError>> => {
    if (!R.isEmpty(messages) && messages.at(-1)?.role === "assistant") {
      void log.info`[generateText] last message is from assistant, this will be used to constrain model response (see docs)`;
    }

    return Result.gen(async function* () {
      const response = yield* Result.await(
        Result.tryPromise({
          try: () =>
            anthropic.messages
              .stream({
                model: config.ANTHROPIC_MODEL,
                max_tokens: config.ANTHROPIC_MAX_TOKENS,
                thinking: { type: "disabled" },
                temperature: 0.7,
                messages,
                ...(systemPromptOverride || systemPrompt
                  ? { system: systemPromptOverride || systemPrompt }
                  : {}),
              })
              .finalMessage(),
          catch: llmError("Claude API call failed"),
        }),
      );

      if (response.stop_reason === "refusal") {
        void log.warn`LLM refused to generate text ${{ content: response.content[0] }}`;
        return Result.ok("I apologize, but I can't do that.");
      }

      void log.info`usage: ${{
        ...response.usage,
        cost: estimateCost(config.ANTHROPIC_MODEL, response.usage),
      }}`;

      if (R.isEmpty(response.content)) {
        void log.warn`LLM returned empty content ${{ response }}`;
        return Result.ok(
          "I'm sorry, but I wasn't able to generate a response. Perhaps we could try again shortly?",
        );
      }

      const content = response.content[0];

      const text = match(content)
        .with({ type: "text" }, (c) => c.text)
        .with({ type: "thinking" }, (c) => c.thinking)
        .with({ type: "tool_use" }, (c) => `${c.name} ${JSON.stringify(c.input)}`)
        .with({ type: "server_tool_use" }, (c) => `${c.name} ${JSON.stringify(c.input)}`)
        .with({ type: "redacted_thinking" }, (c) => `thinking quietly: ${c.data}`)
        .with({ type: "web_search_tool_result", content: P.array() }, (c) =>
          (c.content as Array<{ title: string; url: string }>)
            .map((r) => `${r.title}: ${r.url}`)
            .join("\n"),
        )
        .with(
          { type: "web_search_tool_result", content: { error_code: P.select() } },
          (code) => `Search failed: ${code}`,
        )
        .otherwise(() => {
          void log.warn`LLM returned unexpected content ${{ response }}`;
          return "I'm sorry, but I didn't quite catch your request.";
        });

      return Result.ok(text);
    });
  };

export const streamWithTools =
  ({ config, anthropic }: LlmDeps) =>
  ({
    messages,
    systemPrompt,
    tools,
  }: {
    messages: LLMMessageParam[];
    systemPrompt: string;
    tools: Anthropic.Messages.Tool[];
  }) =>
    anthropic.messages.stream({
      model: config.ANTHROPIC_MODEL,
      max_tokens: config.ANTHROPIC_MAX_TOKENS,
      thinking: { type: "disabled" },
      temperature: 0.7,
      system: systemPrompt,
      messages,
      tools,
    });

export const makeLlmService = (
  config: AppConfig,
  log: Logger,
  opts: { anthropic?: Anthropic; systemPrompt?: string } = {},
) => {
  const deps: LlmDeps = {
    config,
    anthropic: opts.anthropic ?? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }),
    log,
    systemPrompt: opts.systemPrompt,
  };

  return {
    generateText: generateText(deps),
    streamWithTools: streamWithTools(deps),
  };
};

export type LLMService = ReturnType<typeof makeLlmService>;
