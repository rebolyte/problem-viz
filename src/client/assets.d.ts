declare module "*.png" {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    __loom?: Record<string, unknown>;
  }
}

declare namespace Temporal {
  interface PlainDateTime {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
  }
  namespace Now {
    function plainDateTimeISO(): PlainDateTime;
  }
}

export {};
