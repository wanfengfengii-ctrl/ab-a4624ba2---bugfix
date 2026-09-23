/**
 * 三阶互调的精确整数运算。
 *
 * 候选频点均为安全整数（validation 强制 Number.isSafeInteger），但互调产物
 * 2fi - fj 可能略超出安全整数范围：高频合法频点（如 fi = 2^53-3、
 * fj = 2^53-7）的精确产物为 2^53+1，其中奇数产物无法被 number 精确表示，
 * 会被 IEEE-754 舍入到相邻偶数，使“产物与第三载波距离恰好等于保护间隔”
 * 的合法组合被误判为碰撞。
 *
 * 因此所有互调相关运算一律用 BigInt 精确整数完成：安全整数频点转 BigInt
 * 无损，产物即便略超安全范围也保持精确。
 */

/** 三阶互调产物 2*fi - fj（精确整数；fi、fj 为安全整数频点，kHz） */
export function im3Product(fi: number, fj: number): bigint {
  return 2n * BigInt(fi) - BigInt(fj);
}

/** 互调产物与第三载波频点 fk 的绝对距离 |product - fk|（精确非负整数） */
export function productDistance(product: bigint, fk: number): bigint {
  const b = BigInt(fk);
  return product >= b ? product - b : b - product;
}
