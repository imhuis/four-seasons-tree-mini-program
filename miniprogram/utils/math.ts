/**
 * 通用数学工具。
 *
 * 约定：本文件的函数全部是纯函数，且不产生任何临时对象（不返回新数组 / 新对象）。
 * 原因是渲染循环每帧都会调用它们，任何隐藏的分配都会变成 GC 压力。
 */

export const TAU = Math.PI * 2;

export type Easing = (t: number) => number;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** 线性插值。t 不裁剪，允许 t < 0 或 t > 1 做外插。 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 比 smoothstep 更平滑（一阶、二阶导数在端点均为 0），用于背景等大面积渐变。 */
export function easeOutCubic(t: number): number {
  const x = 1 - clamp(t, 0, 1);
  return 1 - x * x * x;
}

/** 正弦式缓入缓出，比 cubic 更"软"，适合颜色与数量的季节过渡。 */
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}

/** 把任意数值折回 [0, 1)。seasonProgress = 1.0 时应回到 0.0。 */
export function wrap01(value: number): number {
  const r = value % 1;
  return r < 0 ? r + 1 : r;
}

/**
 * 采样等距关键帧曲线：keys[i] 位于 p = i / (keys.length - 1)。
 *
 * 之所以用"等距"而不是任意位置的关键帧，是为了让 seasonProgress 的
 * 四个季度分界点（0 / 0.25 / 0.5 / 0.75 / 1）天然落在关键帧上：
 * 只要 keys.length 取 5、9、17… 即可，不需要额外的查找表。
 *
 * 关键帧之间用 easing 过渡；首尾关键帧取值相同时曲线在 p=1 → p=0 处连续，
 * 这是"冬季结束平滑接回春季"的保证。
 */
export function sampleKeyframes(
  keys: readonly number[],
  p: number,
  easing: Easing = smoothstep
): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (n === 1) return keys[0];

  const x = clamp(p, 0, 1) * (n - 1);
  const i = Math.floor(x);
  if (i >= n - 1) return keys[n - 1];

  const from = keys[i];
  const to = keys[i + 1];
  return from + (to - from) * easing(x - i);
}

/**
 * mulberry32：小而快的确定性伪随机数生成器。
 *
 * 树的骨架、叶片分布等"初始化一次"的随机量必须可复现，
 * 否则热重载后树形会整体跳变；同时它比 Math.random 快，初始化上千个叶片也没有压力。
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 返回 [min, max) 区间内的随机数。 */
export function randRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}
