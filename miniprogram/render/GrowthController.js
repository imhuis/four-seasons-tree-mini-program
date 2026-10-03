"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrowthController = exports.GROWTH_STAGES = void 0;
const math_1 = require("../utils/math");
exports.GROWTH_STAGES = ['种子', '萌芽', '幼树', '成树', '老树'];
/** An illustrative lifetime, independent of the repeating seasonal clock. */
class GrowthController {
    constructor() {
        this.state = {
            progress: 0.75, stageIndex: 3, scale: 1, thickness: 1, foliage: 1,
            maturity: 1, aging: 0, seedAmount: 0,
        };
    }
    update(progress) {
        const s = this.state;
        const p = Number.isFinite(progress) ? (0, math_1.clamp)(progress, 0, 1) : s.progress;
        s.progress = p;
        s.stageIndex = p < 0.05 ? 0 : p < 0.2 ? 1 : p < 0.5 ? 2 : p < 0.85 ? 3 : 4;
        s.scale = 0.08 + 0.92 * (0, math_1.smoothstep)((p - 0.025) / 0.72);
        s.thickness = 0.3 + 0.7 * (0, math_1.smoothstep)(p / 0.85);
        s.aging = (0, math_1.smoothstep)((p - 0.85) / 0.15);
        s.foliage = (0, math_1.smoothstep)((p - 0.08) / 0.3) * (1 - s.aging * 0.25);
        s.maturity = (0, math_1.smoothstep)((p - 0.42) / 0.2);
        s.seedAmount = 1 - (0, math_1.smoothstep)(p / 0.1);
        return s;
    }
}
exports.GrowthController = GrowthController;
//# sourceMappingURL=GrowthController.js.map