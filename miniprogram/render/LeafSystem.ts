import { createRng, easeInOutSine, randRange, TAU } from '../utils/math';
import { MeshBatch } from './MeshBatch';
import type { SeasonState } from './SeasonController';
import type { Three } from './types';
import type { ScenePoint, TreeTrunk } from './TreeTrunk';
import { lerpColor, makeRgb, type RGB } from '../utils/color';
import type { MeshShape } from './MeshBatch';

export interface FoliageSource extends ScenePoint { size: number; tint: number; color?: RGB; shape?: MeshShape; }

interface Leaf {
  branch: number; t: number; dx: number; dy: number; dz: number;
  size: number; rotation: number; tilt: number; phase: number; threshold: number; tint: number;
}

export class LeafSystem {
  readonly batch: MeshBatch;
  private readonly leaves: Leaf[] = [];
  private readonly point: ScenePoint = { x: 0, y: 0, z: 0 };
  private readonly visible: number[] = [];
  private readonly color = makeRgb();
  private readonly autumnColors: readonly RGB[] = [[230, 152, 40], [197, 50, 52], [130, 57, 109], [236, 196, 64]];

  constructor(three: Three, private readonly trunk: TreeTrunk, seed = 981223) {
    const rng = createRng(seed);
    for (let branch = 0; branch < trunk.count; branch++) {
      if (!trunk.branches[branch].leafy) continue;
      for (let i = 0; i < trunk.preset.leafDensity; i++) {
        this.leaves.push({
          branch, t: randRange(rng, 0.15, 1.06),
          dx: randRange(rng, -0.025, 0.025), dy: randRange(rng, -0.016, 0.016), dz: randRange(rng, -0.03, 0.03),
          size: randRange(rng, 0.018, 0.031) * trunk.preset.leafSize, rotation: rng() * TAU, tilt: rng() * TAU,
          phase: rng() * TAU, threshold: rng() * 0.78, tint: randRange(rng, -20, 16),
        });
      }
    }
    this.batch = new MeshBatch(three, this.leaves.length, trunk.preset.leafShape);
  }

  update(time: number, state: SeasonState): void {
    this.batch.begin();
    this.visible.length = 0;
    for (let i = 0; i < this.leaves.length; i++) {
      const leaf = this.leaves[i];
      const size = leaf.size * state.leafScale * this.trunk.branchGrowth(leaf.branch) * easeInOutSine((state.leafAmount - leaf.threshold) / 0.22);
      if (size < 0.0005) continue;
      this.visible.push(i);
      this.position(leaf, time, state, this.point);
      const bend = Math.sin(time * 1.7 + leaf.phase) * state.windStrength;
      this.leafColor(i, state);
      const shape = this.trunk.preset.leafShape;
      const width = shape === 'needle' ? 0.09 : shape === 'oval' ? 0.48 : 0.8;
      this.batch.write(this.point.x, this.point.y, this.point.z, size, size * width, size * 0.06,
        leaf.rotation + bend * 0.22, leaf.tilt + bend * 0.18, this.color, leaf.tint);
    }
    this.batch.commit();
  }

  pickSource(random: number, time: number, state: SeasonState, out: FoliageSource): boolean {
    if (this.visible.length === 0) return false;
    const index = this.visible[Math.min(this.visible.length - 1, Math.floor(random * this.visible.length))];
    const leaf = this.leaves[index];
    this.position(leaf, time, state, out);
    out.size = leaf.size * state.leafScale;
    out.tint = leaf.tint;
    this.leafColor(index, state);
    out.color = this.color; out.shape = this.trunk.preset.leafShape;
    return true;
  }

  private leafColor(index: number, state: SeasonState): void {
    const amount = this.trunk.preset.autumnVariation * Math.max(0, Math.sin((state.seasonProgress - 0.44) * Math.PI / 0.35));
    lerpColor(this.color, state.leafColor, this.autumnColors[index % this.autumnColors.length], state.seasonIndex === 2 ? amount : 0);
    if (this.trunk.preset.id === 'japanese-maple' && state.seasonIndex === 1 && index % 3 === 0) {
      lerpColor(this.color, this.color, this.autumnColors[1], 0.7);
    }
  }

  private position(leaf: Leaf, time: number, state: SeasonState, out: ScenePoint): void {
    this.trunk.samplePosition(leaf.branch, leaf.t, out);
    out.x += leaf.dx + Math.sin(time * 1.7 + leaf.phase) * state.windStrength * 0.004;
    out.y += leaf.dy;
    out.z += leaf.dz;
  }

  dispose(): void { this.batch.dispose(); }
}
