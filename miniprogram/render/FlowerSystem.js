"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowerSystem = void 0;
const math_1 = require("../utils/math");
const MeshBatch_1 = require("./MeshBatch");
const CORE_COLOR = [244, 219, 154];
class FlowerSystem {
    constructor(three, trunk, seed = 4711) {
        this.trunk = trunk;
        this.flowers = [];
        this.visible = [];
        this.point = { x: 0, y: 0, z: 0 };
        const rng = (0, math_1.createRng)(seed);
        for (let branch = 0; branch < trunk.count; branch++) {
            if (!trunk.branches[branch].leafy || rng() > trunk.preset.flowerDensity)
                continue;
            for (let cluster = 0; cluster < (trunk.preset.id === 'crape-myrtle' ? 3 : 2); cluster++) {
                this.flowers.push({ branch, t: (0, math_1.randRange)(rng, 0.35, 1.0), size: (0, math_1.randRange)(rng, 0.009, 0.014) * trunk.preset.flowerSize,
                    rotation: rng() * math_1.TAU, threshold: rng() * 0.6 });
            }
        }
        this.batch = new MeshBatch_1.MeshBatch(three, this.flowers.length * (trunk.preset.flowerPetals + 1), 'oval');
    }
    update(state) {
        this.batch.begin();
        this.visible.length = 0;
        for (let i = 0; i < this.flowers.length; i++) {
            const f = this.flowers[i];
            const size = f.size * this.trunk.branchGrowth(f.branch) * (0, math_1.easeInOutSine)((state.flowerAmount - f.threshold) / 0.3);
            if (size < 0.0005)
                continue;
            this.visible.push(i);
            this.trunk.samplePosition(f.branch, f.t, this.point);
            for (let petal = 0; petal < this.trunk.preset.flowerPetals; petal++) {
                const angle = f.rotation + petal * math_1.TAU / this.trunk.preset.flowerPetals;
                this.batch.write(this.point.x + Math.cos(angle) * size * 0.8, this.point.y + Math.sin(angle) * size * 0.8, this.point.z + 0.01, size, size * 0.6, size * 0.18, angle, f.rotation * 0.3, state.flowerColor);
            }
            this.batch.write(this.point.x, this.point.y, this.point.z + 0.012, size * 0.38, size * 0.38, size * 0.25, 0, 0, CORE_COLOR);
        }
        this.batch.commit();
    }
    pickSource(random, out) {
        if (this.visible.length === 0)
            return false;
        const f = this.flowers[this.visible[Math.min(this.visible.length - 1, Math.floor(random * this.visible.length))]];
        this.trunk.samplePosition(f.branch, f.t, out);
        out.z += 0.01;
        out.size = f.size;
        out.tint = 0;
        out.color = this.trunk.preset.flowerColor;
        out.shape = 'oval';
        return true;
    }
    dispose() { this.batch.dispose(); }
}
exports.FlowerSystem = FlowerSystem;
//# sourceMappingURL=FlowerSystem.js.map