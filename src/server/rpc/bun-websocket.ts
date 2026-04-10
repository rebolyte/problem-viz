import type { ServerWebSocket } from "bun";

export class BunWebSocketAdapter extends EventTarget {
  constructor(private readonly socket: ServerWebSocket<{ sessionId: string }>) {
    super();
  }

  get readyState() {
    return WebSocket.OPEN;
  }

  send(message: string) {
    this.socket.send(message);
  }

  close(code?: number, reason?: string) {
    this.socket.close(code, reason);
  }

  emitMessage(message: string | Buffer | Uint8Array | ArrayBuffer) {
    const data =
      typeof message === "string"
        ? message
        : new TextDecoder().decode(message instanceof ArrayBuffer ? new Uint8Array(message) : message);

    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  emitClose(code: number, reason: string) {
    this.dispatchEvent(new CloseEvent("close", { code, reason }));
  }

  emitError() {
    this.dispatchEvent(new Event("error"));
  }
}
