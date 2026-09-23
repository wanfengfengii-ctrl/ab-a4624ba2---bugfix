import { describe, expect, it } from 'vitest';
import { modelToDraft, parseImport, validateModel } from './validation';
import type { PlanModel } from './types';

const validDraft = () => ({
  guardBand: '50',
  carriers: [
    {
      id: 'C1',
      preferredFreq: '1000',
      candidates: [
        { no: 1, freq: '1000', cost: '0' },
        { no: 2, freq: '1100', cost: '10' },
      ],
    },
    {
      id: 'C2',
      preferredFreq: '2000',
      candidates: [
        { no: 1, freq: '2000', cost: '0' },
        { no: 2, freq: '2100', cost: '5' },
      ],
    },
    {
      id: 'C3',
      preferredFreq: '3000',
      candidates: [
        { no: 1, freq: '3000', cost: '0' },
        { no: 2, freq: '3100', cost: '7' },
      ],
    },
  ],
});

describe('validateModel', () => {
  it('合法草稿通过校验', () => {
    const { model, errors } = validateModel(validDraft());
    expect(errors).toHaveLength(0);
    expect(model?.guardBand).toBe(50);
    expect(model?.carriers).toHaveLength(3);
  });

  it('保护间隔必须为正整数', () => {
    const d = validDraft();
    d.guardBand = '0';
    expect(validateModel(d).errors.some((e) => e.path === 'guardBand')).toBe(true);
    d.guardBand = 'abc';
    expect(validateModel(d).errors.some((e) => e.path === 'guardBand')).toBe(true);
    d.guardBand = '12.5';
    expect(validateModel(d).errors.some((e) => e.path === 'guardBand')).toBe(true);
  });

  it('载波数量必须 3~10', () => {
    const d = validDraft();
    d.carriers.pop();
    let r = validateModel(d);
    expect(r.errors.some((e) => e.path === 'carriers')).toBe(true);
    expect(r.model).toBeNull();
  });

  it('载波编号唯一、非空', () => {
    const d = validDraft();
    d.carriers[2].id = 'C1';
    const { errors } = validateModel(d);
    expect(errors.some((e) => e.message.includes('重复'))).toBe(true);
    d.carriers[2].id = '   ';
    expect(validateModel(d).errors.some((e) => e.path.endsWith('.id'))).toBe(true);
  });

  it('候选 2~6 个、编号与频率在载波内唯一', () => {
    const d = validDraft();
    d.carriers[0].candidates = [d.carriers[0].candidates[0]];
    expect(validateModel(d).errors.some((e) => e.path.includes('candidates'))).toBe(true);

    const d2 = validDraft();
    d2.carriers[0].candidates[1].no = 1;
    expect(validateModel(d2).errors.some((e) => e.message.includes('编号 1'))).toBe(true);

    const d3 = validDraft();
    d3.carriers[0].candidates[1].freq = '1000';
    expect(validateModel(d3).errors.some((e) => e.message.includes('频点 1000'))).toBe(true);
  });

  it('频点必须为正整数、费用非负', () => {
    const d = validDraft();
    d.carriers[0].candidates[0].freq = '-5';
    expect(validateModel(d).errors.some((e) => e.path.endsWith('.freq'))).toBe(true);
    const d2 = validDraft();
    d2.carriers[0].candidates[0].cost = '-1';
    expect(validateModel(d2).errors.some((e) => e.path.endsWith('.cost'))).toBe(true);
    const d3 = validDraft();
    d3.carriers[0].candidates[0].cost = 'abc';
    expect(validateModel(d3).errors.some((e) => e.path.endsWith('.cost'))).toBe(true);
  });

  it('首选频点必须在候选列表中', () => {
    const d = validDraft();
    d.carriers[0].preferredFreq = '9999';
    const { errors } = validateModel(d);
    expect(errors.some((e) => e.path.endsWith('.preferredFreq'))).toBe(true);
  });

  it('一次性收集所有错误', () => {
    const d = validDraft();
    d.guardBand = '0';
    d.carriers[0].candidates[0].freq = 'x';
    d.carriers[1].candidates[0].cost = '-2';
    const { errors, model } = validateModel(d);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(model).toBeNull();
  });

  it('modelToDraft 往返不丢数据', () => {
    const { model } = validateModel(validDraft());
    expect(model).not.toBeNull();
    const again = validateModel(modelToDraft(model as PlanModel));
    expect(again.errors).toHaveLength(0);
    expect(again.model).toEqual(model);
  });
});

describe('parseImport', () => {
  it('解析合法 JSON 模型', () => {
    const { model } = validateModel(validDraft());
    const r = parseImport(JSON.stringify(model));
    expect(r.errors).toHaveLength(0);
    expect(r.draft).not.toBeNull();
    expect(validateModel(r.draft!).errors).toHaveLength(0);
  });

  it('非法 JSON 明确报错', () => {
    const r = parseImport('{not json');
    expect(r.draft).toBeNull();
    expect(r.errors[0]).toContain('JSON');
  });

  it('结构错误逐项指出', () => {
    const r = parseImport(
      JSON.stringify({
        guardBand: '50',
        carriers: [{ id: 1, preferredFreq: 'x', candidates: [{ no: 'a' }] }],
      }),
    );
    expect(r.errors.length).toBeGreaterThan(3);
  });

  it('carriers 不是数组时报错', () => {
    const r = parseImport(JSON.stringify({ guardBand: 50, carriers: {} }));
    expect(r.draft).toBeNull();
    expect(r.errors.some((e) => e.includes('carriers'))).toBe(true);
  });
});
