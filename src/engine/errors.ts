export type LoomError = { code: string; message: string; cause?: unknown };

export const loomError = (code: string, message: string, cause?: unknown): LoomError => ({
  code,
  message,
  cause,
});
