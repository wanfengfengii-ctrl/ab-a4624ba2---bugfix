import type { SolveRequest, SolveResponse } from './solver.worker';

/** 求解 Worker 的最小接口，便于在测试中替换为同步假实现 */
export interface SolverWorkerLike {
  post(msg: SolveRequest): void;
  onReply: ((reply: SolveResponse) => void) | null;
  terminate(): void;
}

/** 真实实现：计算在 Web Worker 中完成，主线程不执行业务计算 */
export function createSolverWorker(): SolverWorkerLike {
  const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), {
    type: 'module',
  });
  const api: SolverWorkerLike = {
    post: (msg) => worker.postMessage(msg),
    onReply: null,
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (ev: MessageEvent<SolveResponse>) => {
    api.onReply?.(ev.data);
  };
  return api;
}
