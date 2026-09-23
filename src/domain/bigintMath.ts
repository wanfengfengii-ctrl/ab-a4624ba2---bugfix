/**
 * 精确整数运算。
 *
 * 频点本身限制在安全整数范围内（见 validation 的 Number.isSafeInteger 校验），
 * 但三阶互调产物 2*fi - fj 可能越过 Number.MAX_SAFE_INTEGER：例如 fi、fj 都
 * 接近安全整数上限时，2*fi 会超出双精度浮点的精确表示，直接用 number 计算会
 * 把本应恰好等于保护间隔的距离算错，导致费用最低的合法组合被误判碰撞而舍弃。
 *
 * 所有频率、互调产物与间距比较统一走 BigInt，保证输入虽为安全整数、中间结果
 * 超出安全范围时结论仍与整数数学完全一致。展示用数值仍为安全整数（频点本身
 * 不越界），仅互调产物等中间量可能越界，其展示字段在 types 中为 ExactInt。
 */

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** 三阶互调产物 2*fi - fj（精确值，可能超出安全整数范围） */
export function im3Product(fi: number, fj: number): bigint {
  return 2n * BigInt(fi) - BigInt(fj);
}

/** 两整数频点的距离 |a - b| */
export function freqDistance(a: number, b: number): bigint {
  const x = BigInt(a);
  const y = BigInt(b);
  return x >= y ? x - y : y - x;
}

/** 互调产物与频点的距离 |product - f| */
export function productDistance(product: bigint, f: number): bigint {
  const x = BigInt(f);
  return product >= x ? product - x : x - product;
}

/**
 * 精确大整数转回展示用数值：
 *  - 安全整数范围内返回 number（既有频点、普通产物保持原展示与类型）；
 *  - 超出范围时返回精确十进制字符串，避免精度丢失。
 */
export function bigIntToDisplay(value: bigint): number | string {
  if (value >= MIN_SAFE && value <= MAX_SAFE) return Number(value);
  return value.toString();
}
