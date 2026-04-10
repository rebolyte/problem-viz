import { z } from "zod";
import type { LogLevel } from "./logger.ts";

const logLevels: readonly LogLevel[] = ["trace", "debug", "info", "warning", "error", "fatal"];

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  APP_ENV: z.enum(["dev", "prod"]).default("dev"),
  LOG_LEVEL: z.enum(logLevels).default("info"),
  DATABASE_PATH: z.string().default("data/workspace.sqlite"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY required"),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().default(4196),
  TIMEZONE: z.string().default("America/Los_Angeles"),
  PUBLIC_URL: z.url().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const createConfig = (overrides: Partial<AppConfig> = {}): AppConfig => {
  const raw = {
    PORT: Bun.env.PORT,
    HOST: Bun.env.HOST,
    APP_ENV: Bun.env.APP_ENV,
    LOG_LEVEL: Bun.env.LOG_LEVEL,
    DATABASE_PATH: Bun.env.DATABASE_PATH,
    ANTHROPIC_API_KEY: Bun.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: Bun.env.ANTHROPIC_MODEL,
    ANTHROPIC_MAX_TOKENS: Bun.env.ANTHROPIC_MAX_TOKENS,
    TIMEZONE: Bun.env.TIMEZONE,
    PUBLIC_URL: Bun.env.PUBLIC_URL,
    ...overrides,
  };

  return ConfigSchema.parse(raw);
};
