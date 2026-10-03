import { clamp, smoothstep } from '../utils/math';

export const GROWTH_STAGES: readonly string[] = ['种子', '萌芽', '幼树', '成树', '老树'];
export interface GrowthState {
  progress: number;
  stageIndex: number;
  scale: number;
  thickness: number;
  foliage: number;
  maturity: number;
  aging: number;
  seedAmount: number;
}

/** An illustrative lifetime, independent of the repeating seasonal clock. */
export class GrowthController {
  readonly state: GrowthState = {
    progress: 0.75, stageIndex: 3, scale: 1, thickness: 1, foliage: 1,
    maturity: 1, aging: 0, seedAmount: 0,
  };

  update(progress: number): GrowthState {
    const s = this.state;
    const p = Number.isFinite(progress) ? clamp(progress, 0, 1) : s.progress;
    s.progress = p;
    s.stageIndex = p < 0.05 ? 0 : p < 0.2 ? 1 : p < 0.5 ? 2 : p < 0.85 ? 3 : 4;
    s.scale = 0.08 + 0.92 * smoothstep((p - 0.025) / 0.72);
    s.thickness = 0.3 + 0.7 * smoothstep(p / 0.85);
    s.aging = smoothstep((p - 0.85) / 0.15);
    s.foliage = smoothstep((p - 0.08) / 0.3) * (1 - s.aging * 0.25);
    s.maturity = smoothstep((p - 0.42) / 0.2);
    s.seedAmount = 1 - smoothstep(p / 0.1);
    return s;
  }
}
