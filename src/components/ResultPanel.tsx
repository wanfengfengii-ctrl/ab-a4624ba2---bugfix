import type { SolveResult } from '../domain/types';
import { ViolationList } from './ViolationList';

interface Props {
  result: SolveResult;
  guardBand: number;
}

function fmtMargin(m: number): { text: string; tone: 'ok' | 'warn' | 'inf' } {
  if (!Number.isFinite(m)) return { text: '—（无其他载波）', tone: 'inf' };
  if (m === 0) return { text: `${m} kHz（恰好满足）`, tone: 'warn' };
  return { text: `${m} kHz`, tone: 'ok' };
}

export function ResultPanel({ result, guardBand }: Props) {
  if (result.status === 'infeasible') {
    return (
      <section className="panel result">
        <h2>③ 规划结果</h2>
        <div className="banner banner-bad">
          <b>无解：</b>
          已完整比较全部 {result.totalCombinations.toLocaleString()} 个候选组合
          （访问 {result.nodesVisited.toLocaleString()} 个搜索节点，耗时{' '}
          {result.durationMs.toFixed(2)} ms），不存在同时满足载波间隔与三阶互调约束的组合。
          请增加候选频点或放宽保护间隔后重新计算。
        </div>
        <h3>参考诊断：逐路最便宜候选组合的碰撞</h3>
        <p className="muted">
          以下为每个载波选择费用最低候选时的碰撞清单（其他组合可能更少，但已证明无一可行）：
        </p>
        <ViolationList violations={result.diagnosis ?? []} />
      </section>
    );
  }

  return (
    <section className="panel result">
      <h2>③ 规划结果（全局最优）</h2>

      <div className="summary-cards">
        <div className="card">
          <div className="card-label">总改频费用</div>
          <div className="card-value">{result.totalCost}</div>
        </div>
        <div className="card">
          <div className="card-label">最大首选偏移</div>
          <div className="card-value">{result.maxDeviation} kHz</div>
        </div>
        <div className="card">
          <div className="card-label">选中频点序列</div>
          <div className="card-value seq">
            ({result.frequencySequence.map((s) => s.freq).join(', ')})
          </div>
        </div>
      </div>

      <p className="muted">
        已完整比较 {result.totalCombinations.toLocaleString()} 个组合中的可达可行解
        （搜索节点 {result.nodesVisited.toLocaleString()}，命中可行叶{' '}
        {result.feasibleLeavesVisited.toLocaleString()}，耗时 {result.durationMs.toFixed(2)} ms）。
        优化顺序：总费用 → 最大偏移 → 频点序列字典序。保护间隔 {guardBand} kHz。
      </p>

      <h3>逐项核对</h3>
      <table className="result-table">
        <thead>
          <tr>
            <th>载波</th>
            <th>选中候选</th>
            <th>选中频点 kHz</th>
            <th>首选频点 kHz</th>
            <th>偏移 kHz</th>
            <th>改频费用</th>
            <th>最近载波间隔（实际距离 / 裕量）</th>
            <th>最近互调威胁（2fi−fj / 实际距离 / 裕量）</th>
            <th>最小冲突裕量</th>
          </tr>
        </thead>
        <tbody>
          {result.selections.map((s) => {
            const sp = s.margin.spacingNearest;
            const im = s.margin.im3Nearest;
            const worst = fmtMargin(s.margin.worstMargin);
            return (
              <tr key={s.carrierId}>
                <td><b>{s.carrierId}</b></td>
                <td>#{s.candidateNo}</td>
                <td className="num">{s.freq}</td>
                <td className="num">{s.preferredFreq}</td>
                <td className="num">{s.deviation}</td>
                <td className="num">{s.cost}</td>
                <td>
                  {sp ? (
                    <>
                      {sp.otherId}（{sp.otherFreq}）：距离 <b className="num">{sp.distance}</b>
                      {' '}／裕量 <b className="num">{sp.margin}</b> kHz
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {im ? (
                    <>
                      2×{im.i}−{im.j} = <b className="num">{im.product}</b>；距离{' '}
                      <b className="num">{im.distance}</b>／裕量 <b className="num">{im.margin}</b> kHz
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={'num tone-' + worst.tone}>{worst.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        裕量 = 实际频率距离 − 保护间隔（{guardBand} kHz），非负即满足约束；0 表示恰好贴着保护边界。
        互调裕量以本载波为第三载波 k，遍历所有不同载波对 (i, j) 的产物 2fi−fj 取最近距离。
      </p>
    </section>
  );
}
