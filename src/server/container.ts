import { makeAssistantDomain, type AssistantDomain } from "./domains/assistant/index.ts";
import { makeMessagesDomain, type MessagesDomain } from "./domains/messages/index.ts";
import { createDatabase, type Database } from "./services/database.ts";
import { makeLogger, type Logger } from "./services/logger.ts";
import { type AppConfig, createConfig } from "./services/config.ts";
import { makeLlmService, type LLMService } from "./services/llm.ts";

export type Services = {
  config: AppConfig;
  db: Database;
  log: Logger;
  llm: LLMService;
};

export type Container = Services & {
  assistant: AssistantDomain;
  messages: MessagesDomain;
  graph: null;
  engine: null;
  workspace: null;
};

export const bootstrap = (svcs: Services): Container => {
  const { config, db, log } = svcs;
  const messages = makeMessagesDomain({ config, db, log });

  return {
    ...svcs,
    assistant: makeAssistantDomain({ llm: svcs.llm, messages, log }),
    messages,
    graph: null,
    engine: null,
    workspace: null,
  };
};

export const makeContainer = async (
  overrides?: Omit<Partial<Services>, "config"> & { config?: Partial<AppConfig> },
) => {
  const config = createConfig(overrides?.config);
  const log = overrides?.log ?? (await makeLogger(config));

  const svcs: Services = {
    config,
    db: overrides?.db ?? createDatabase(config.DATABASE_PATH),
    log,
    llm: overrides?.llm ?? makeLlmService(config, log),
  };

  return bootstrap(svcs);
};
