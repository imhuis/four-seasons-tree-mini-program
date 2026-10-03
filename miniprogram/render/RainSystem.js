"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RainSystem = void 0;
class RainSystem {
    constructor(particles) {
        this.particles = particles;
        this.accumulator = 0;
        this.source = { x: 0, y: 0, z: 0, size: 0.035, tint: 0 };
    }
    update(delta, height, rate, state) {
        this.accumulator = Math.min(6, this.accumulator + delta * rate);
        while (this.accumulator >= 1) {
            this.accumulator--;
            this.source.x = (Math.random() - 0.5) * 1.7;
            this.source.y = height * (1.1 + Math.random() * 0.2);
            this.source.z = (Math.random() - 0.5) * 1.4;
            this.particles.emit('rain', this.source, state);
        }
    }
    reset() { this.accumulator = 0; }
}
exports.RainSystem = RainSystem;
//# sourceMappingURL=RainSystem.js.map