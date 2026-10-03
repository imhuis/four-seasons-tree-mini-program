/**
 * 季节状态控制器。
 *
 * 职责边界：
 * - 只做"seasonProgress → 一组连续数值"的换算，不碰任何 Canvas 绘制。
 * - 输出的 SeasonState 是**预分配且就地更新**的对象，渲染层每帧直接读它，
 *   不会产生任何临时对象。
 *
 * 插值策略：
 * 所有参数都用"等距关键帧曲线"描述。关键帧数量取 9（步长 0.125）或 17（步长 0.0625），
 * 因此 0 / 0.25 / 0.5 / 0.75 / 1.0 这五个季度分界点天然落在关键帧上。
 * 每条曲线的首尾关键帧取值相同，保证 p=1 与 p=0 处数值连续——
 * 这正是"冬季结束平滑回到春季"的数学保证。
 */

import {
  easeOutCubic,
  easeInOutSine,
  sampleKeyframes,
  smoothstep,
  wrap01,
  type Easing,
} from '../utils/math';
import { hexToRgb, makeRgb, sampleColorStops, type RGB } from '../utils/color';
import { DEFAULT_TREE_PRESET, type TreePreset } from './TreePresets';

export interface SeasonState {
  /** 归一化的季节进度，0 = 春季开始，1 = 下一年春季开始 */
  seasonProgress: number;
  /** 主季节索引：0 春 / 1 夏 / 2 秋 / 3 冬 */
  seasonIndex: number;
  /** 细分阶段索引：0..7（初春 / 暮春 / 初夏 / 盛夏 / 初秋 / 深秋 / 初冬 / 寒冬） */
  phaseIndex: number;

  /* ---------- 数量与强度（全部连续插值） ---------- */
  /** 树冠叶量：同时作为"叶片是否已经长出来"的阈值变量 */
  leafAmount: number;
  /** 叶片尺寸倍率 */
  leafScale: number;
  /** 花朵开放度 */
  flowerAmount: number;
  fruitAmount: number;
  /** 每秒落叶生成速率 */
  fallingLeafRate: number;
  /** 每秒花瓣生成速率 */
  petalRate: number;
  /** 每秒雪花生成速率 */
  snowRate: number;
  /** 积雪量（枝条 + 地面共用），0..1 */
  snowAmount: number;
  /** 风力强度，驱动枝叶摆动与粒子横向漂移 */
  windStrength: number;
  /** 地面积叶的保留程度 */
  groundLeafAlpha: number;

  /* ---------- 颜色（就地更新的容器，勿替换引用） ---------- */
  leafColor: RGB;
  skyTop: RGB;
  skyBottom: RGB;
  groundColor: RGB;
  trunkColor: RGB;
  flowerColor: RGB;
  fruitColor: RGB;
}

/* ================================================================== *
 * 关键帧曲线定义
 * 注释中的 [p=…] 表示该关键帧对应的 seasonProgress。
 * 每条曲线的首尾值必须相等，否则一年循环处会出现跳变。
 * ================================================================== */

/**
 * 叶量。春季 0.06 → 1.0 是"叶片数量逐渐增加"的主驱动量：
 * 每片叶子有一个固定的发芽阈值，叶量越过阈值才逐渐长大（见 LeafSystem）。
 */
const LEAF_AMOUNT: readonly number[] = [
  0.06, // [0.000] 初春：几乎没有叶片，此时树上还留着残雪
  0.42, // [0.125] 暮春
  1.0, // [0.250] 初夏：叶量拉满
  1.0, // [0.375] 盛夏
  0.92, // [0.500] 初秋：仍算茂密
  0.42, // [0.625] 深秋：树冠明显变稀疏
  0, // [0.750] 初冬：落叶树裸枝
  0, // [0.875] 寒冬
  0.06, // [1.000] = 初春
];

/** 叶片尺寸：新叶小、盛夏最大、秋季略缩。 */
const LEAF_SCALE: readonly number[] = [0.55, 0.78, 1.0, 1.05, 0.98, 0.92, 0.86, 0.84, 0.55];

/** 风力：夏季最活跃，隆冬最静。 */
const WIND_STRENGTH: readonly number[] = [0.35, 0.5, 0.9, 1.0, 0.95, 0.85, 0.65, 0.55, 0.35];

/** 地面积叶的保留程度：秋季大量堆积，春夏逐渐分解消失。 */
const GROUND_LEAF_ALPHA: readonly number[] = [0.22, 0.12, 0.08, 0.14, 0.6, 1.0, 0.85, 0.5, 0.22];

/** 落叶生成速率（片/秒）：深秋达到峰值。 */
const FALLING_LEAF_RATE: readonly number[] = [0.2, 0.5, 0.05, 0.05, 3.5, 9.0, 1.5, 0.05, 0.2];

/** 雪花生成速率（片/秒）。"少量雪花"，因此峰值也控制在 12 左右。 */
const SNOW_RATE: readonly number[] = [0.5, 0, 0, 0, 0, 0.6, 8.0, 12.0, 0.5];

/**
 * 积雪量。使用 easeOutCubic：残雪在初春"融化得比较快"，
 * 这样视觉顺序才是"积雪减少 → 嫩芽出现"，而不是两者同时发生。
 */
const SNOW_AMOUNT: readonly number[] = [0.62, 0.12, 0, 0, 0, 0.08, 0.72, 0.95, 0.62];

/** 环境基础色；树种叶色、花期、果期和树皮色在 TreePresets 中定义。 */
const SKY_TOP_STOPS: readonly RGB[] = [
  '#FBF3E7', '#F7F2E4', '#EDF4E9', '#EAF3E8', '#FBEFDA', '#F7E7CF', '#E6EAF1', '#E4E8F0', '#FBF3E7',
].map((hex) => hexToRgb(hex, makeRgb()));

const SKY_BOTTOM_STOPS: readonly RGB[] = [
  '#F0E4D2', '#EFE6D4', '#D9E8D5', '#D4E6D2', '#F1DCB7', '#EBD0A6', '#CBD6E3', '#C9D4E2', '#F0E4D2',
].map((hex) => hexToRgb(hex, makeRgb()));

const GROUND_STOPS: readonly RGB[] = [
  '#D6CAB4', '#D8CDB6', '#BCCDAF', '#B8CBA9', '#C9B189', '#C0A578', '#C6CDD6', '#CDD4DD', '#D6CAB4',
].map((hex) => hexToRgb(hex, makeRgb()));


/** 数量类曲线用 easeInOutSine（柔和、无过冲），比值曲线用同一条以保持节奏一致。 */
const QUANTITY_EASE: Easing = easeInOutSine;

export class SeasonController {
  /** 预分配的赛季状态，update() 就地改写它，渲染层直接持有引用。 */
  readonly state: SeasonState;

  constructor(private preset: TreePreset = DEFAULT_TREE_PRESET) {
    this.state = {
      seasonProgress: 0,
      seasonIndex: 0,
      phaseIndex: 0,

      leafAmount: LEAF_AMOUNT[0],
      leafScale: LEAF_SCALE[0],
      flowerAmount: 0,
      fruitAmount: 0,
      fallingLeafRate: FALLING_LEAF_RATE[0],
      petalRate: 0,
      snowRate: SNOW_RATE[0],
      snowAmount: SNOW_AMOUNT[0],
      windStrength: WIND_STRENGTH[0],
      groundLeafAlpha: GROUND_LEAF_ALPHA[0],

      leafColor: makeRgb(185, 222, 142),
      skyTop: makeRgb(251, 243, 231),
      skyBottom: makeRgb(240, 228, 210),
      groundColor: makeRgb(214, 202, 180),
      trunkColor: makeRgb(107, 83, 64),
      flowerColor: makeRgb(),
      fruitColor: makeRgb(),
    };
    this.update(0);
  }

  setPreset(preset: TreePreset): void { this.preset = preset; }

  /** 主季节索引（0 春 / 1 夏 / 2 秋 / 3 冬）。 */
  static seasonIndexAt(progress: number): number {
    return Math.min(3, Math.floor(wrap01(progress) * 4));
  }

  /** 细分阶段索引（0..7）。 */
  static phaseIndexAt(progress: number): number {
    return Math.min(7, Math.floor(wrap01(progress) * 8));
  }

  /**
   * 唯一的入口：把 seasonProgress 换算成整棵树的视觉参数。
   * @param progress 允许传入 0..1 之外的数值，会自动折回（支持自动播放无限循环）。
   */
  update(progress: number): SeasonState {
    const p = wrap01(progress);
    const s = this.state;

    s.seasonProgress = p;
    s.seasonIndex = SeasonController.seasonIndexAt(p);
    s.phaseIndex = SeasonController.phaseIndexAt(p);

    s.leafAmount = sampleKeyframes(LEAF_AMOUNT, p, QUANTITY_EASE);
    s.leafScale = sampleKeyframes(LEAF_SCALE, p, QUANTITY_EASE);
    s.flowerAmount = sampleKeyframes(this.preset.flowerCurve, p, QUANTITY_EASE);
    s.fruitAmount = sampleKeyframes(this.preset.fruitCurve, p, QUANTITY_EASE);

    // 速率类曲线只关心"数量级"，用线性分段更贴合"深秋骤然加速落叶"的观感
    s.fallingLeafRate = sampleKeyframes(FALLING_LEAF_RATE, p, smoothstep);
    s.petalRate = s.flowerAmount * this.preset.flowerDensity * 2;
    s.snowRate = sampleKeyframes(SNOW_RATE, p, smoothstep);
    s.snowAmount = sampleKeyframes(SNOW_AMOUNT, p, easeOutCubic);

    s.windStrength = sampleKeyframes(WIND_STRENGTH, p, QUANTITY_EASE);
    s.groundLeafAlpha = sampleKeyframes(GROUND_LEAF_ALPHA, p, QUANTITY_EASE);

    sampleColorStops(s.leafColor, this.preset.leafColors, p);
    // 背景是整屏面积，用 easeInOutSine 让色相推移更藏得住
    sampleColorStops(s.skyTop, SKY_TOP_STOPS, p, QUANTITY_EASE);
    sampleColorStops(s.skyBottom, SKY_BOTTOM_STOPS, p, QUANTITY_EASE);
    sampleColorStops(s.groundColor, GROUND_STOPS, p, QUANTITY_EASE);
    for (let channel = 0; channel < 3; channel++) {
      s.trunkColor[channel] = this.preset.trunkColor[channel];
      s.flowerColor[channel] = this.preset.flowerColor[channel];
      s.fruitColor[channel] = this.preset.fruitColor[channel];
    }

    return s;
  }
}
