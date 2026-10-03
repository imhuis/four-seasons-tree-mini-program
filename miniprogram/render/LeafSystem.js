"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeafSystem = void 0;
const math_1 = require("../utils/math");
const MeshBatch_1 = require("./MeshBatch");
const color_1 = require("../utils/color");
class LeafSystem {
    constructor(three, trunk, seed = 981223) {
        this.trunk = trunk;
        this.leaves = [];
        this.point = { x: 0, y: 0, z: 0 };
        this.visible = [];
        this.color = (0, color_1.makeRgb)();
        this.autumnColors = [[230, 152, 40], [197, 50, 52], [130, 57, 109], [236, 196, 64]];
        const rng = (0, math_1.createRng)(seed);
        for (let branch = 0; branch < trunk.count; branch++) {
            if (!trunk.branches[branch].leafy)
                continue;
            const b = trunk.branches[branch];
            const branchAngle = Math.atan2(b.z1 - b.z0, b.x1 - b.x0);
            const needle = trunk.preset.leafShape === 'needle';
            for (let i = 0; i < trunk.preset.leafDensity; i++) {
                const angle = branchAngle + (needle ? (i % 2 === 0 ? -1 : 1) * 1.05 : i * 2.39996) + (0, math_1.randRange)(rng, -0.22, 0.22);
                const elevation = (0, math_1.randRange)(rng, needle ? 0.04 : 0.12, needle ? 0.24 : 0.52);
                const horizontal = Math.sqrt(1 - elevation * elevation);
                const rotation = Math.acos(Math.cos(angle) * horizontal);
                const tilt = Math.atan2(Math.sin(angle) * horizontal, elevation);
                // Rotate the blade around its petiole so it generally faces the sky, with natural variation.
                const roll = Math.atan2(-Math.cos(rotation) * Math.cos(tilt), -Math.sin(tilt)) + (0, math_1.randRange)(rng, -0.32, 0.32);
                this.leaves.push({
                    branch, t: 0.12 + (i + 0.5) / trunk.preset.leafDensity * 0.82 + (0, math_1.randRange)(rng, -0.016, 0.016),
                    size: (0, math_1.randRange)(rng, 0.018, 0.030) * trunk.preset.leafSize, rotation, tilt, roll,
                    phase: rng() * math_1.TAU, threshold: rng() * 0.78, tint: (0, math_1.randRange)(rng, -20, 16),
                });
            }
        }
        this.batch = new MeshBatch_1.MeshBatch(three, this.leaves.length, trunk.preset.leafShape, 'leaf');
    }
    update(time, state) {
        this.batch.begin();
        this.visible.length = 0;
        for (let i = 0; i < this.leaves.length; i++) {
            const leaf = this.leaves[i];
            const size = this.leafSize(leaf, state);
            if (size < 0.0005)
                continue;
            this.visible.push(i);
            const bend = Math.sin(time * 1.7 + leaf.phase) * state.windStrength;
            const rotation = leaf.rotation + bend * 0.10;
            const tilt = leaf.tilt + bend * 0.12;
            this.position(leaf, size, rotation, tilt, this.point);
            this.leafColor(i, state);
            const shape = this.trunk.preset.leafShape;
            const width = shape === 'needle' ? 0.09 : shape === 'oval' ? 0.46 : 0.8;
            this.batch.write(this.point.x, this.point.y, this.point.z, size, size * width, size * 0.18, rotation, tilt, this.color, leaf.tint, shape, leaf.roll + bend * 0.20);
        }
        this.batch.commit();
    }
    pickSource(random, time, state, out) {
        if (this.visible.length === 0)
            return false;
        const index = this.visible[Math.min(this.visible.length - 1, Math.floor(random * this.visible.length))];
        const leaf = this.leaves[index];
        const bend = Math.sin(time * 1.7 + leaf.phase) * state.windStrength;
        out.size = this.leafSize(leaf, state);
        this.position(leaf, out.size, leaf.rotation + bend * 0.10, leaf.tilt + bend * 0.12, out);
        out.tint = leaf.tint;
        this.leafColor(index, state);
        out.color = this.color;
        out.shape = this.trunk.preset.leafShape;
        return true;
    }
    leafColor(index, state) {
        const amount = this.trunk.preset.autumnVariation * Math.max(0, Math.sin((state.seasonProgress - 0.44) * Math.PI / 0.35));
        (0, color_1.lerpColor)(this.color, state.leafColor, this.autumnColors[index % this.autumnColors.length], state.seasonIndex === 2 ? amount : 0);
        if (this.trunk.preset.id === 'japanese-maple' && state.seasonIndex === 1 && index % 3 === 0) {
            (0, color_1.lerpColor)(this.color, this.color, this.autumnColors[1], 0.7);
        }
    }
    leafSize(leaf, state) {
        return leaf.size * state.leafScale * this.trunk.branchGrowth(leaf.branch)
            * (0, math_1.easeInOutSine)((state.leafAmount - leaf.threshold) / 0.22);
    }
    position(leaf, size, rotation, tilt, out) {
        this.trunk.samplePosition(leaf.branch, leaf.t, out);
        const reach = size * 1.28;
        const vertical = Math.sin(rotation) * reach;
        out.x += Math.cos(rotation) * reach;
        out.y += vertical * Math.cos(tilt);
        out.z += vertical * Math.sin(tilt);
    }
    dispose() { this.batch.dispose(); }
}
exports.LeafSystem = LeafSystem;
//# sourceMappingURL=LeafSystem.js.map