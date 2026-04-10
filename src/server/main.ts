import { makeContainer } from "./container.ts";
import { createServer } from "./server.ts";

export const start = async () => {
  const container = await makeContainer();
  const api = createServer(container);
  return { container, api };
};
