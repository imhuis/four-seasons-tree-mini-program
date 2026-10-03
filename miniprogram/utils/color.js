"use strict";
/**
 * 颜色工具。
 *
 * 设计要点：
 * 1. RGB 用长度为 3 的元组表示，插值函数一律把结果写进调用方传入的 out 参数，
 *    避免每帧产生成百上千个临时数组。
 * 2. 独立 RGB 容器与十六进制转换用于初始化，渲染层直接读取 RGB 通道。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRgb = makeRgb;
exports.hexToRgb = hexToRgb;
exports.rgb = rgb;
exports.copyRgb = copyRgb;
exports.lerpColor = lerpColor;
exports.sampleColorStops = sampleColorStops;
const math_1 = require("./math");
/** 唯一的模块级常量，供 fallback 分支复用，避免在采样函数里临时 new 数组。 */
const BLACK = [0, 0, 0];
/** 预分配一个 RGB 容器。 */
function makeRgb(r = 0, g = 0, b = 0) {
    return [r, g, b];
}
/** '#RRGGBB' → RGB（写入 out）。 */
function hexToRgb(hex, out) {
    const value = parseInt(hex.slice(1), 16);
    out[0] = (value >> 16) & 0xff;
    out[1] = (value >> 8) & 0xff;
    out[2] = value & 0xff;
    return out;
}
/** 便捷版：需要一个独立的 RGB 时才用（仅限初始化阶段）。 */
function rgb(hex) {
    return hexToRgb(hex, makeRgb());
}
function copyRgb(out, src) {
    out[0] = src[0];
    out[1] = src[1];
    out[2] = src[2];
    return out;
}
/** 颜色线性插值（写入 out，允许 out 与 a / b 是同一个对象）。 */
function lerpColor(out, a, b, t) {
    const ar = a[0];
    const ag = a[1];
    const ab = a[2];
    out[0] = ar + (b[0] - ar) * t;
    out[1] = ag + (b[1] - ag) * t;
    out[2] = ab + (b[2] - ab) * t;
    return out;
}
/**
 * 采样等距颜色关键帧（stops[i] 位于 p = i/(stops.length-1)）。
 * 与 sampleKeyframes 使用同一套索引规则，保证颜色和数量曲线的节奏一致。
 */
function sampleColorStops(out, stops, p, easing = math_1.smoothstep) {
    const n = stops.length;
    if (n === 0)
        return copyRgb(out, BLACK);
    if (n === 1)
        return copyRgb(out, stops[0]);
    const x = (0, math_1.clamp)(p, 0, 1) * (n - 1);
    const i = Math.floor(x);
    if (i >= n - 1)
        return copyRgb(out, stops[n - 1]);
    // 与 sampleKeyframes 使用同一套"等距分段 + easing"规则，
    // 保证颜色变化与数量变化的节奏完全对齐。
    const t = easing(x - i);
    return lerpColor(out, stops[i], stops[i + 1], t);
}
//# sourceMappingURL=color.js.map