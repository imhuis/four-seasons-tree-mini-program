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
            for (let i = 0; i < trunk.preset.leafDensity; i++) {
                this.leaves.push({
                    branch, t: (0, math_1.randRange)(rng, 0.15, 1.06),
                    dx: (0, math_1.randRange)(rng, -0.025, 0.025), dy: (0, math_1.randRange)(rng, -0.016, 0.016), dz: (0, math_1.randRange)(rng, -0.03, 0.03),
                    size: (0, math_1.randRange)(rng, 0.018, 0.031) * trunk.preset.leafSize, rotation: rng() * math_1.TAU, tilt: rng() * math_1.TAU,
                    phase: rng() * math_1.TAU, threshold: rng() * 0.78, tint: (0, math_1.randRange)(rng, -20, 16),
                });
            }
        }
        this.batch = new MeshBatch_1.MeshBatch(three, this.leaves.length, trunk.preset.leafShape);
    }
    update(time, state) {
        this.batch.begin();
        this.visible.length = 0;
        for (let i = 0; i < this.leaves.length; i++) {
            const leaf = this.leaves[i];
            const size = leaf.size * state.leafScale * this.trunk.branchGrowth(leaf.branch) * (0, math_1.easeInOutSine)((state.leafAmount - leaf.threshold) / 0.22);
            if (size < 0.0005)
                continue;
            this.visible.push(i);
            this.position(leaf, time, state, this.point);
            const bend = Math.sin(time * 1.7 + leaf.phase) * state.windStrength;
            this.leafColor(i, state);
            const shape = this.trunk.preset.leafShape;
            const width = shape === 'needle' ? 0.09 : shape === 'oval' ? 0.48 : 0.8;
            this.batch.write(this.point.x, this.point.y, this.point.z, size, size * width, size * 0.06, leaf.rotation + bend * 0.22, leaf.tilt + bend * 0.18, this.color, leaf.tint);
        }
        this.batch.commit();
    }
    pickSource(random, time, state, out) {
        if (this.visible.length === 0)
            return false;
        const index = this.visible[Math.min(this.visible.length - 1, Math.floor(random * this.visible.length))];
        const leaf = this.leaves[index];
        this.position(leaf, time, state, out);
        out.size = leaf.size * state.leafScale;
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
    position(leaf, time, state, out) {
        this.trunk.samplePosition(leaf.branch, leaf.t, out);
        out.x += leaf.dx + Math.sin(time * 1.7 + leaf.phase) * state.windStrength * 0.004;
        out.y += leaf.dy;
        out.z += leaf.dz;
    }
    dispose() { this.batch.dispose(); }
}
exports.LeafSystem = LeafSystem;
//# sourceMappingURL=LeafSystem.js.map