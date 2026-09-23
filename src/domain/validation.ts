import type { Candidate, Carrier, PlanModel } from './types';

/** 编辑器草稿：所有数值字段以原始字符串保存，便于逐项反馈输入错误 */
export interface DraftCandidate {
  no: number;
  freq: string;
  cost: string;
}
export interface DraftCarrier {
  id: string;
  preferredFreq: string;
  candidates: DraftCandidate[];
}
export interface DraftModel {
  guardBand: string;
  carriers: DraftCarrier[];
}

export interface FieldError {
  /** 例如 carriers[1].candidates[0].freq / guardBand / carriers[2].preferredFreq */
  path: string;
  message: string;
}

const INTEGER_RE = /^[+-]?\d+$/;

function parseInteger(raw: string): { ok: true; value: number } | { ok: false } {
  const t = raw.trim();
  if (!INTEGER_RE.test(t)) return { ok: false };
  const value = Number(t);
  if (!Number.isSafeInteger(value)) return { ok: false };
  return { ok: true, value };
}

function parseNonNegativeCost(raw: string): { ok: true; value: number } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: false };
  const value = Number(t);
  if (!Number.isFinite(value) || value < 0) return { ok: false };
  return { ok: true, value };
}

/** 校验整个草稿，收集全部字段错误；无错误时返回可用的数值模型 */
export function validateModel(draft: DraftModel): { model: PlanModel | null; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const carriers: Carrier[] = [];

  const guardParsed = parseInteger(draft.guardBand);
  if (!guardParsed.ok || guardParsed.value < 1) {
    errors.push({ path: 'guardBand', message: '保护间隔必须为正整数 kHz（≥ 1）' });
  }

  if (draft.carriers.length < 3 || draft.carriers.length > 10) {
    errors.push({
      path: 'carriers',
      message: `载波数量必须在 3 至 10 个之间（当前 ${draft.carriers.length} 个）`,
    });
  }

  const seenIds = new Map<string, number>();
  draft.carriers.forEach((dc, ci) => {
    const id = dc.id.trim();
    const cPath = `carriers[${ci}]`;

    if (id === '') {
      errors.push({ path: `${cPath}.id`, message: '载波编号不能为空' });
    } else if (seenIds.has(id)) {
      errors.push({
        path: `${cPath}.id`,
        message: `载波编号「${id}」与第 ${seenIds.get(id)! + 1} 个载波重复，编号必须唯一`,
      });
    } else {
      seenIds.set(id, ci);
    }

    if (dc.candidates.length < 2 || dc.candidates.length > 6) {
      errors.push({
        path: `${cPath}.candidates`,
        message: `载波「${id || ci + 1}」候选频点必须为 2 至 6 个（当前 ${dc.candidates.length} 个）`,
      });
    }

    const candidates: Candidate[] = [];
    const seenNo = new Map<number, number>();
    const seenFreq = new Map<number, number>();
    let preferredFreq: number | null = null;

    dc.candidates.forEach((dca, ai) => {
      const aPath = `${cPath}.candidates[${ai}]`;

      if (!Number.isInteger(dca.no) || dca.no < 1) {
        errors.push({ path: `${aPath}.no`, message: '候选编号必须为正整数' });
      } else if (seenNo.has(dca.no)) {
        errors.push({
          path: `${aPath}.no`,
          message: `候选编号 ${dca.no} 在本载波内重复`,
        });
      } else {
        seenNo.set(dca.no, ai);
      }

      const fp = parseInteger(dca.freq);
      if (!fp.ok || fp.value <= 0) {
        errors.push({ path: `${aPath}.freq`, message: '候选频点必须为正整数 kHz' });
      } else if (seenFreq.has(fp.value)) {
        errors.push({
          path: `${aPath}.freq`,
          message: `候选频点 ${fp.value} kHz 在载波「${id || ci + 1}」内重复，频点必须唯一`,
        });
      } else {
        seenFreq.set(fp.value, ai);
      }

      const cp = parseNonNegativeCost(dca.cost);
      if (!cp.ok) {
        errors.push({ path: `${aPath}.cost`, message: '改频费用必须为非负有限数值' });
      }

      if (fp.ok && cp.ok && Number.isInteger(dca.no) && dca.no >= 1) {
        candidates.push({ no: dca.no, freq: fp.value, cost: cp.value });
      }
    });

    const pp = parseInteger(dc.preferredFreq);
    if (!pp.ok || pp.value <= 0) {
      errors.push({ path: `${cPath}.preferredFreq`, message: '首选频点必须为正整数 kHz' });
    } else if (!seenFreq.has(pp.value)) {
      errors.push({
        path: `${cPath}.preferredFreq`,
        message: `首选频点 ${pp.value} kHz 不在载波「${id || ci + 1}」的候选频点列表中`,
      });
    } else {
      preferredFreq = pp.value;
    }

    // 候选可能因字段非法被跳过；只有结构与字段全部有效时才构造载波
    if (id !== '' && preferredFreq !== null && candidates.length === dc.candidates.length) {
      carriers.push({ id, preferredFreq, candidates });
    }
  });

  if (errors.length > 0) return { model: null, errors };
  return {
    model: { guardBand: guardParsed.ok ? guardParsed.value : 0, carriers },
    errors: [],
  };
}

/** 由数值模型生成编辑草稿 */
export function modelToDraft(model: PlanModel): DraftModel {
  return {
    guardBand: String(model.guardBand),
    carriers: model.carriers.map((c) => ({
      id: c.id,
      preferredFreq: String(c.preferredFreq),
      candidates: c.candidates.map((a) => ({
        no: a.no,
        freq: String(a.freq),
        cost: String(a.cost),
      })),
    })),
  };
}

export interface ImportResult {
  draft: DraftModel | null;
  errors: string[];
}

/**
 * 解析导入 JSON。结构层错误（非 JSON、类型不符）在此给出明确信息；
 * 业务层错误交给 validateModel 统一检查。
 */
export function parseImport(text: string): ImportResult {
  const errors: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { draft: null, errors: [`文件不是合法 JSON：${(e as Error).message}`] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { draft: null, errors: ['顶层结构必须是对象 { guardBand, carriers }'] };
  }
  const root = data as Record<string, unknown>;

  if (typeof root.guardBand !== 'number' || !Number.isInteger(root.guardBand)) {
    errors.push('guardBand 必须为整数（kHz）');
  }

  const draft: DraftModel = {
    guardBand: String(root.guardBand ?? ''),
    carriers: [],
  };

  if (!Array.isArray(root.carriers)) {
    errors.push('carriers 必须是数组');
    return { draft: null, errors };
  }

  root.carriers.forEach((rawC, ci) => {
    const fallback: DraftCarrier = { id: '', preferredFreq: '', candidates: [] };
    if (typeof rawC !== 'object' || rawC === null || Array.isArray(rawC)) {
      errors.push(`第 ${ci + 1} 个载波必须是对象`);
      draft.carriers.push(fallback);
      return;
    }
    const c = rawC as Record<string, unknown>;
    const dc: DraftCarrier = {
      id: typeof c.id === 'string' ? c.id : '',
      preferredFreq:
        typeof c.preferredFreq === 'number' ? String(c.preferredFreq) : '',
      candidates: [],
    };
    if (typeof c.id !== 'string') errors.push(`第 ${ci + 1} 个载波的 id 必须为字符串`);
    if (typeof c.preferredFreq !== 'number') {
      errors.push(`载波「${dc.id || ci + 1}」的 preferredFreq 必须为数值频点`);
    }
    if (!Array.isArray(c.candidates)) {
      errors.push(`载波「${dc.id || ci + 1}」的 candidates 必须是数组`);
    } else {
      c.candidates.forEach((rawA, ai) => {
        if (typeof rawA !== 'object' || rawA === null || Array.isArray(rawA)) {
          errors.push(`载波「${dc.id || ci + 1}」第 ${ai + 1} 个候选必须是对象`);
          dc.candidates.push({ no: NaN, freq: '', cost: '' });
          return;
        }
        const a = rawA as Record<string, unknown>;
        if (typeof a.no !== 'number' || !Number.isInteger(a.no)) {
          errors.push(`载波「${dc.id || ci + 1}」第 ${ai + 1} 个候选的 no 必须为整数`);
        }
        if (typeof a.freq !== 'number' || !Number.isInteger(a.freq)) {
          errors.push(`载波「${dc.id || ci + 1}」第 ${ai + 1} 个候选的 freq 必须为整数 kHz`);
        }
        if (typeof a.cost !== 'number' || !Number.isFinite(a.cost)) {
          errors.push(`载波「${dc.id || ci + 1}」第 ${ai + 1} 个候选的 cost 必须为数值`);
        }
        dc.candidates.push({
          no: typeof a.no === 'number' ? a.no : NaN,
          freq: typeof a.freq === 'number' ? String(a.freq) : '',
          cost: typeof a.cost === 'number' ? String(a.cost) : '',
        });
      });
    }
    draft.carriers.push(dc);
  });

  if (errors.length > 0) return { draft: null, errors };
  return { draft, errors: [] };
}

/** 导出为格式化 JSON */
export function exportModel(model: PlanModel): string {
  return JSON.stringify(model, null, 2);
}
