// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { solve } from './domain/solver';
import type { PlanModel, SolveResult } from './domain/types';
import type { SolverWorkerLike } from './workers/solverClient';
import type { SolveRequest, SolveResponse } from './workers/solver.worker';

afterEach(() => cleanup());

/** 异步执行本地 solve 的假 Worker：业务代码仍是 src/domain 里的同一份 */
function makeSyncWorker(): SolverWorkerLike {
  const w: SolverWorkerLike = {
    onReply: null,
    post(msg: SolveRequest) {
      const reply: SolveResponse = { revision: msg.revision, result: solve(msg.model) };
      setTimeout(() => w.onReply?.(reply), 0);
    },
    terminate() {},
  };
  return w;
}

const fakeInfeasibleReply: SolveResult = {
  status: 'infeasible',
  selections: [],
  totalCost: 0,
  maxDeviation: 0,
  frequencySequence: [],
  totalCombinations: 1,
  nodesVisited: 1,
  feasibleLeavesVisited: 0,
  durationMs: 0,
  diagnosis: [],
};

describe('工作台交互流程', () => {
  it('启动计算后展示全局最优与逐项核对信息', async () => {
    const user = userEvent.setup();
    render(<App createWorker={makeSyncWorker} />);

    await user.click(screen.getByRole('button', { name: '开始全局规划' }));

    await waitFor(() => expect(screen.getByText(/全局最优/)).toBeTruthy());
    expect(screen.getByText('总改频费用')).toBeTruthy();
    expect(screen.getByText('最大首选偏移')).toBeTruthy();
    expect(screen.getByText('选中频点序列')).toBeTruthy();
    // 示例模型最优解三个载波费用均为 0
    expect(screen.getAllByText('逐项核对')).toBeTruthy();
  });

  it('输入变更后旧结论立即撤下；错误输入阻止计算并明确反馈', async () => {
    const user = userEvent.setup();
    render(<App createWorker={makeSyncWorker} />);

    await user.click(screen.getByRole('button', { name: '开始全局规划' }));
    await waitFor(() => expect(screen.getByText(/全局最优/)).toBeTruthy());

    // 修改保护间隔为 0（非法）-> 旧结果立即消失，按钮禁用并出现错误汇总
    const guardInput = screen.getByLabelText(/保护间隔/);
    await user.clear(guardInput);
    await user.type(guardInput, '0');

    expect(screen.queryByText(/全局最优/)).toBeNull();
    expect(screen.getByRole('button', { name: '开始全局规划' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByText(/项输入错误/)).toBeTruthy();
    expect(screen.getByText('保护间隔必须为正整数 kHz（≥ 1）')).toBeTruthy();
  });

  it('结构合法但无可行组合时明确反馈无解并列出碰撞三元组', async () => {
    const user = userEvent.setup();
    // 合法结构（3 载波 × 2 候选），但所有频点挤在 1000/1002，guard=50 -> 必无解
    const infeasibleModel: PlanModel = {
      guardBand: 50,
      carriers: ['C1', 'C2', 'C3'].map((id) => ({
        id,
        preferredFreq: 1000,
        candidates: [
          { no: 1, freq: 1000, cost: 0 },
          { no: 2, freq: 1002, cost: 5 },
        ],
      })),
    };
    vi.stubGlobal('prompt', () => JSON.stringify(infeasibleModel));

    render(<App createWorker={makeSyncWorker} />);
    await user.click(screen.getByRole('button', { name: '粘贴 JSON' }));
    await user.click(screen.getByRole('button', { name: '开始全局规划' }));

    await waitFor(() => expect(screen.getByText(/无解/)).toBeTruthy());
    expect(screen.getByText(/不存在同时满足/)).toBeTruthy();
    // 诊断中给出载波对与实际距离 0
    expect(screen.getAllByText(/间隔碰撞/).length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('过期的 worker 回包被修订号作废，不会覆盖新结论', async () => {
    const user = userEvent.setup();
    const w: SolverWorkerLike = {
      onReply: null,
      post(msg) {
        if (msg.revision === 1) {
          // 第一次计算挂起，不回包；待输入变更并重新计算后再释放
          pendingFirst = () =>
            w.onReply?.({ revision: 1, result: fakeInfeasibleReply });
        } else {
          const reply: SolveResponse = { revision: msg.revision, result: solve(msg.model) };
          setTimeout(() => w.onReply?.(reply), 0);
        }
      },
      terminate() {},
    };
    let pendingFirst: (() => void) | null = null;

    render(<App createWorker={() => w} />);
    await user.click(screen.getByRole('button', { name: '开始全局规划' }));
    // 计算中（第一次回包挂起）
    await waitFor(() => expect(screen.getByText(/穷举比较/)).toBeTruthy());

    // 输入变更 -> 旧结论/计算立即撤下
    const guardInput = screen.getByLabelText(/保护间隔/);
    await user.clear(guardInput);
    await user.type(guardInput, '60');
    expect(screen.queryByText(/穷举比较/)).toBeNull();

    // 重新计算 -> 得到可行最优
    await user.click(screen.getByRole('button', { name: '开始全局规划' }));
    await waitFor(() => expect(screen.getByText(/全局最优/)).toBeTruthy());

    // 释放早已过期的 revision=1 回包（无解），界面应保持新结论
    pendingFirst!();
    await Promise.resolve();
    expect(screen.queryByText(/无解/)).toBeNull();
    expect(screen.getByText(/全局最优/)).toBeTruthy();
  });
});
