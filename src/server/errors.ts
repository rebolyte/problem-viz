import { TaggedError } from "better-result";

class ValidationError extends TaggedError("ValidationError")<{
  message: string;
  cause?: unknown;
}>() {}

class DbError extends TaggedError("DbError")<{
  message: string;
  cause?: unknown;
}>() {}

class LlmError extends TaggedError("LlmError")<{
  message: string;
  cause?: unknown;
}>() {}

type AppError = ValidationError | DbError | LlmError;

const appError = (kind: string, message: string, cause?: unknown): AppError => {
  if (kind === "db") return new DbError({ message, cause });
  if (kind === "llm") return new LlmError({ message, cause });
  return new ValidationError({ message, cause });
};

const dbError = (message: string) => (cause: unknown) => new DbError({ message, cause });

const llmError = (message: string) => (cause: unknown) => new LlmError({ message, cause });

export { type AppError, ValidationError, DbError, LlmError, appError, dbError, llmError };
