import { describe, it, expect } from "bun:test";
import { withRetry } from "./retry.ts";

describe("withRetry", () => {
  it("returns result on success (data-first)", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("returns result on success (data-last)", async () => {
    const result = await withRetry()(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on error and succeeds", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts === 1) {
        return Promise.reject(new Error("transient failure"));
      }
      return Promise.resolve("ok");
    };

    const result = await withRetry(fn, { attempts: 3, delayMs: 10 });
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("works with configured retry function", async () => {
    let attempts = 0;
    const fastRetry = withRetry({ attempts: 3, delayMs: 10 });

    const result = await fastRetry(() => {
      attempts++;
      if (attempts < 2) return Promise.reject(new Error("fail"));
      return Promise.resolve("ok");
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("retries up to max attempts then throws", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      return Promise.reject(new Error("persistent failure"));
    };

    await expect(withRetry(fn, { attempts: 3, delayMs: 10 })).rejects.toThrow("persistent failure");
    expect(attempts).toBe(3);
  });
});
