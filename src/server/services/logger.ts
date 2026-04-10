import {
  configure,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
  type Logger as LogtapeLogger,
  type LogLevel,
} from "@logtape/logtape";
import { getPrettyFormatter } from "@logtape/pretty";
import { redactByPattern } from "@logtape/redaction";
import { AppConfig } from "./config.ts";

export type Logger = LogtapeLogger;
export type { LogLevel };

const redactPatterns = [
  { pattern: /sk-ant-[A-Za-z0-9_-]+/g, replacement: "[REDACTED_ANTHROPIC_KEY]" },
];

export const makeLogger = async (config: AppConfig): Promise<Logger> => {
  const { APP_ENV, LOG_LEVEL } = config;

  const pretty = redactByPattern(
    getPrettyFormatter({ properties: true, icons: false }),
    redactPatterns,
  );

  const jsonl = redactByPattern(getJsonLinesFormatter(), redactPatterns);

  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: APP_ENV === "dev" ? pretty : jsonl,
      }),
    },
    loggers: [
      { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "error" },
      { category: ["app", "server"], sinks: ["console"], lowestLevel: LOG_LEVEL },
      { category: ["app", "elysia"], sinks: ["console"], lowestLevel: LOG_LEVEL },
    ],
  });

  return getLogger(["app", "server"]);
};
