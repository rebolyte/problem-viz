export type RpcError = {
  message: string;
  type?: string;
};

export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError };
