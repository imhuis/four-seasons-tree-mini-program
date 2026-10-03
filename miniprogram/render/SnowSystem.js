"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnowSystem = void 0;
const math_1 = require("../utils/math");
const MeshBatch_1 = require("./MeshBatch");
const types_1 = require("./types");
const SNOW_COLOR = [252, 252, 250];
class SnowSystem {
    constructor(three, particles, seed = 60607) {
        this.particles = particles;
        this.mounds = [];
        this.emitAccumulator = 0;
        this.snowAmount = -1;
        this.source = { x: 0, y: 0, z: 0, size: 0, tint: 0 };
        const rng = (0, math_1.createRng)(seed);
        for (let i = 0; i < types_1.GROUND_SNOW_CAPACITY; i++) {
            const angle = rng() * math_1.TAU;
            const radius = Math.sqrt(rng()) * 0.65;
            this.mounds.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
                size: 0.045 + rng() * 0.075, rotation: rng() * math_1.TAU });
        }
        this.batch = new MeshBatch_1.MeshBatch(three, this.mounds.length);
        this.batch.material.transparent = true;
    }
    update(delta, treeHeight, state) {
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
        if (state.snowAmount === this.snowAmount)
            return;
        this.snowAmount = state.snowAmount;
        this.batch.begin();
        if (state.snowAmount > 0.01) {
            for (const mound of this.mounds) {
                this.batch.write(mound.x, 0.002, mound.z, mound.size, mound.size * 0.75, mound.size * 0.16 * state.snowAmount, mound.rotation, Math.PI / 2, SNOW_COLOR);
            }
        }
        this.batch.commit();
        this.batch.material.opacity = state.snowAmount;
    }
    reset() { this.emitAccumulator = 0; }
    dispose() { this.batch.dispose(); }
}
exports.SnowSystem = SnowSystem;
//# sourceMappingURL=SnowSystem.js.map