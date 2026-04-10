import { Elysia, t } from "elysia";
import { elysiaLogger } from "@logtape/elysia";
import type { Result } from "better-result";
import type { Container } from "./container.ts";

const resultToResponse = <T>(result: Result<T, { message: string }>) =>
  result.isOk()
    ? Response.json(result.value)
    : Response.json({ error: result.error.message }, { status: 400 });

export const createServer = (ctx: Container) =>
  new Elysia({ prefix: "/api" })
    .use(
      elysiaLogger({
        category: ["app", "elysia"],
      }),
    )
    .get("/health", () => ({ status: "ok" }))
    .post(
      "/chat",
      async ({ body }) => {
        const stream = await ctx.assistant.streamChat({
          chatId: "local",
          userMessage: body.message,
          currentDocument: body.currentDocument,
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
      {
        body: t.Object({
          message: t.String(),
          currentDocument: t.Optional(t.Any()),
        }),
      },
    )
    .get("/chat/history", async () =>
      resultToResponse(
        await ctx.assistant.getChatHistory({
          chatId: "local",
        }),
      ),
    );
