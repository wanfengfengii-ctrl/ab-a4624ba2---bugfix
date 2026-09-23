import { describe, expect, it } from 'vitest';
import { checkIncremental, computeMargins, findViolations } from './constraints';
import { solve } from './solver';
import type { PlanModel } from './types';
import { compareCarrierId } from './types';

describe('findViolations - 载波间隔', () => {
  it('间隔恰好等于保护间隔时合法', () => {
    const sel = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 1050 },
      { id: 'C', freq: 1100 },
    ];
    expect(findViolations(sel, 50).filter((v) => v.kind === 'spacing')).toHaveLength(0);
  });

  it('间隔小于保护间隔时报告实际距离', () => {
    const sel = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 1040 },
      { id: 'C', freq: 1200 },
    ];
    const spacing = findViolations(sel, 50).filter((v) => v.kind === 'spacing');
    expect(spacing).toHaveLength(1);
    expect(spacing[0]).toMatchObject({
      carrierA: 'A',
      carrierB: 'B',
      distance: 40,
      guard: 50,
    });
  });
});

describe('findViolations - 三阶互调 2fi-fj', () => {
  it('检测 2fi-fj 落入第三载波保护区', () => {
    // i=A:1000, j=B:950 -> 2*1000-950 = 1050; C=1055, 距离 5 < 50
    const sel = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 950 },
      { id: 'C', freq: 1055 },
    ];
    const im3 = findViolations(sel, 50).filter((v) => v.kind === 'im3');
    expect(im3.length).toBeGreaterThan(0);
    const hit = im3.find((v) => v.i === 'A' && v.j === 'B' && v.k === 'C');
    expect(hit).toBeDefined();
    expect(hit && 'product' in hit && hit.product).toBe(1050);
    expect(hit && 'distance' in hit && hit.distance).toBe(5);
  });

  it('区分 i/j 方向：2fi-fj 与 2fj-fi 都检查', () => {
    // A=1000, B=1100: 2A-B=900, 2B-A=1200; C=1210 距离 10
    const sel = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 1100 },
      { id: 'C', freq: 1210 },
    ];
    const im3 = findViolations(sel, 50).filter((v) => v.kind === 'im3');
    expect(im3.find((v) => v.i === 'B' && v.j === 'A' && v.k === 'C')).toBeDefined();
    expect(im3.find((v) => v.i === 'A' && v.j === 'B' && v.k === 'C')).toBeUndefined();
  });

  it('距离恰好等于保护间隔时不算碰撞', () => {
    const sel = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 1000 - 25 },
      { id: 'C', freq: 1025 },
    ];
    // 2*A-B = 1025 = C，距离 0 仍然碰撞（换个边界例子）
    expect(findViolations(sel, 1).filter((v) => v.kind === 'im3').length).toBeGreaterThan(0);
    const sel2 = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 900 },
      { id: 'C', freq: 1150 },
    ];
    // 2A-B=1100, |1100-1150|=50 = guard 边界合法
    const im3 = findViolations(sel2, 50).filter((v) => v.kind === 'im3');
    expect(im3.find((v) => v.i === 'A' && v.j === 'B' && v.k === 'C')).toBeUndefined();
  });

  it('增量检查与全量检查在任意前缀下结论一致（随机前缀）', () => {
    const all = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 1080 },
      { id: 'C', freq: 1160 },
      { id: 'D', freq: 1240 },
    ];
    for (let cut = 0; cut <= 3; cut++) {
      const existing = all.slice(0, cut);
      const next = all[cut];
      const fullOk = findViolations(all.slice(0, cut + 1), 60).length === 0;
      expect(checkIncremental(existing, next, 60)).toBe(fullOk);
    }
  });
});

describe('computeMargins', () => {
  it('输出最近威胁与裕量', () => {
    const sel = [
      { id: 'A', freq: 1000 },
      { id: 'B', freq: 1060 },
      { id: 'C', freq: 1200 },
    ];
    const margins = computeMargins(sel, 50);
    const a = margins.find((m) => m.carrierId === 'A')!;
    expect(a.spacingNearest?.otherId).toBe('B');
    expect(a.spacingNearest?.distance).toBe(60);
    expect(a.spacingNearest?.margin).toBe(10);
    // 2B-? 互调：2*1060-1200=920 (距 A 80); 2*1200-1060=1340; 2*1000-1060=940 ...
    expect(a.worstMargin).toBe(10);
  });
});

/** 参考暴力求解：枚举笛卡尔积，全量校验，按三级目标取最优 */
function bruteForce(model: PlanModel) {
  const carriers = [...model.carriers].sort((a, b) => compareCarrierId(a.id, b.id));
  const opts = carriers.map((c) => c.candidates);
  const n = carriers.length;
  const pick = new Array(n).fill(0);
  let best: { pick: number[]; cost: number; maxDev: number; freqs: number[] } | null = null;
  let feasible = 0;
  let total = 0;

  while (true) {
    total++;
    const selected = carriers.map((c, i) => ({ id: c.id, freq: opts[i][pick[i]].freq }));
    if (findViolations(selected, model.guardBand).length === 0) {
      feasible++;
      const cost = opts.reduce((s, list, i) => s + list[pick[i]].cost, 0);
      const maxDev = Math.max(
        ...carriers.map((c, i) => Math.abs(opts[i][pick[i]].freq - c.preferredFreq)),
      );
      const freqs = selected.map((s) => s.freq);
      if (
        !best ||
        cost < best.cost ||
        (cost === best.cost &&
          (maxDev < best.maxDev ||
            (maxDev === best.maxDev && lexicographic(freqs, best.freqs) < 0)))
      ) {
        best = { pick: [...pick], cost, maxDev, freqs };
      }
    }
    // 进位
    let i = n - 1;
    while (i >= 0) {
      pick[i]++;
      if (pick[i] < opts[i].length) break;
      pick[i] = 0;
      i--;
    }
    if (i < 0) break;
  }
  return { best, feasible, total };
}

function lexicographic(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** 简易确定性 PRNG */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('solve - 基础优化', () => {
  it('无冲突时选择每载波最便宜候选（首选频点费用为 0）', () => {
    // 1000/1100/1300：间距足够，且任意 2fi-fj 都不落在第三载波附近
    // （注意 1000/1100/1200 会有 2*1100-1000=1200 恰撞 C3）
    const model: PlanModel = {
      guardBand: 10,
      carriers: [
        {
          id: 'C1',
          preferredFreq: 1000,
          candidates: [
            { no: 1, freq: 1000, cost: 0 },
            { no: 2, freq: 2000, cost: 5 },
          ],
        },
        {
          id: 'C2',
          preferredFreq: 1100,
          candidates: [
            { no: 1, freq: 1100, cost: 0 },
            { no: 2, freq: 2100, cost: 5 },
          ],
        },
        {
          id: 'C3',
          preferredFreq: 1300,
          candidates: [
            { no: 1, freq: 1300, cost: 0 },
            { no: 2, freq: 2300, cost: 5 },
          ],
        },
      ],
    };
    const r = solve(model);
    expect(r.status).toBe('feasible');
    expect(r.totalCost).toBe(0);
    expect(r.maxDeviation).toBe(0);
    expect(r.selections.map((s) => s.freq)).toEqual([1000, 1100, 1300]);
  });

  it('最便宜组合冲突时付出费用避让，且报告费用与偏移', () => {
    // C1=1000, C2 首选 1005（间隔 5 < 10）必须避让到 2000（费用 8）
    const model: PlanModel = {
      guardBand: 10,
      carriers: [
        {
          id: 'C1',
          preferredFreq: 1000,
          candidates: [
            { no: 1, freq: 1000, cost: 0 },
            { no: 2, freq: 3000, cost: 100 },
          ],
        },
        {
          id: 'C2',
          preferredFreq: 1005,
          candidates: [
            { no: 1, freq: 1005, cost: 0 },
            { no: 2, freq: 2000, cost: 8 },
          ],
        },
        {
          id: 'C3',
          preferredFreq: 4000,
          candidates: [
            { no: 1, freq: 4000, cost: 0 },
            { no: 2, freq: 1009, cost: 1 },
          ],
        },
      ],
    };
    const r = solve(model);
    expect(r.status).toBe('feasible');
    expect(r.totalCost).toBe(8);
    const c2 = r.selections.find((s) => s.carrierId === 'C2')!;
    expect(c2.freq).toBe(2000);
    expect(c2.deviation).toBe(995);
    expect(r.maxDeviation).toBe(995);
  });

  it('费用相同时按最大偏移决胜', () => {
    // C1=1000, C3=1300 固定；C2 有两个同费候选 1100（偏移 0）与 1200（偏移 100）
    const model: PlanModel = {
      guardBand: 10,
      carriers: [
        {
          id: 'C1',
          preferredFreq: 1000,
          candidates: [{ no: 1, freq: 1000, cost: 0 }],
        },
        {
          id: 'C2',
          preferredFreq: 1100,
          candidates: [
            { no: 1, freq: 1100, cost: 5 },
            { no: 2, freq: 1200, cost: 5 },
          ],
        },
        {
          id: 'C3',
          preferredFreq: 1300,
          candidates: [{ no: 1, freq: 1300, cost: 0 }],
        },
      ],
    };
    const r = solve(model);
    expect(r.selections.find((s) => s.carrierId === 'C2')!.freq).toBe(1100);
  });

  it('费用与最大偏移都相同时按频点序列字典序决胜', () => {
    // C1 首选恰在两候选正中 1050，偏移都是 50；费用相同 -> 取较小频点 1000。
    // C2=2000、C3=3200 间距拉开，使两种 C1 选择均不触发互调。
    const model: PlanModel = {
      guardBand: 10,
      carriers: [
        {
          id: 'C1',
          preferredFreq: 1050,
          candidates: [
            { no: 1, freq: 1100, cost: 2 },
            { no: 2, freq: 1000, cost: 2 },
          ],
        },
        {
          id: 'C2',
          preferredFreq: 2000,
          candidates: [{ no: 1, freq: 2000, cost: 0 }],
        },
        {
          id: 'C3',
          preferredFreq: 3200,
          candidates: [{ no: 1, freq: 3200, cost: 0 }],
        },
      ],
    };
    const r = solve(model);
    expect(r.selections.find((s) => s.carrierId === 'C1')!.freq).toBe(1000);
  });

  it('无可行组合时返回 infeasible 并给出诊断三元组', () => {
    // 三载波各只有同频候选，必冲突
    const model: PlanModel = {
      guardBand: 10,
      carriers: [
        { id: 'C1', preferredFreq: 1000, candidates: [{ no: 1, freq: 1000, cost: 0 }] },
        { id: 'C2', preferredFreq: 1000, candidates: [{ no: 1, freq: 1000, cost: 0 }] },
        { id: 'C3', preferredFreq: 1000, candidates: [{ no: 1, freq: 1000, cost: 0 }] },
      ],
    };
    const r = solve(model);
    expect(r.status).toBe('infeasible');
    expect(r.diagnosis && r.diagnosis.length).toBeGreaterThan(0);
    expect(r.feasibleLeavesVisited).toBe(0);
  });

  it('编号按数值感知排序：C2 在 C10 之前', () => {
    expect(['C10', 'C2', 'C1'].sort(compareCarrierId)).toEqual(['C1', 'C2', 'C10']);
  });
});

describe('solve - 安全整数边界的高频频点（精确整数语义）', () => {
  // Number.MAX_SAFE_INTEGER = 2^53 - 1：频点本身合法，但 2*fi 已超出双精度精确范围
  const N = Number.MAX_SAFE_INTEGER; // 9007199254740991

  it('互调产物越出安全整数范围时，距离恰等于保护间隔仍合法（不错误舍弃）', () => {
    // 2*(N-2) - (N-6) = N+2，与 C=N 的距离恰为 2 = 保护间隔
    const sel = [
      { id: 'A', freq: N - 2 },
      { id: 'B', freq: N - 6 },
      { id: 'C', freq: N },
    ];
    expect(findViolations(sel, 2)).toHaveLength(0);
    // 增量检查与全量检查结论一致
    expect(checkIncremental(sel.slice(0, 2), sel[2], 2)).toBe(true);
  });

  it('互调距离比保护间隔小 1 kHz 时判定碰撞并给出精确产物与距离', () => {
    // 2*(N-2) - (N-5) = N+1，与 C=N 的距离为 1 < 2
    const sel = [
      { id: 'A', freq: N - 2 },
      { id: 'B', freq: N - 5 },
      { id: 'C', freq: N },
    ];
    const im3 = findViolations(sel, 2).filter((v) => v.kind === 'im3');
    const hit = im3.find((v) => v.i === 'A' && v.j === 'B' && v.k === 'C');
    expect(hit).toBeDefined();
    // N+1 超出安全整数范围，以精确十进制字符串呈现
    expect(hit && 'product' in hit && hit.product).toBe('9007199254740992');
    expect(hit && 'distance' in hit && hit.distance).toBe(1);
  });

  it('裕量核对：越界互调产物以精确值呈现，贴边裕量为 0', () => {
    const sel = [
      { id: 'A', freq: N - 2 },
      { id: 'B', freq: N - 6 },
      { id: 'C', freq: N },
    ];
    const margins = computeMargins(sel, 2);
    const c = margins.find((m) => m.carrierId === 'C')!;
    // 最近互调威胁：2A-B = N+2 = 9007199254740993，距离恰为 2
    expect(c.im3Nearest?.product).toBe('9007199254740993');
    expect(c.im3Nearest?.distance).toBe(2);
    expect(c.im3Nearest?.margin).toBe(0);
    expect(c.worstMargin).toBe(0);
  });

  it('高频模型：费用为 0 的首选组合是最优解且不被误舍弃', () => {
    // 验收模型：A、B 首选组合的三阶互调产物 N+2 与 C 首选频点距离恰为保护间隔
    const model: PlanModel = {
      guardBand: 2,
      carriers: [
        {
          id: 'A',
          preferredFreq: N - 2,
          candidates: [
            { no: 1, freq: N - 2, cost: 0 },
            { no: 2, freq: N - 100, cost: 100 },
          ],
        },
        {
          id: 'B',
          preferredFreq: N - 6,
          candidates: [
            { no: 1, freq: N - 6, cost: 0 },
            { no: 2, freq: N - 200, cost: 100 },
          ],
        },
        {
          id: 'C',
          preferredFreq: N,
          candidates: [
            { no: 1, freq: N, cost: 0 },
            { no: 2, freq: N - 300, cost: 100 },
          ],
        },
      ],
    };
    const r = solve(model);
    expect(r.status).toBe('feasible');
    expect(r.totalCost).toBe(0);
    expect(r.maxDeviation).toBe(0);
    expect(r.frequencySequence).toEqual([
      { carrierId: 'A', freq: N - 2 },
      { carrierId: 'B', freq: N - 6 },
      { carrierId: 'C', freq: N },
    ]);
    // 返回解自身零碰撞，且 C 的最近互调威胁为精确产物 N+2、距离恰为 2
    const sel = r.frequencySequence.map((s) => ({ id: s.carrierId, freq: s.freq }));
    expect(findViolations(sel, 2)).toHaveLength(0);
    const c = r.selections.find((s) => s.carrierId === 'C')!;
    expect(c.margin.im3Nearest?.product).toBe('9007199254740993');
    expect(c.margin.im3Nearest?.distance).toBe(2);
  });
});

describe('solve - 与暴力枚举随机对照（完备性）', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rand = mulberry32(seed);
    const n = 3 + Math.floor(rand() * 4); // 3~6 个载波
    const guard = 1 + Math.floor(rand() * 4) * 10; // 10/20/30/40
    const carriers = Array.from({ length: n }, (_, ci) => {
      const nc = 2 + Math.floor(rand() * 3); // 2~4 候选
      const freqs = new Set<number>();
      while (freqs.size < nc) {
        // 频点聚集在 1000~1300 以制造冲突
        freqs.add(1000 + Math.floor(rand() * 31) * 10);
      }
      const freqArr = [...freqs];
      const preferred = freqArr[Math.floor(rand() * freqArr.length)];
      return {
        id: `C${ci + 1}`,
        preferredFreq: preferred,
        candidates: freqArr.map((f, i) => ({ no: i + 1, freq: f, cost: Math.floor(rand() * 6) * 5 })),
      };
    });
    const model: PlanModel = { guardBand: guard, carriers };

    const r = solve(model);
    const ref = bruteForce(model);

    it(`seed=${seed} n=${n} guard=${guard}`, () => {
      expect(r.totalCombinations).toBe(ref.total);
      if (ref.best === null) {
        expect(r.status).toBe('infeasible');
      } else {
        expect(r.status).toBe('feasible');
        expect(r.totalCost).toBe(ref.best.cost);
        expect(r.maxDeviation).toBe(ref.best.maxDev);
        expect(r.frequencySequence.map((s) => s.freq)).toEqual(ref.best.freqs);
        // 可行解本身必须零碰撞
        const sel = r.frequencySequence.map((s) => ({ id: s.carrierId, freq: s.freq }));
        expect(findViolations(sel, guard)).toHaveLength(0);
        // 每项裕量非负
        for (const d of r.selections) expect(d.margin.worstMargin).toBeGreaterThanOrEqual(0);
        // 注：分支限界会剪去不可能更优的分支，故不要求访问全部可行叶
      }
    });
  }
});

describe('solve - 安全整数边界高频模型与暴力枚举对照', () => {
  const N = Number.MAX_SAFE_INTEGER;
  for (let seed = 1; seed <= 40; seed++) {
    const rand = mulberry32(seed + 1_000_000);
    const n = 3 + Math.floor(rand() * 4); // 3~6 个载波
    const guard = 2 * (1 + Math.floor(rand() * 3)); // 2/4/6
    const carriers = Array.from({ length: n }, (_, ci) => {
      const nc = 2 + Math.floor(rand() * 3); // 2~4 候选
      const freqs = new Set<number>();
      while (freqs.size < nc) {
        // 频点聚集在 N-78..N：频点本身是安全整数，但互调产物频繁越过安全边界
        freqs.add(N - Math.floor(rand() * 40) * 2);
      }
      const freqArr = [...freqs];
      const preferred = freqArr[Math.floor(rand() * freqArr.length)];
      return {
        id: `C${ci + 1}`,
        preferredFreq: preferred,
        candidates: freqArr.map((f, i) => ({ no: i + 1, freq: f, cost: Math.floor(rand() * 6) * 5 })),
      };
    });
    const model: PlanModel = { guardBand: guard, carriers };

    const r = solve(model);
    const ref = bruteForce(model);

    it(`seed=${seed} n=${n} guard=${guard}`, () => {
      expect(r.totalCombinations).toBe(ref.total);
      if (ref.best === null) {
        expect(r.status).toBe('infeasible');
      } else {
        expect(r.status).toBe('feasible');
        expect(r.totalCost).toBe(ref.best.cost);
        expect(r.maxDeviation).toBe(ref.best.maxDev);
        expect(r.frequencySequence.map((s) => s.freq)).toEqual(ref.best.freqs);
        // 可行解本身必须零碰撞（精确整数判定）
        const sel = r.frequencySequence.map((s) => ({ id: s.carrierId, freq: s.freq }));
        expect(findViolations(sel, guard)).toHaveLength(0);
        // 每项裕量非负（越界时以精确字符串承载，统一转 BigInt 比较）
        for (const d of r.selections) expect(BigInt(d.margin.worstMargin) >= 0n).toBe(true);
      }
    });
  }
});
