"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeTrunk = void 0;
const math_1 = require("../utils/math");
const types_1 = require("./types");
const TreePresets_1 = require("./TreePresets");
/** Deterministic 3D skeleton; no renderer or platform dependency. */
class TreeTrunk {
    constructor(seed = 20261003, preset = TreePresets_1.DEFAULT_TREE_PRESET) {
        this.preset = preset;
        this.growthProgress = NaN;
        this.attachment = { x: 0, y: 0, z: 0 };
        this.branches = [];
        const rng = (0, math_1.createRng)(seed);
        this.grow(-1, types_1.BRANCH_MAX_DEPTH, { x: 0, y: 0, z: 0 }, 0, 0.04, preset.trunkHeight, types_1.TRUNK_HALF_WIDTH, rng, false);
        const root = this.branches[0];
        if (preset.crown === 'conifer') {
            for (let level = 0; level < 6; level++) {
                for (let side = 0; side < 4; side++) {
                    this.grow(0, 2, TreeTrunk.pointOnQuad(root, 0.22 + level * 0.13), side * math_1.TAU / 4 + level * 0.42, 1.25, 0.34 - level * 0.045, types_1.TRUNK_HALF_WIDTH * (0.52 - level * 0.055), rng);
                }
            }
        }
        else {
            const lean = preset.crown === 'column' ? 0.42 : preset.crown === 'vase' ? 0.85 : 0.65;
            for (let i = 0; i < 4; i++) {
                this.grow(0, types_1.BRANCH_MAX_DEPTH - 1, TreeTrunk.pointOnQuad(root, 0.48 + i * 0.17), i * math_1.TAU / 4 + 0.35, i === 3 ? 0.12 : lean, 0.29, types_1.TRUNK_HALF_WIDTH * 0.65, rng);
            }
        }
        const count = this.branches.length;
        this.grown = new Float32Array(count * 9);
        this.reveals = new Float32Array(count);
        this.offsets = {
            startX: new Float32Array(count), startY: new Float32Array(count), startZ: new Float32Array(count),
            tipX: new Float32Array(count), tipY: new Float32Array(count), tipZ: new Float32Array(count),
        };
        this.bounds = { minX: 0, maxX: 0, maxY: 0, minZ: 0, maxZ: 0 };
        for (const b of this.branches) {
            this.bounds.minX = Math.min(this.bounds.minX, b.x0, b.cx, b.x1);
            this.bounds.maxX = Math.max(this.bounds.maxX, b.x0, b.cx, b.x1);
            this.bounds.maxY = Math.max(this.bounds.maxY, b.y0, b.cy, b.y1);
            this.bounds.minZ = Math.min(this.bounds.minZ, b.z0, b.cz, b.z1);
            this.bounds.maxZ = Math.max(this.bounds.maxZ, b.z0, b.cz, b.z1);
        }
        this.setGrowth(1);
    }
    get count() { return this.branches.length; }
    branchGrowth(id) { return this.reveals[id]; }
    /** Grow from each parent's live attachment, keeping every joint connected. */
    setGrowth(progress) {
        if (progress === this.growthProgress)
            return;
        this.growthProgress = progress;
        for (let i = 0; i < this.count; i++) {
            const b = this.branches[i];
            const start = b.parent < 0 ? 0 : 0.1 + (types_1.BRANCH_MAX_DEPTH - b.depth) * 0.09;
            const reveal = (0, math_1.smoothstep)((progress - start) / 0.20);
            this.reveals[i] = reveal;
            const p = this.attachment;
            if (b.parent < 0) {
                p.x = p.y = p.z = 0;
            }
            else
                this.sampleGrown(b.parent, b.parent === 0 ? b.y0 / this.branches[0].y1 : 1, p);
            const offset = i * 9;
            this.grown[offset] = p.x;
            this.grown[offset + 1] = p.y;
            this.grown[offset + 2] = p.z;
            this.grown[offset + 3] = p.x + (b.cx - b.x0) * reveal;
            this.grown[offset + 4] = p.y + (b.cy - b.y0) * reveal;
            this.grown[offset + 5] = p.z + (b.cz - b.z0) * reveal;
            this.grown[offset + 6] = p.x + (b.x1 - b.x0) * reveal;
            this.grown[offset + 7] = p.y + (b.y1 - b.y0) * reveal;
            this.grown[offset + 8] = p.z + (b.z1 - b.z0) * reveal;
        }
    }
    sampleGrown(id, t, out) {
        const offset = id * 9;
        const a = (1 - t) * (1 - t), c = t * t, middle = 2 * (1 - t) * t;
        out.x = a * this.grown[offset] + middle * this.grown[offset + 3] + c * this.grown[offset + 6];
        out.y = a * this.grown[offset + 1] + middle * this.grown[offset + 4] + c * this.grown[offset + 7];
        out.z = a * this.grown[offset + 2] + middle * this.grown[offset + 5] + c * this.grown[offset + 8];
    }
    static pointOnQuad(b, t) {
        const a = (1 - t) * (1 - t);
        const c = t * t;
        const middle = 2 * (1 - t) * t;
        return {
            x: a * b.x0 + middle * b.cx + c * b.x1,
            y: a * b.y0 + middle * b.cy + c * b.y1,
            z: a * b.z0 + middle * b.cz + c * b.z1,
        };
    }
    /** Tubes, foliage and emitters all sample the same animated attachment point. */
    samplePosition(branchId, t, out) {
        const off = this.offsets;
        this.sampleGrown(branchId, t, out);
        out.x += (0, math_1.lerp)(off.startX[branchId], off.tipX[branchId], t);
        out.y += (0, math_1.lerp)(off.startY[branchId], off.tipY[branchId], t);
        out.z += (0, math_1.lerp)(off.startZ[branchId], off.tipZ[branchId], t);
    }
    updateSway(time, wind) {
        wind = Number.isFinite(wind) ? wind : 0;
        const off = this.offsets;
        for (let i = 0; i < this.count; i++) {
            const b = this.branches[i];
            // Root limbs inherit their attachment point's offset, rather than the trunk tip.
            const parentT = b.parent === 0 ? b.y0 / this.branches[0].y1 : 1;
            off.startX[i] = b.parent >= 0 ? (0, math_1.lerp)(off.startX[b.parent], off.tipX[b.parent], parentT) : 0;
            off.startY[i] = b.parent >= 0 ? (0, math_1.lerp)(off.startY[b.parent], off.tipY[b.parent], parentT) : 0;
            off.startZ[i] = b.parent >= 0 ? (0, math_1.lerp)(off.startZ[b.parent], off.tipZ[b.parent], parentT) : 0;
            const phase = time * b.freq + b.phase;
            off.tipX[i] = off.startX[i] + Math.sin(phase) * b.flex * wind * this.reveals[i];
            off.tipY[i] = off.startY[i] + Math.cos(phase * 0.73) * b.flex * wind * 0.15 * this.reveals[i];
            off.tipZ[i] = off.startZ[i] + Math.sin(phase * 0.83) * b.flex * wind * 0.55 * this.reveals[i];
        }
    }
    grow(parent, depth, start, azimuth, lean, length, width, rng, children = true) {
        if (depth < 1 || this.count >= types_1.BRANCH_LIMIT)
            return;
        const x1 = start.x + Math.cos(azimuth) * Math.sin(lean) * length * this.preset.spread;
        const y1 = start.y + Math.cos(lean) * length;
        const z1 = start.z + Math.sin(azimuth) * Math.sin(lean) * length * this.preset.spread;
        const id = this.count;
        this.branches.push({
            parent, depth, x0: start.x, y0: start.y, z0: start.z,
            cx: (0, math_1.lerp)(start.x, x1, 0.5) + (0, math_1.randRange)(rng, -0.018, 0.018),
            cy: (0, math_1.lerp)(start.y, y1, 0.5),
            cz: (0, math_1.lerp)(start.z, z1, 0.5) + (0, math_1.randRange)(rng, -0.012, 0.012),
            x1, y1, z1, w0: width, w1: width * 0.64,
            flex: 0.002 + (types_1.BRANCH_MAX_DEPTH - depth) * 0.003,
            phase: rng() * math_1.TAU, freq: (0, math_1.randRange)(rng, 0.7, 1.4), leafy: depth <= 2,
        });
        if (!children)
            return;
        for (let i = 0; i < 2; i++) {
            this.grow(id, depth - 1, { x: x1, y: y1, z: z1 }, azimuth + (i === 0 ? -0.65 : 0.65) + (0, math_1.randRange)(rng, -0.2, 0.2), Math.min(1.15, lean * 0.88 + (0, math_1.randRange)(rng, 0.08, 0.32)), length * (0, math_1.randRange)(rng, 0.64, 0.77), width * 0.64, rng);
        }
    }
}
exports.TreeTrunk = TreeTrunk;
//# sourceMappingURL=TreeTrunk.js.map