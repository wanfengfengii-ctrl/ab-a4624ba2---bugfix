/** 领域模型类型定义 */

/** 候选频点：编号在载波内唯一，频率为整数千赫，费用非负 */
export interface Candidate {
  /** 载波内候选编号（1 起） */
  no: number;
  /** 频点，整数 kHz */
  freq: number;
  /** 选用该候选时的改频费用（非负） */
  cost: number;
}

/** 载波 */
export interface Carrier {
  /** 载波编号，模型内唯一 */
  id: string;
  /** 首选频点（kHz），必须是本载波某个候选频点 */
  preferredFreq: number;
  /** 2~6 个候选频点，载波内频率唯一 */
  candidates: Candidate[];
}

/** 完整规划模型 */
export interface PlanModel {
  /** 保护间隔，正整数 kHz */
  guardBand: number;
  /** 3~10 个唯一载波 */
  carriers: Carrier[];
}

/** 一条完整分配：每个载波选中的候选 */
export interface Assignment {
  /** 与 PlanModel.carriers 对齐的选中候选下标 */
  pick: number[];
}

/** 两类碰撞：载波对间隔不足 / 三阶互调产物 2fi-fj 落入第三载波保护区 */
export type Violation =
  | {
      kind: 'spacing';
      carrierA: string;
      carrierB: string;
      freqA: number;
      freqB: number;
      /** 实际频率距离 |fA-fB|，kHz */
      distance: number;
      guard: number;
    }
  | {
      kind: 'im3';
      /** 产生 2fi-fj 的源载波 i */
      i: string;
      /** 产生 2fi-fj 的源载波 j */
      j: string;
      /** 被落入保护区的第三载波 k */
      k: string;
      fi: number;
      fj: number;
      fk: number;
      /** 互调产物频率 2fi-fj，kHz */
      product: number;
      /** 产物与第三载波的实际频率距离 |2fi-fj-fk|，kHz */
      distance: number;
      guard: number;
    };

/** 每个已选载波的最小冲突裕量信息 */
export interface CarrierMargin {
  carrierId: string;
  freq: number;
  /** 最近的其他载波威胁 */
  spacingNearest: {
    otherId: string;
    otherFreq: number;
    distance: number;
    /** 距离减去保护间隔；越大越安全，负数表示碰撞 */
    margin: number;
  } | null;
  /** 最近的三阶互调威胁（本载波为第三载波 k） */
  im3Nearest: {
    i: string;
    j: string;
    product: number;
    distance: number;
    margin: number;
  } | null;
  /** 两类威胁中的最小裕量 */
  worstMargin: number;
}

/** 单载波核对项 */
export interface SelectionDetail {
  carrierId: string;
  candidateNo: number;
  freq: number;
  cost: number;
  preferredFreq: number;
  /** |选中频点-首选频点| */
  deviation: number;
  margin: CarrierMargin;
}

export interface SolveResult {
  status: 'feasible' | 'infeasible';
  selections: SelectionDetail[];
  /** 总改频费用 */
  totalCost: number;
  /** 相对首选频点的最大偏移 kHz */
  maxDeviation: number;
  /** 按载波编号排列的选中频点序列 */
  frequencySequence: { carrierId: string; freq: number }[];
  /** 笛卡尔积中的组合总数 */
  totalCombinations: number;
  /** 分支限界实际访问的搜索节点数 */
  nodesVisited: number;
  /** 访问到的可行完整组合数 */
  feasibleLeavesVisited: number;
  durationMs: number;
  /** 无解时，对“逐路最便宜候选”这一组合给出的碰撞诊断（仅供定位参考） */
  diagnosis?: Violation[];
}

/** 数值感知的载波编号排序：C2 排在 C10 之前，纯数字 2 排在 10 之前 */
export function compareCarrierId(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}
