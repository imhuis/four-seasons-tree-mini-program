import type { RGB } from '../utils/color';
import { createRng, TAU } from '../utils/math';
import type { FoliageSource } from './LeafSystem';
import { MeshBatch } from './MeshBatch';
import type { ParticleSystem } from './ParticleSystem';
import type { SeasonState } from './SeasonController';
import { GROUND_SNOW_CAPACITY, type Three } from './types';

const SNOW_COLOR: RGB = [252, 252, 250];

export class SnowSystem {
  readonly batch: MeshBatch;
  private readonly mounds: { x: number; z: number; size: number; rotation: number }[] = [];
  private emitAccumulator = 0;
  private snowAmount = -1;
  private readonly source: FoliageSource = { x: 0, y: 0, z: 0, size: 0, tint: 0 };

  constructor(three: Three, private readonly particles: ParticleSystem, seed = 60607) {
    const rng = createRng(seed);
    for (let i = 0; i < GROUND_SNOW_CAPACITY; i++) {
      const angle = rng() * TAU;
      const radius = Math.sqrt(rng()) * 0.65;
      this.mounds.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
        size: 0.045 + rng() * 0.075, rotation: rng() * TAU });
    }
    this.batch = new MeshBatch(three, this.mounds.length);
    this.batch.material.transparent = true;
  }

  update(delta: number, treeHeight: number, state: SeasonState): void {
    this.emitAccumulator = Math.min(4, this.emitAccumulator + state.snowRate * delta);
    while (this.emitAccumulator >= 1) {
      this.emitAccumulator--;
      this.source.x = (Math.random() - 0.5) * 1.5;
      this.source.y = treeHeight * (1.08 + Math.random() * 0.22);
      this.source.z = (Math.random() - 0.5) * 1.1;
      this.source.size = 0.003 + Math.random() * 0.003;
      this.particles.emit('snow', this.source, state);
    }
    // Mounds stay still; snowfall emission continues even when their geometry is unchanged.
    if (state.snowAmount === this.snowAmount) return;
    this.snowAmount = state.snowAmount;
    this.batch.begin();
    if (state.snowAmount > 0.01) {
      for (const mound of this.mounds) {
        this.batch.write(mound.x, 0.002, mound.z, mound.size, mound.size * 0.75,
          mound.size * 0.16 * state.snowAmount, mound.rotation, Math.PI / 2, SNOW_COLOR);
      }
    }
    this.batch.commit();
    this.batch.material.opacity = state.snowAmount;
  }

  reset(): void { this.emitAccumulator = 0; }
  dispose(): void { this.batch.dispose(); }
}
