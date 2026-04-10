import home from "./index.html";
import { start } from "./src/server/main.ts";

const { container, api } = await start();

const server = Bun.serve({
  port: container.config.PORT,
  routes: {
    "/": home,
  },
  fetch: (req) => api.handle(req),
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Listening on ${server.url}`);
