import { createRng, easeInOutSine, randRange, TAU } from '../utils/math';
import type { RGB } from '../utils/color';
import type { FoliageSource } from './LeafSystem';
import { MeshBatch } from './MeshBatch';
import type { SeasonState } from './SeasonController';
import type { Three } from './types';
import type { TreeTrunk } from './TreeTrunk';

interface Flower { branch: number; t: number; size: number; rotation: number; threshold: number; }
const CORE_COLOR: RGB = [244, 219, 154];

export class FlowerSystem {
  readonly batch: MeshBatch;
  private readonly flowers: Flower[] = [];
  private readonly visible: number[] = [];
  private readonly point = { x: 0, y: 0, z: 0 };

  constructor(three: Three, private readonly trunk: TreeTrunk, seed = 4711) {
    const rng = createRng(seed);
    for (let branch = 0; branch < trunk.count; branch++) {
      if (!trunk.branches[branch].leafy || rng() > trunk.preset.flowerDensity) continue;
      for (let cluster = 0; cluster < (trunk.preset.id === 'crape-myrtle' ? 3 : 2); cluster++) {
        this.flowers.push({ branch, t: randRange(rng, 0.35, 1.0), size: randRange(rng, 0.009, 0.014) * trunk.preset.flowerSize,
          rotation: rng() * TAU, threshold: rng() * 0.6 });
      }
    }
    this.batch = new MeshBatch(three, this.flowers.length * (trunk.preset.flowerPetals + 1), 'oval');
  }

  update(state: SeasonState): void {
    this.batch.begin();
    this.visible.length = 0;
    for (let i = 0; i < this.flowers.length; i++) {
      const f = this.flowers[i];
      const size = f.size * this.trunk.branchGrowth(f.branch) * easeInOutSine((state.flowerAmount - f.threshold) / 0.3);
      if (size < 0.0005) continue;
      this.visible.push(i);
      this.trunk.samplePosition(f.branch, f.t, this.point);
      for (let petal = 0; petal < this.trunk.preset.flowerPetals; petal++) {
        const angle = f.rotation + petal * TAU / this.trunk.preset.flowerPetals;
        this.batch.write(this.point.x + Math.cos(angle) * size * 0.8,
          this.point.y + Math.sin(angle) * size * 0.8, this.point.z + 0.01,
          size, size * 0.6, size * 0.18, angle, f.rotation * 0.3, state.flowerColor);
      }
      this.batch.write(this.point.x, this.point.y, this.point.z + 0.012,
        size * 0.38, size * 0.38, size * 0.25, 0, 0, CORE_COLOR);
    }
    this.batch.commit();
  }

  pickSource(random: number, out: FoliageSource): boolean {
    if (this.visible.length === 0) return false;
    const f = this.flowers[this.visible[Math.min(this.visible.length - 1, Math.floor(random * this.visible.length))]];
    this.trunk.samplePosition(f.branch, f.t, out);
    out.z += 0.01; out.size = f.size; out.tint = 0;
    out.color = this.trunk.preset.flowerColor; out.shape = 'oval';
    return true;
  }

  dispose(): void { this.batch.dispose(); }
}
