import { describe, expect, it } from "bun:test";
import type { IDockviewPanelProps } from "dockview-react";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceStore } from "../state/workspace-store.ts";
import { ChatPanel } from "./chat-panel.tsx";

type DocumentWithParseHTML = typeof Document & {
  parseHTML?: (html: string) => {
    body: {
      innerHTML: string;
    };
  };
};

const installParseHTML = (parseHTML: NonNullable<DocumentWithParseHTML["parseHTML"]>) => {
  const globalWithDocument = globalThis as typeof globalThis & {
    Document?: DocumentWithParseHTML;
  };
  const originalDocument = globalWithDocument.Document;
  globalWithDocument.Document = {
    parseHTML,
  } as DocumentWithParseHTML;

  return () => {
    globalWithDocument.Document = originalDocument;
  };
};

describe("ChatPanel", () => {
  it("renders markdown in both user and assistant messages", () => {
    workspaceStore.__resetForTests();
    workspaceStore.actions.pushChatMessage({ role: "user", content: "**bold**" });
    workspaceStore.actions.pushChatMessage({ role: "assistant", content: "_italics_" });

    let callCount = 0;
    const restore = installParseHTML((html) => {
      callCount += 1;
      return {
        body: {
          innerHTML: html,
        },
      };
    });

    const html = renderToStaticMarkup(<ChatPanel {...({} as IDockviewPanelProps)} />);

    restore();

    expect(html).toContain('class="content');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italics</em>");
    expect(callCount).toBe(2);
  });

  it("sanitizes rendered markdown with Document.parseHTML", () => {
    workspaceStore.__resetForTests();
    workspaceStore.actions.pushChatMessage({
      role: "user",
      content: "hello <script>alert('xss')</script>",
    });

    let sanitizedInput = "";
    const restore = installParseHTML((html) => {
      sanitizedInput = html;
      return {
        body: {
          innerHTML: "<p>hello </p>",
        },
      };
    });

    const html = renderToStaticMarkup(<ChatPanel {...({} as IDockviewPanelProps)} />);

    restore();

    expect(sanitizedInput).toContain("<script>alert('xss')</script>");
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).toContain("<p>hello </p>");
  });
});
