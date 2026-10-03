"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParticleSystem = void 0;
const math_1 = require("../utils/math");
const MeshBatch_1 = require("./MeshBatch");
const types_1 = require("./types");
const SNOW_COLOR = [252, 252, 250];
const RAIN_COLOR = [146, 177, 199];
/** Bounded world-space pool; landed leaves retain their autumn color. */
class ParticleSystem {
    constructor(three) {
        this.pool = [];
        this.cursor = 0;
        this.groundCursor = 0;
        for (let i = 0; i < types_1.PARTICLE_POOL_SIZE + types_1.GROUND_LEAF_CAPACITY; i++) {
            this.pool.push({ active: false, kind: 'leaf', grounded: false, x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0, size: 0, rotation: 0, phase: 0, age: 0, color: [0, 0, 0], shape: 'diamond' });
        }
        this.batch = new MeshBatch_1.MeshBatch(three, this.pool.length, 'mixed');
    }
    emit(kind, source, state) {
        var _a, _b;
        const p = this.pool[this.cursor];
        this.cursor = (this.cursor + 1) % types_1.PARTICLE_POOL_SIZE;
        p.active = true;
        p.kind = kind;
        p.grounded = false;
        p.x = source.x;
        p.y = source.y;
        p.z = source.z;
        p.vx = (Math.random() - 0.5) * 0.04;
        p.vy = kind === 'rain' ? -1.35 : kind === 'snow' ? -0.10 : -0.06;
        p.vz = (Math.random() - 0.5) * 0.035;
        p.size = source.size;
        p.rotation = kind === 'rain' ? Math.PI / 2 : Math.random() * math_1.TAU;
        p.shape = kind === 'leaf' ? (_a = source.shape) !== null && _a !== void 0 ? _a : 'diamond' : 'diamond';
        p.phase = Math.random() * math_1.TAU;
        p.age = 0;
        const color = kind === 'leaf' ? (_b = source.color) !== null && _b !== void 0 ? _b : state.leafColor : kind === 'petal' ? state.flowerColor : kind === 'rain' ? RAIN_COLOR : SNOW_COLOR;
        for (let i = 0; i < 3; i++)
            p.color[i] = (0, math_1.clamp)(color[i] + (kind === 'leaf' ? source.tint : 0), 0, 255);
    }
    update(delta, time, state) {
        this.batch.begin();
        for (let i = 0; i < this.pool.length; i++) {
            const p = this.pool[i];
            if (!p.active)
                continue;
            p.age += delta;
            if (p.age > (p.grounded ? 24 : 16)) {
                p.active = false;
                continue;
            }
            if (!p.grounded) {
                p.vy -= delta * (p.kind === 'snow' ? 0.001 : 0.022);
                p.x += (p.vx + Math.sin(time * 1.2 + p.phase) * state.windStrength * 0.035) * delta;
                p.y += p.vy * delta;
                p.z += (p.vz + Math.cos(time + p.phase) * state.windStrength * 0.02) * delta;
                p.rotation += delta * (p.kind === 'rain' ? 0 : p.kind === 'snow' ? 0.3 : 1.5);
                if (p.y <= 0.006) {
                    if (p.kind === 'leaf')
                        this.land(p);
                    p.active = false;
                    continue;
                }
            }
            const retained = p.grounded ? state.groundLeafAlpha * (1 - state.snowAmount * 0.9) * (1 - p.age / 24) : 1;
            const size = p.size * Math.sqrt(Math.max(0, retained));
            const flake = p.kind === 'snow';
            const width = p.kind === 'rain' ? 0.035 : flake ? 1 : p.shape === 'needle' ? 0.09 : p.shape === 'oval' || p.shape === 'diamond' ? 0.5 : 0.8;
            this.batch.write(p.x, p.y, p.z, size, size * width, size * (flake ? 0.7 : 0.12), p.rotation, p.grounded ? Math.PI / 2 : p.kind === 'rain' ? 0 : Math.sin(time + p.phase), p.color, p.grounded ? -24 : 0, p.shape);
        }
        this.batch.commit();
    }
    clear() {
        for (const p of this.pool)
            p.active = false;
        this.batch.begin();
        this.batch.commit();
    }
    land(p) {
        const ground = this.pool[types_1.PARTICLE_POOL_SIZE + this.groundCursor];
        this.groundCursor = (this.groundCursor + 1) % types_1.GROUND_LEAF_CAPACITY;
        ground.active = true;
        ground.grounded = true;
        ground.kind = 'leaf';
        ground.x = p.x;
        ground.y = 0.004;
        ground.z = p.z;
        ground.size = p.size;
        ground.rotation = p.rotation;
        ground.age = 0;
        ground.shape = p.shape;
        ground.color[0] = p.color[0];
        ground.color[1] = p.color[1];
        ground.color[2] = p.color[2];
    }
    dispose() { this.clear(); this.batch.dispose(); }
}
exports.ParticleSystem = ParticleSystem;
//# sourceMappingURL=ParticleSystem.js.map