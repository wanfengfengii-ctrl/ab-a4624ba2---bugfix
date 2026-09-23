import type { Violation } from '../domain/types';

/** 碰撞明细：间隔碰撞指出载波对与实际距离；互调碰撞指出三元组与实际距离 */
export function ViolationList({ violations }: { violations: Violation[] }) {
  if (violations.length === 0) return null;
  return (
    <ul className="violation-list">
      {violations.map((v, idx) =>
        v.kind === 'spacing' ? (
          <li key={idx} className="violation spacing">
            <span className="tag tag-spacing">间隔碰撞</span>
            载波 <b>{v.carrierA}</b>（{v.freqA} kHz）与 <b>{v.carrierB}</b>（{v.freqB} kHz）
            实际距离仅 <b className="num bad">{v.distance}</b> kHz，
            小于保护间隔 {v.guard} kHz（不足 {v.guard - v.distance} kHz）
          </li>
        ) : (
          <li key={idx} className="violation im3">
            <span className="tag tag-im3">三阶互调</span>
            三元组 i=<b>{v.i}</b>（{v.fi}）、j=<b>{v.j}</b>（{v.fj}）、k=<b>{v.k}</b>（{v.fk}）：
            2×{v.fi}−{v.fj} = <b className="num">{v.product}</b> kHz，
            落入载波 {v.k} 保护区，距其频点实际仅{' '}
            <b className="num bad">{v.distance}</b> kHz（保护间隔 {v.guard} kHz，不足{' '}
            {v.guard - Number(v.distance)} kHz）
          </li>
        ),
      )}
    </ul>
  );
}
