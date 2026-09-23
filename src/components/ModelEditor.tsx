import { useRef } from 'react';
import type { FieldError, DraftModel } from '../domain/validation';
import { exportModel, parseImport } from '../domain/validation';
import type { PlanModel } from '../domain/types';
import { LARGE_SAMPLE_MODEL, SAMPLE_MODEL } from '../domain/sample';

interface Props {
  draft: DraftModel;
  errors: FieldError[];
  /** 草稿每次变化立即通知，结果面板会同步撤下旧结论 */
  onChange: (next: DraftModel) => void;
  onImportErrors: (messages: string[]) => void;
  onLoadModel: (model: PlanModel) => void;
}

export function ModelEditor({ draft, errors, onChange, onImportErrors, onLoadModel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const errorMap = new Map<string, string>();
  for (const e of errors) {
    if (!errorMap.has(e.path)) errorMap.set(e.path, e.message);
  }
  const err = (path: string) => errorMap.get(path);
  const cls = (path: string) => 'input' + (err(path) ? ' input-bad' : '');

  const update = (mut: (d: DraftModel) => void) => {
    const next: DraftModel = structuredClone(draft);
    mut(next);
    onChange(next);
  };

  const handleImportText = (text: string) => {
    const r = parseImport(text);
    if (r.errors.length > 0 || !r.draft) {
      onImportErrors(r.errors.length ? r.errors : ['导入失败：无法解析模型']);
      return;
    }
    onImportErrors([]);
    onChange(r.draft);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => handleImportText(String(reader.result ?? ''));
    reader.onerror = () => onImportErrors([`读取文件失败：${file.name}`]);
    reader.readAsText(file);
  };

  const handleExport = () => {
    // 直接导出当前草稿对应的数值（仅在无错误时按钮可用，此处再保险解析一次）
    const text = exportModel(currentModelFromDraft(draft));
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const nextCandidateNo = (candidateNos: number[]) =>
    candidateNos.reduce((m, x) => Math.max(m, x), 0) + 1;

  return (
    <section className="panel editor">
      <h2>① 模型编辑</h2>

      <div className="guard-row">
        <label>
          保护间隔（kHz，正整数）：
          <input
            className={cls('guardBand')}
            type="number"
            min={1}
            step={1}
            value={draft.guardBand}
            onChange={(e) => update((d) => void (d.guardBand = e.target.value))}
          />
        </label>
        {err('guardBand') && <span className="field-error">{err('guardBand')}</span>}
      </div>

      {err('carriers') && <div className="field-error">{err('carriers')}</div>}

      <div className="carriers">
        {draft.carriers.map((c, ci) => {
          const cErr = err(`carriers[${ci}].candidates`);
          return (
            <fieldset
              className="carrier"
              key={ci}
              data-invalid={
                err(`carriers[${ci}].id`) ||
                err(`carriers[${ci}].preferredFreq`) ||
                cErr
                  ? 'true'
                  : undefined
              }
            >
              <legend>载波 {ci + 1}</legend>
              <div className="carrier-head">
                <label>
                  编号
                  <input
                    className={cls(`carriers[${ci}].id`)}
                    value={c.id}
                    placeholder="如 C1"
                    onChange={(e) => update((d) => void (d.carriers[ci].id = e.target.value))}
                  />
                </label>
                <label>
                  首选频点 kHz
                  <input
                    className={cls(`carriers[${ci}].preferredFreq`)}
                    type="number"
                    value={c.preferredFreq}
                    onChange={(e) =>
                      update((d) => void (d.carriers[ci].preferredFreq = e.target.value))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={draft.carriers.length <= 3}
                  title={draft.carriers.length <= 3 ? '至少保留 3 个载波' : '删除载波'}
                  onClick={() =>
                    update((d) => {
                      d.carriers.splice(ci, 1);
                    })
                  }
                >
                  删除载波
                </button>
              </div>
              {err(`carriers[${ci}].id`) && (
                <div className="field-error">{err(`carriers[${ci}].id`)}</div>
              )}
              {err(`carriers[${ci}].preferredFreq`) && (
                <div className="field-error">{err(`carriers[${ci}].preferredFreq`)}</div>
              )}

              <table className="cand-table">
                <thead>
                  <tr>
                    <th>候选编号</th>
                    <th>频点 kHz（整数）</th>
                    <th>改频费用（≥0）</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {c.candidates.map((a, ai) => {
                    const base = `carriers[${ci}].candidates[${ai}]`;
                    return (
                      <tr key={ai} data-invalid={errorMap.has(`${base}.freq`) || errorMap.has(`${base}.cost`) || errorMap.has(`${base}.no`) ? 'true' : undefined}>
                        <td>
                          <input
                            className={cls(`${base}.no`)}
                            type="number"
                            min={1}
                            step={1}
                            value={Number.isNaN(a.no) ? '' : a.no}
                            onChange={(e) =>
                              update((d) => {
                                const v = e.target.value;
                                d.carriers[ci].candidates[ai].no = v === '' ? NaN : Number(v);
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className={cls(`${base}.freq`)}
                            type="number"
                            value={a.freq}
                            onChange={(e) =>
                              update((d) => void (d.carriers[ci].candidates[ai].freq = e.target.value))
                            }
                          />
                        </td>
                        <td>
                          <input
                            className={cls(`${base}.cost`)}
                            type="number"
                            min={0}
                            value={a.cost}
                            onChange={(e) =>
                              update((d) => void (d.carriers[ci].candidates[ai].cost = e.target.value))
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-danger btn-small"
                            disabled={c.candidates.length <= 2}
                            title={c.candidates.length <= 2 ? '至少保留 2 个候选' : '删除候选'}
                            onClick={() =>
                              update((d) => {
                                d.carriers[ci].candidates.splice(ai, 1);
                              })
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {cErr && <div className="field-error">{cErr}</div>}
              {c.candidates.map((_, ai) => {
                const base = `carriers[${ci}].candidates[${ai}]`;
                const parts = ['.no', '.freq', '.cost']
                  .map((suffix) => errorMap.get(base + suffix))
                  .filter((m): m is string => Boolean(m));
                return parts.length ? (
                  <div key={ai} className="field-error field-error-sub">
                    候选 {ai + 1}：{parts.join('；')}
                  </div>
                ) : null;
              })}
              <button
                type="button"
                className="btn-small"
                disabled={c.candidates.length >= 6}
                onClick={() =>
                  update((d) => {
                    const list = d.carriers[ci].candidates;
                    list.push({ no: nextCandidateNo(list.map((x) => x.no)), freq: '', cost: '' });
                  })
                }
              >
                + 添加候选（{c.candidates.length}/6）
              </button>
            </fieldset>
          );
        })}
      </div>

      <div className="editor-actions">
        <button
          type="button"
          disabled={draft.carriers.length >= 10}
          onClick={() =>
            update((d) => {
              const n = d.carriers.length + 1;
              d.carriers.push({
                id: `C${n}`,
                preferredFreq: '',
                candidates: [
                  { no: 1, freq: '', cost: '' },
                  { no: 2, freq: '', cost: '' },
                ],
              });
            })
          }
        >
          + 添加载波（{draft.carriers.length}/10）
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          导入 JSON 文件
        </button>
        <button
          type="button"
          onClick={() => {
            const text = window.prompt('粘贴模型 JSON：');
            if (text !== null) handleImportText(text);
          }}
        >
          粘贴 JSON
        </button>
        <button type="button" disabled={errors.length > 0} onClick={handleExport}>
          导出 JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="sample-actions">
        <button type="button" className="btn-link" onClick={() => onLoadModel(SAMPLE_MODEL)}>
          载入 3 载波示例
        </button>
        <button type="button" className="btn-link" onClick={() => onLoadModel(LARGE_SAMPLE_MODEL)}>
          载入 5 载波示例
        </button>
      </div>
    </section>
  );
}

/** 由已通过校验的草稿重建数值模型供导出；调用处已保证无错误 */
function currentModelFromDraft(draft: DraftModel): PlanModel {
  return {
    guardBand: Number(draft.guardBand),
    carriers: draft.carriers.map((c) => ({
      id: c.id.trim(),
      preferredFreq: Number(c.preferredFreq),
      candidates: c.candidates.map((a) => ({
        no: Number.isNaN(a.no) ? 0 : a.no,
        freq: Number(a.freq),
        cost: Number(a.cost),
      })),
    })),
  };
}
