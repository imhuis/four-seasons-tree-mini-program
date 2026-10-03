"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FruitSystem = void 0;
const math_1 = require("../utils/math");
const MeshBatch_1 = require("./MeshBatch");
const CALYX = [89, 108, 52];
/** Persistent fruits and winter buds attach to the same live branch skeleton. */
class FruitSystem {
    constructor(three, trunk) {
        this.trunk = trunk;
        this.fruits = [];
        this.point = { x: 0, y: 0, z: 0 };
        const random = (0, math_1.createRng)(3817);
        if (trunk.preset.fruitShape !== 'none') {
            for (let branch = 0; branch < trunk.count; branch++) {
                if (trunk.branches[branch].leafy && random() > 0.35) {
                    this.fruits.push({ branch, t: 0.5 + random() * 0.5, threshold: random() * 0.5, rotation: random() * math_1.TAU });
                }
            }
        }
        this.batch = new MeshBatch_1.MeshBatch(three, this.fruits.length * 7, 'oval');
    }
    update(state) {
        this.batch.begin();
        const shape = this.trunk.preset.fruitShape;
        for (const fruit of this.fruits) {
            const size = (shape === 'persimmon' ? 0.023 : shape === 'bud' ? 0.009 : 0.015)
                * (0, math_1.easeInOutSine)((state.fruitAmount - fruit.threshold) / 0.3) * this.trunk.branchGrowth(fruit.branch);
            if (size < 0.0005)
                continue;
            this.trunk.samplePosition(fruit.branch, fruit.t, this.point);
            const { x, y, z } = this.point;
            this.batch.write(x, y - size, z, size, size * (shape === 'bud' ? 1.7 : 0.85), size * 0.8, shape === 'bud' ? Math.PI / 2 : fruit.rotation, 0, state.fruitColor);
            if (shape === 'persimmon') {
                for (let i = 0; i < 4; i++)
                    this.batch.write(x, y, z, size * 0.5, size * 0.15, size * 0.08, i * Math.PI / 2, 0.7, CALYX);
            }
            else if (shape === 'capsule' || shape === 'ball') {
                const count = shape === 'capsule' ? 3 : 6;
                for (let i = 0; i < count; i++) {
                    const angle = i * math_1.TAU / count;
                    this.batch.write(x + Math.cos(angle) * size * 0.5, y - size + Math.sin(angle) * size * 0.5, z, size * 0.75, size * (shape === 'ball' ? 0.12 : 0.4), size * 0.25, angle, fruit.rotation, state.fruitColor);
                }
            }
        }
        this.batch.commit();
    }
    dispose() { this.batch.dispose(); }
}
exports.FruitSystem = FruitSystem;
//# sourceMappingURL=FruitSystem.js.map