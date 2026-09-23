import { useCallback, useMemo, useRef, useState } from 'react';
import { ModelEditor } from './components/ModelEditor';
import { ResultPanel } from './components/ResultPanel';
import { modelToDraft, validateModel } from './domain/validation';
import type { DraftModel } from './domain/validation';
import type { PlanModel, SolveResult } from './domain/types';
import { SAMPLE_MODEL } from './domain/sample';
import type { SolverWorkerLike } from './workers/solverClient';
import { createSolverWorker } from './workers/solverClient';

interface Calculating {
  revision: number;
}

export default function App({
  createWorker = createSolverWorker,
}: {
  createWorker?: () => SolverWorkerLike;
}) {
  const [draft, setDraft] = useState<DraftModel>(() => modelToDraft(SAMPLE_MODEL));
  const [result, setResult] = useState<SolveResult | null>(null);
  const [validModel, setValidModel] = useState<PlanModel | null>(null);
  const [calculating, setCalculating] = useState<Calculating | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const revisionRef = useRef(0);
  const workerRef = useRef<SolverWorkerLike | null>(null);

  // 输入变化即重新校验（不做计算）；计算只能由按钮显式启动
  const validation = useMemo(() => validateModel(draft), [draft]);

  const invalidateResult = useCallback(() => {
    // 旧结论立即撤下，并令在途 Worker 结果失效
    revisionRef.current += 1;
    setResult(null);
    setCalculating(null);
  }, []);

  const handleDraftChange = useCallback(
    (next: DraftModel) => {
      setDraft(next);
      invalidateResult();
    },
    [invalidateResult],
  );

  const handleLoadModel = useCallback(
    (model: PlanModel) => {
      setDraft(modelToDraft(model));
      setImportErrors([]);
      invalidateResult();
    },
    [invalidateResult],
  );

  const startCompute = useCallback(() => {
    const { model, errors } = validateModel(draft);
    setValidModel(model);
    if (errors.length > 0 || !model) {
      // 全部输入错误已在编辑区逐条标出；计算不启动
      setResult(null);
      setCalculating(null);
      return;
    }

    if (!workerRef.current) {
      workerRef.current = createWorker();
      workerRef.current.onReply = ({ revision, result }) => {
        if (revision !== revisionRef.current) return; // 已被新输入作废
        setResult(result);
        setCalculating(null);
      };
    }

    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setResult(null);
    setCalculating({ revision });
    workerRef.current.post({ revision, model });
  }, [draft, createWorker]);

  const inputErrorCount = validation.errors.length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>多载波卫星测控站改频全局规划工作台</h1>
        <p className="subtitle">
          约束：任意两载波间隔 ≥ 保护间隔；任意不同载波 i、j 的三阶互调产物 2fᵢ−fⱼ
          不得落入第三载波 k 的保护区。规划完整比较可行组合，依次最小化
          <b> 总费用 → 最大首选偏移 → 频点序列</b>。全部计算在浏览器本地完成，数据不外发。
        </p>
      </header>

      <div className="layout">
        <ModelEditor
          draft={draft}
          errors={validation.errors}
          onChange={handleDraftChange}
          onImportErrors={setImportErrors}
          onLoadModel={handleLoadModel}
        />

        <section className="panel compute-panel">
          <h2>② 启动计算</h2>
          <button
            type="button"
            className="btn-primary"
            disabled={inputErrorCount > 0 || calculating !== null}
            onClick={startCompute}
          >
            {calculating ? '计算中…' : '开始全局规划'}
          </button>
          {inputErrorCount > 0 && (
            <div className="banner banner-bad">
              当前有 <b>{inputErrorCount}</b> 项输入错误，请先修正左侧标红字段后再计算。
            </div>
          )}
          {importErrors.length > 0 && (
            <div className="banner banner-bad">
              <b>导入失败：</b>
              <ul className="plain-list">
                {importErrors.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {calculating && <div className="banner banner-info">正在本地穷举比较可行组合…</div>}
          {!calculating && !result && inputErrorCount === 0 && (
            <div className="banner banner-idle">
              模型输入有效（{draft.carriers.length} 个载波，候选组合笛卡尔积{' '}
              {validation.model
                ? validation.model.carriers
                    .reduce((acc, c) => acc * c.candidates.length, 1)
                    .toLocaleString()
                : 0}{' '}
              个）。点击「开始全局规划」。模型一旦修改，旧结论会立即撤下。
            </div>
          )}
        </section>
      </div>

      {result && <ResultPanel result={result} guardBand={validModel?.guardBand ?? 0} />}
    </div>
  );
}
