const SIM_WORKER_ENTRYPOINT = "./src/client/worker/sim-worker.ts";
export const SIM_WORKER_PATH = "/assets/sim-worker.js";

const buildSimWorkerBundle = async () => {
  const result = await Bun.build({
    entrypoints: [SIM_WORKER_ENTRYPOINT],
    target: "browser",
    format: "esm",
    splitting: false,
    sourcemap: "external",
  });

  if (!result.success) {
    throw new AggregateError(result.logs, "Failed to bundle sim worker");
  }

  const entrypoint = result.outputs.find((output) => output.kind === "entry-point");

  if (!entrypoint) {
    throw new Error("Sim worker bundle did not produce an entrypoint artifact");
  }

  return entrypoint;
};

export const createSimWorkerResponse = async () => {
  const artifact = await buildSimWorkerBundle();

  return new Response(artifact, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
