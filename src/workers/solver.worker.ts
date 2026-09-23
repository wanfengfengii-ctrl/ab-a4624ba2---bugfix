import { solve } from '../domain/solver';
import type { PlanModel, SolveResult } from '../domain/types';

/** 计算在 Web Worker 中完成，主线程不执行业务计算 */
export interface SolveRequest {
  revision: number;
  model: PlanModel;
}
export interface SolveResponse {
  revision: number;
  result: SolveResult;
}

self.onmessage = (ev: MessageEvent<SolveRequest>) => {
  const { revision, model } = ev.data;
  const result = solve(model);
  const response: SolveResponse = { revision, result };
  (self as unknown as Worker).postMessage(response);
};
