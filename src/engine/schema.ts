import { Result } from "better-result";
import { loomError, type LoomError } from "./errors.ts";

export type ConfigField =
  | { type: "number"; default: number; min?: number; max?: number; step?: number }
  | { type: "boolean"; default: boolean }
  | { type: "enum"; default: string; options: readonly string[] }
  | { type: "string"; default: string };

export type NodeSchemaV2 = {
  config: Record<string, ConfigField>;
  context?: Record<string, ConfigField>;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  initial?: string;
};

export type EdgeSchemaV2 = {
  config: Record<string, ConfigField>;
};

export const defaultConfig = (schema: NodeSchemaV2 | EdgeSchemaV2): Record<string, unknown> =>
  Object.fromEntries(Object.entries(schema.config).map(([key, field]) => [key, field.default]));

export const validateConfig = (
  schema: NodeSchemaV2 | EdgeSchemaV2,
  config: Record<string, unknown>,
): Result<void, LoomError> => {
  for (const [key, field] of Object.entries(schema.config)) {
    const value = config[key];

    if (field.type === "number") {
      if (typeof value !== "number") {
        return Result.err(loomError("invalid_config", `field "${key}" must be a number`));
      }
      if (field.min !== undefined && value < field.min) {
        return Result.err(
          loomError("invalid_config", `field "${key}" must be >= min ${field.min}, got ${value}`),
        );
      }
      if (field.max !== undefined && value > field.max) {
        return Result.err(
          loomError("invalid_config", `field "${key}" must be <= max ${field.max}, got ${value}`),
        );
      }
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") {
        return Result.err(loomError("invalid_config", `field "${key}" must be a boolean`));
      }
    } else if (field.type === "enum") {
      if (!field.options.includes(value as string)) {
        return Result.err(
          loomError(
            "invalid_config",
            `field "${key}" must be one of [${field.options.join(", ")}], got "${value}"`,
          ),
        );
      }
    } else if (field.type === "string") {
      if (typeof value !== "string") {
        return Result.err(loomError("invalid_config", `field "${key}" must be a string`));
      }
    }
  }

  return Result.ok(undefined);
};
