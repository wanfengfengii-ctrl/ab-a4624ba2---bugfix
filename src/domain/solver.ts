import { checkIncremental, computeMargins, findViolations } from './constraints';
import type { PlanModel, SelectionDetail, SolveResult } from './types';
import { compareCarrierId } from './types';

interface OrderedOption {
  no: number;
  freq: number;
  cost: number;
  deviation: number;
}

interface Best {
  pick: number[];
  cost: number;
  maxDeviation: number;
}

/**
 * 完整比较所有可行组合，按以下顺序取全局最优：
 *   1) 总改频费用最小
 *   2) 费用相同则相对首选频点的最大偏移最小
 *   3) 仍相同则按载波编号排列的频点序列字典序最小
 *
 * 穷举采用 DFS + 增量约束检查 + 三级安全剪枝。所有剪枝都只删除被证明
 * 不可能优于现任最优（incumbent）的分支，因此结论与逐一枚举笛卡尔积
 * 完全一致：
 *   - 费用下界严格更大 → 剪；
 *   - 费用下界相等、偏移下界严格更大 → 剪；
 *   - 前两者下界均相等、频点序列前缀已严格更大 → 剪
 *     （此时该子树最多与现任打平前两级，而第三级必输）。
 */
export function solve(model: PlanModel): SolveResult {
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // 按载波编号（数值感知）排序，作为序列比较的固定顺序
  const carriers = [...model.carriers].sort((a, b) => compareCarrierId(a.id, b.id));
  const guard = model.guardBand;
  const n = carriers.length;

  // 每个载波的候选按 费用↑ 偏移↑ 频点↑ 排序，尽早找到高质量现任解；
  // 排序只影响搜索路径，不影响最优性（比较规则与剪枝均与访问顺序无关）
  const options: OrderedOption[][] = carriers.map((c) =>
    c.candidates
      .map((a) => ({
        no: a.no,
        freq: a.freq,
        cost: a.cost,
        deviation: Math.abs(a.freq - c.preferredFreq),
      }))
      .sort((x, y) => x.cost - y.cost || x.deviation - y.deviation || x.freq - y.freq),
  );
  const totalCombinations = options.reduce((acc, list) => acc * list.length, 1);

  // 费用乐观下界后缀
  const suffixMinCost: number[] = new Array(n + 1).fill(0);
  // 偏移乐观下界后缀：max_{t>=idx} 该载波最小可达偏移
  const suffixMinDev: number[] = new Array(n + 1).fill(0);
  for (let idx = n - 1; idx >= 0; idx--) {
    suffixMinCost[idx] = suffixMinCost[idx + 1] + Math.min(...options[idx].map((o) => o.cost));
    suffixMinDev[idx] = Math.max(
      suffixMinDev[idx + 1],
      Math.min(...options[idx].map((o) => o.deviation)),
    );
  }

  let nodesVisited = 0;
  let feasibleLeavesVisited = 0;
  let best: Best | null = null;

  const pickedFreq = new Array<number>(n);
  const selected: { id: string; freq: number }[] = [];

  function considerLeaf(pick: number[], cost: number, maxDeviation: number): void {
    feasibleLeavesVisited++;
    if (!best) {
      best = { pick: [...pick], cost, maxDeviation };
      return;
    }
    const better =
      cost < best.cost ||
      (cost === best.cost &&
        (maxDeviation < best.maxDeviation ||
          (maxDeviation === best.maxDeviation && lexicographicallySmaller(pickedFreq, best))));
    if (better) {
      best = { pick: [...pick], cost, maxDeviation };
    }
  }

  /** 当前频点序列是否比现任序列字典序更小（按载波编号顺序逐位比较） */
  function lexicographicallySmaller(currentFreqs: number[], incumbent: Best): boolean {
    for (let idx = 0; idx < n; idx++) {
      const other = options[idx][incumbent.pick[idx]].freq;
      if (currentFreqs[idx] !== other) return currentFreqs[idx] < other;
    }
    return false;
  }

  function dfs(idx: number, partialCost: number, partialMaxDev: number, pick: number[]): void {
    nodesVisited++;

    const incumbent = best;
    if (incumbent) {
      const lbCost = partialCost + suffixMinCost[idx];
      if (lbCost > incumbent.cost) return; // 费用必更差
      const lbDev = Math.max(partialMaxDev, suffixMinDev[idx]);
      if (lbCost === incumbent.cost && lbDev > incumbent.maxDeviation) return; // 费用打平、偏移必更差

      if (lbCost === incumbent.cost && lbDev === incumbent.maxDeviation) {
        // 前两级最多与现任打平，由频点序列前缀决定第三级胜负
        for (let t = 0; t < idx; t++) {
          const other = options[t][incumbent.pick[t]].freq;
          if (pickedFreq[t] !== other) {
            if (pickedFreq[t] > other) return; // 前缀已更大 → 子树必输
            break; // 前缀已更小 → 子树在第三级必胜出，继续找可行叶
          }
        }
      }
    }

    if (idx === n) {
      considerLeaf(pick, partialCost, partialMaxDev);
      return;
    }

    const carrier = carriers[idx];
    for (let optIdx = 0; optIdx < options[idx].length; optIdx++) {
      const cand = options[idx][optIdx];
      const newOne = { id: carrier.id, freq: cand.freq };
      if (!checkIncremental(selected, newOne, guard)) continue;

      selected.push(newOne);
      pickedFreq[idx] = cand.freq;
      pick[idx] = optIdx;

      dfs(
        idx + 1,
        partialCost + cand.cost,
        Math.max(partialMaxDev, cand.deviation),
        pick,
      );

      selected.pop();
    }
  }

  dfs(0, 0, 0, new Array<number>(n).fill(-1));

  const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;

  if (!best) {
    // 无解诊断：取“每载波最便宜候选”的组合，列出其碰撞供工程师参考
    const cheapest = carriers.map((c) => {
      const pickIdx = minCostIndex(c.candidates.map((x) => x.cost));
      return { id: c.id, freq: c.candidates[pickIdx].freq };
    });
    return {
      status: 'infeasible' as const,
      selections: [],
      totalCost: 0,
      maxDeviation: 0,
      frequencySequence: [],
      totalCombinations,
      nodesVisited,
      feasibleLeavesVisited: 0,
      durationMs,
      diagnosis: findViolations(cheapest, guard),
    };
  }

  const answer: Best = best;

  const chosen = carriers.map((c, idx) => ({
    id: c.id,
    freq: options[idx][answer.pick[idx]].freq,
  }));
  const margins = computeMargins(chosen, guard);

  const selections: SelectionDetail[] = carriers.map((carrier, idx) => {
    const optIdx = answer.pick[idx];
    const cand = options[idx][optIdx];
    return {
      carrierId: carrier.id,
      candidateNo: cand.no,
      freq: cand.freq,
      cost: cand.cost,
      preferredFreq: carrier.preferredFreq,
      deviation: cand.deviation,
      margin: margins[idx],
    };
  });

  return {
    status: 'feasible',
    selections,
    totalCost: answer.cost,
    maxDeviation: answer.maxDeviation,
    frequencySequence: chosen.map((s) => ({ carrierId: s.id, freq: s.freq })),
    totalCombinations,
    nodesVisited,
    feasibleLeavesVisited,
    durationMs,
  };
}

function minCostIndex(costs: number[]): number {
  let m = 0;
  for (let i = 1; i < costs.length; i++) {
    if (costs[i] < costs[m]) m = i;
  }
  return m;
}
