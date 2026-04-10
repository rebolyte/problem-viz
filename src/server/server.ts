import { Elysia } from "elysia";
import { elysiaLogger } from "@logtape/elysia";
import type { Container } from "./container.ts";

export const createServer = (_ctx: Container) =>
  new Elysia({ prefix: "/api" })
    .use(
      elysiaLogger({
        category: ["app", "elysia"],
      }),
    )
    .get("/health", () => ({ status: "ok" }));
