import { describe, expect, it } from "bun:test";
import { simWorkerUrl } from "./sim-connection.ts";

describe("simWorkerUrl", () => {
  it("resolves the worker over the current http origin", () => {
    const previousWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          origin: "http://127.0.0.1:3002",
        },
      },
      configurable: true,
    });

    expect(simWorkerUrl()).toBe("http://127.0.0.1:3002/assets/sim-worker.js");

    Object.defineProperty(globalThis, "window", {
      value: previousWindow,
      configurable: true,
    });
  });
});
