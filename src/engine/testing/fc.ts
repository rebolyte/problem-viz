export const fcParams = () => ({
  ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
  ...(process.env.FC_NUM_RUNS ? { numRuns: Number(process.env.FC_NUM_RUNS) } : {}),
});
