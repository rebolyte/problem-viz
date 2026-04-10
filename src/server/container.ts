import { makeAssistantDomain, type AssistantDomain } from "./domains/assistant/index.ts";
import { makeMessagesDomain, type MessagesDomain } from "./domains/messages/index.ts";
import { makeGraphStore, type GraphStore } from "./graph/store.ts";
import { createDatabase, type Database } from "./services/database.ts";
import { makeLogger, type Logger } from "./services/logger.ts";
import { type AppConfig, createConfig } from "./services/config.ts";
import { makeLlmService, type LLMService } from "./services/llm.ts";
import { makeWorkspace, type Workspace } from "./workspace/workspace.ts";

export type Services = {
  config: AppConfig;
  db: Database;
  log: Logger;
  llm: LLMService;
};

export type Container = Services & {
  assistant: AssistantDomain;
  messages: MessagesDomain;
  graph: GraphStore;
  engine: null;
  workspace: Workspace;
};

export const bootstrap = (svcs: Services): Container => {
  const { config, db, log } = svcs;
  const messages = makeMessagesDomain({ config, db, log });
  const graph = makeGraphStore(db);
  const workspace = makeWorkspace({ db, store: graph });

  return {
    ...svcs,
    assistant: makeAssistantDomain({ llm: svcs.llm, messages, workspace, store: graph, log }),
    messages,
    graph,
    engine: null,
    workspace,
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
