import { bigIntToDisplay, freqDistance, im3Product, productDistance } from './bigintMath';
import type { CarrierMargin, Violation } from './types';

export interface SelectedCarrier {
  id: string;
  freq: number;
}

/**
 * 检查一条完整分配的全部碰撞。
 *
 * 约束一：任意两条已选载波 |fa - fb| >= guard。
 * 约束二：对任意不同载波 i、j，三阶互调产物 2*fi - fj 与任意第三载波
 *        （k 不同于 i、j）的距离必须 >= guard。
 *        i、j 顺序不同产物不同（2fi-fj 与 2fj-fi），两种方向都检查。
 *
 * 频点为安全整数，但互调产物 2*fi - fj 可能超出安全整数范围；全部距离与
 * 比较均在 BigInt 精确整数上完成，距离恰等于保护间隔（= guard）合法。
 */
export function findViolations(selected: SelectedCarrier[], guard: number): Violation[] {
  const violations: Violation[] = [];
  const n = selected.length;
  const guardB = BigInt(guard);

  // 约束一：载波对间隔
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const A = selected[a];
      const B = selected[b];
      // 两安全整数频点之差仍是安全整数，可直接转回 number
      const distance = freqDistance(A.freq, B.freq);
      if (distance < guardB) {
        violations.push({
          kind: 'spacing',
          carrierA: A.id,
          carrierB: B.id,
          freqA: A.freq,
          freqB: B.freq,
          distance: Number(distance),
          guard,
        });
      }
    }
  }

  // 约束二：2fi - fj 落入第三载波 k 的保护区
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const I = selected[i];
      const J = selected[j];
      const product = im3Product(I.freq, J.freq);
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const K = selected[k];
        const distance = productDistance(product, K.freq);
        if (distance < guardB) {
          violations.push({
            kind: 'im3',
            i: I.id,
            j: J.id,
            k: K.id,
            fi: I.freq,
            fj: J.freq,
            fk: K.freq,
            product: bigIntToDisplay(product),
            distance: bigIntToDisplay(distance),
            guard,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * 增量检查：在已选载波列表后追加一个新载波 newOne 后是否可行。
 * 只需检查涉及新载波的载波对与互调关系，搜索剪枝用。
 * 互调中“新载波”可能扮演 i、j、k 任一角色，全部覆盖：
 *  - 新载波为 i：2*fnew - fj 与旧载波 k
 *  - 新载波为 j：2*fi - fnew 与旧载波 k
 *  - 新载波为 k：2*fi - fj 与新载波
 *  - i、j 均为旧载波而 k 也为旧载波的情形此前已检查
 *
 * 与 findViolations 相同的精确整数语义：距离 < guard 才算碰撞。
 */
export function checkIncremental(
  existing: SelectedCarrier[],
  newOne: SelectedCarrier,
  guard: number,
): boolean {
  const guardB = BigInt(guard);

  for (const old of existing) {
    if (freqDistance(old.freq, newOne.freq) < guardB) return false;
  }

  // 新载波作为 i（含 j 为旧载波、k 为旧载波；以及 j 为旧载波、k 新自身不可能）
  for (const J of existing) {
    const p1 = im3Product(newOne.freq, J.freq);
    for (const K of existing) {
      if (K.id === J.id) continue;
      if (productDistance(p1, K.freq) < guardB) return false;
    }
  }
  // 新载波作为 j
  for (const I of existing) {
    const p2 = im3Product(I.freq, newOne.freq);
    for (const K of existing) {
      if (K.id === I.id) continue;
      if (productDistance(p2, K.freq) < guardB) return false;
    }
  }
  // 新载波作为 k：i、j 必须互不相同
  for (let a = 0; a < existing.length; a++) {
    for (let b = 0; b < existing.length; b++) {
      if (a === b) continue;
      const product = im3Product(existing[a].freq, existing[b].freq);
      if (productDistance(product, newOne.freq) < guardB) return false;
    }
  }

  return true;
}

/** 为每个已选载波计算最近威胁与最小冲突裕量（核对展示用，精确整数计算） */
export function computeMargins(selected: SelectedCarrier[], guard: number): CarrierMargin[] {
  const n = selected.length;
  const guardB = BigInt(guard);

  return selected.map((S, idxS) => {
    let spacingNearest: { otherId: string; otherFreq: number; distance: bigint } | null = null;
    for (let b = 0; b < n; b++) {
      if (b === idxS) continue;
      const O = selected[b];
      const distance = freqDistance(S.freq, O.freq);
      if (!spacingNearest || distance < spacingNearest.distance) {
        spacingNearest = { otherId: O.id, otherFreq: O.freq, distance };
      }
    }

    let im3Nearest: { i: string; j: string; product: bigint; distance: bigint } | null = null;
    // S 作为第三载波 k：任意不同的 i、j
    for (let i = 0; i < n; i++) {
      if (i === idxS) continue;
      for (let j = 0; j < n; j++) {
        if (j === idxS || j === i) continue;
        const product = im3Product(selected[i].freq, selected[j].freq);
        const distance = productDistance(product, S.freq);
        if (!im3Nearest || distance < im3Nearest.distance) {
          im3Nearest = { i: selected[i].id, j: selected[j].id, product, distance };
        }
      }
    }

    // 裕量 = 实际距离 - 保护间隔；在 BigInt 上取最小后再转展示值
    const margins: bigint[] = [];
    if (spacingNearest) margins.push(spacingNearest.distance - guardB);
    if (im3Nearest) margins.push(im3Nearest.distance - guardB);
    let worst: bigint | null = null;
    for (const m of margins) {
      if (worst === null || m < worst) worst = m;
    }

    return {
      carrierId: S.id,
      freq: S.freq,
      spacingNearest: spacingNearest && {
        otherId: spacingNearest.otherId,
        otherFreq: spacingNearest.otherFreq,
        // 两安全整数频点之差仍是安全整数
        distance: Number(spacingNearest.distance),
        margin: Number(spacingNearest.distance) - guard,
      },
      im3Nearest: im3Nearest && {
        i: im3Nearest.i,
        j: im3Nearest.j,
        product: bigIntToDisplay(im3Nearest.product),
        distance: bigIntToDisplay(im3Nearest.distance),
        margin: bigIntToDisplay(im3Nearest.distance - guardB),
      },
      // 模型要求至少 3 个载波；单载波时无威胁，裕量视为无限
      worstMargin: worst === null ? Number.POSITIVE_INFINITY : bigIntToDisplay(worst),
    };
  });
}
