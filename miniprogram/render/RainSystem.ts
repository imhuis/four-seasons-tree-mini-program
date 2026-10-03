import type { FoliageSource } from './LeafSystem';
import type { ParticleSystem } from './ParticleSystem';
import type { SeasonState } from './SeasonController';

export class RainSystem {
  private accumulator = 0;
  private readonly source: FoliageSource = { x: 0, y: 0, z: 0, size: 0.035, tint: 0 };
  constructor(private readonly particles: ParticleSystem) {}

  update(delta: number, height: number, rate: number, state: SeasonState): void {
    this.accumulator = Math.min(6, this.accumulator + delta * rate);
    while (this.accumulator >= 1) {
      this.accumulator--;
      this.source.x = (Math.random() - 0.5) * 1.7;
      this.source.y = height * (1.1 + Math.random() * 0.2);
      this.source.z = (Math.random() - 0.5) * 1.4;
      this.particles.emit('rain', this.source, state);
    }
  }

  reset(): void { this.accumulator = 0; }
}
