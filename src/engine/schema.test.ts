import { describe, expect, it } from "bun:test";
import { defaultConfig, validateConfig, type NodeSchemaV2 } from "./schema.ts";

const schema: NodeSchemaV2 = {
  config: {
    wacc: { type: "number", default: 0.08, min: 0, max: 1 },
    enabled: { type: "boolean", default: true },
    strategy: { type: "enum", default: "a", options: ["a", "b", "c"] },
    label: { type: "string", default: "node" },
  },
};

describe("defaultConfig", () => {
  it("returns defaults for all fields", () => {
    expect(defaultConfig(schema)).toEqual({
      wacc: 0.08,
      enabled: true,
      strategy: "a",
      label: "node",
    });
  });

  it("returns empty object for empty schema", () => {
    expect(defaultConfig({ config: {} })).toEqual({});
  });
});

describe("validateConfig", () => {
  it("accepts valid config", () => {
    const result = validateConfig(schema, { wacc: 0.5, enabled: false, strategy: "b", label: "x" });
    expect(result.isOk()).toBe(true);
  });

  it("rejects number below min", () => {
    const result = validateConfig(schema, { wacc: -1, enabled: true, strategy: "a", label: "x" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_config");
      expect(result.error.message).toContain("wacc");
      expect(result.error.message).toContain("min");
    }
  });

  it("rejects number above max", () => {
    const result = validateConfig(schema, { wacc: 2, enabled: true, strategy: "a", label: "x" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_config");
      expect(result.error.message).toContain("wacc");
      expect(result.error.message).toContain("max");
    }
  });

  it("rejects wrong type for number field", () => {
    const result = validateConfig(schema, { wacc: true, enabled: true, strategy: "a", label: "x" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_config");
      expect(result.error.message).toContain("wacc");
    }
  });

  it("rejects unknown enum value", () => {
    const result = validateConfig(schema, { wacc: 0.1, enabled: true, strategy: "z", label: "x" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("invalid_config");
      expect(result.error.message).toContain("strategy");
    }
  });

  it("allows extra fields not in schema", () => {
    const result = validateConfig(schema, {
      wacc: 0.1,
      enabled: true,
      strategy: "a",
      label: "x",
      undocumented: 42,
    });
    expect(result.isOk()).toBe(true);
  });
});
