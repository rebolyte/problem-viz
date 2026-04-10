import { describe, it, expect } from "bun:test";
import { estimateCost } from "./llm.ts";
import type Anthropic from "@anthropic-ai/sdk";

const makeUsage = (input: number, output: number) =>
  ({ input_tokens: input, output_tokens: output }) as Anthropic.Messages.Usage;

describe("LLM", () => {
  describe("estimateCost", () => {
    it("calculates sonnet-4-5 correctly", () => {
      expect(estimateCost("claude-sonnet-4-5-20250514", makeUsage(50_000, 2_000))).toBe("$0.1800");
    });

    it("calculates haiku-3-5 correctly", () => {
      expect(estimateCost("claude-haiku-3-5-20241022", makeUsage(100_000, 10_000))).toBe("$0.1200");
    });

    it("calculates opus-4-5 correctly", () => {
      expect(estimateCost("claude-opus-4-5-20250514", makeUsage(10_000, 4_000))).toBe("$0.1500");
    });

    it("falls back to sonnet pricing for unknown models", () => {
      expect(estimateCost("claude-unknown-model", makeUsage(50_000, 2_000))).toBe("$0.1800");
    });

    it("shows small haiku costs", () => {
      expect(estimateCost("claude-haiku-3-5-20241022", makeUsage(1089, 423))).toBe("$0.0026");
    });
  });
});
