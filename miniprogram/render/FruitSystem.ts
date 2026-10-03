import type { RGB } from '../utils/color';
import { createRng, easeInOutSine, TAU } from '../utils/math';
import { MeshBatch } from './MeshBatch';
import type { SeasonState } from './SeasonController';
import type { TreeTrunk } from './TreeTrunk';
import type { Three } from './types';

const CALYX: RGB = [89, 108, 52];

/** Persistent fruits and winter buds attach to the same live branch skeleton. */
export class FruitSystem {
  readonly batch: MeshBatch;
  private readonly fruits: { branch: number; t: number; threshold: number; rotation: number }[] = [];
  private readonly point = { x: 0, y: 0, z: 0 };

  constructor(three: Three, private readonly trunk: TreeTrunk) {
    const random = createRng(3817);
    if (trunk.preset.fruitShape !== 'none') {
      for (let branch = 0; branch < trunk.count; branch++) {
        if (trunk.branches[branch].leafy && random() > 0.35) {
          this.fruits.push({ branch, t: 0.5 + random() * 0.5, threshold: random() * 0.5, rotation: random() * TAU });
        }
      }
    }
    this.batch = new MeshBatch(three, this.fruits.length * 7, 'oval');
  }

  update(state: SeasonState): void {
    this.batch.begin();
    const shape = this.trunk.preset.fruitShape;
    for (const fruit of this.fruits) {
      const size = (shape === 'persimmon' ? 0.023 : shape === 'bud' ? 0.009 : 0.015)
        * easeInOutSine((state.fruitAmount - fruit.threshold) / 0.3) * this.trunk.branchGrowth(fruit.branch);
      if (size < 0.0005) continue;
      this.trunk.samplePosition(fruit.branch, fruit.t, this.point);
      const { x, y, z } = this.point;
      this.batch.write(x, y - size, z, size, size * (shape === 'bud' ? 1.7 : 0.85), size * 0.8,
        shape === 'bud' ? Math.PI / 2 : fruit.rotation, 0, state.fruitColor);
      if (shape === 'persimmon') {
        for (let i = 0; i < 4; i++) this.batch.write(x, y, z, size * 0.5, size * 0.15, size * 0.08, i * Math.PI / 2, 0.7, CALYX);
      } else if (shape === 'capsule' || shape === 'ball') {
        const count = shape === 'capsule' ? 3 : 6;
        for (let i = 0; i < count; i++) {
          const angle = i * TAU / count;
          this.batch.write(x + Math.cos(angle) * size * 0.5, y - size + Math.sin(angle) * size * 0.5, z,
            size * 0.75, size * (shape === 'ball' ? 0.12 : 0.4), size * 0.25, angle, fruit.rotation, state.fruitColor);
        }
      }
    }
    this.batch.commit();
  }

  dispose(): void { this.batch.dispose(); }
}
