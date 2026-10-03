import { createRng, lerp, randRange, smoothstep, TAU } from '../utils/math';
import { BRANCH_LIMIT, BRANCH_MAX_DEPTH, TRUNK_HALF_WIDTH } from './types';
import { DEFAULT_TREE_PRESET, type TreePreset } from './TreePresets';

export interface ScenePoint { x: number; y: number; z: number; }

export interface Branch {
  parent: number;
  parentT: number;
  depth: number;
  x0: number; y0: number; z0: number;
  cx: number; cy: number; cz: number;
  x1: number; y1: number; z1: number;
  w0: number; w1: number;
  flex: number; phase: number; freq: number;
  leafy: boolean;
}

export interface TreeBounds {
  minX: number; maxX: number; maxY: number; minZ: number; maxZ: number;
}

/** Deterministic 3D skeleton; no renderer or platform dependency. */
export class TreeTrunk {
  private growthProgress = NaN;
  private readonly grown: Float32Array;
  private readonly reveals: Float32Array;
  private readonly attachment: ScenePoint = { x: 0, y: 0, z: 0 };
  readonly branches: Branch[] = [];
  readonly bounds: TreeBounds;
  readonly offsets: {
    startX: Float32Array; startY: Float32Array; startZ: Float32Array;
    tipX: Float32Array; tipY: Float32Array; tipZ: Float32Array;
  };

  constructor(seed = 20261003, readonly preset: TreePreset = DEFAULT_TREE_PRESET) {
    const rng = createRng(seed);
    this.grow(-1, 0, BRANCH_MAX_DEPTH, { x: 0, y: 0, z: 0 }, rng() * TAU, 0.04,
      preset.trunkHeight * (preset.crown === 'conifer' ? 1 : 1.4), TRUNK_HALF_WIDTH, rng, false);
    const root = this.branches[0];
    if (preset.crown === 'conifer') {
      for (let level = 0; level < 6; level++) {
        for (let side = 0; side < 4; side++) {
          const t = 0.20 + level * 0.13 + randRange(rng, -0.018, 0.018);
          this.grow(0, t, 2, TreeTrunk.pointOnQuad(root, t),
            side * TAU / 4 + level * 0.64 + randRange(rng, -0.15, 0.15),
            randRange(rng, 1.05, 1.30), (0.36 - level * 0.046) * randRange(rng, 0.9, 1.1),
            (root.w0 + (root.w1 - root.w0) * t) * 0.44, rng);
        }
      }
    } else {
      const lean = preset.crown === 'column' ? 0.48 : preset.crown === 'vase' ? 1.02 : 1.0;
      for (let i = 0; i < 5; i++) {
        const t = 0.50 + i * 0.105 + randRange(rng, -0.02, 0.02);
        const branchLean = i === 4 ? 0.40 : lean + randRange(rng, -0.16, 0.16);
        this.grow(0, t, BRANCH_MAX_DEPTH - 1, TreeTrunk.pointOnQuad(root, t),
          i * 2.39996 + randRange(rng, -0.20, 0.20), branchLean,
          (i === 4 ? 0.21 : 0.36 + (0.9 - t) * 0.14) * randRange(rng, 0.86, 1.12),
          (root.w0 + (root.w1 - root.w0) * t) * 0.64, rng);
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

  get count(): number { return this.branches.length; }

  branchGrowth(id: number): number { return this.reveals[id]; }

  /** Grow from each parent's live attachment, keeping every joint connected. */
  setGrowth(progress: number): void {
    if (progress === this.growthProgress) return;
    this.growthProgress = progress;
    for (let i = 0; i < this.count; i++) {
      const b = this.branches[i];
      const start = b.parent < 0 ? 0 : 0.1 + (BRANCH_MAX_DEPTH - b.depth) * 0.09;
      const reveal = smoothstep((progress - start) / 0.20);
      this.reveals[i] = reveal;
      const p = this.attachment;
      if (b.parent < 0) { p.x = p.y = p.z = 0; }
      else this.sampleGrown(b.parent, b.parentT, p);
      const offset = i * 9;
      this.grown[offset] = p.x; this.grown[offset + 1] = p.y; this.grown[offset + 2] = p.z;
      this.grown[offset + 3] = p.x + (b.cx - b.x0) * reveal;
      this.grown[offset + 4] = p.y + (b.cy - b.y0) * reveal;
      this.grown[offset + 5] = p.z + (b.cz - b.z0) * reveal;
      this.grown[offset + 6] = p.x + (b.x1 - b.x0) * reveal;
      this.grown[offset + 7] = p.y + (b.y1 - b.y0) * reveal;
      this.grown[offset + 8] = p.z + (b.z1 - b.z0) * reveal;
    }
  }

  private sampleGrown(id: number, t: number, out: ScenePoint): void {
    const offset = id * 9;
    const a = (1 - t) * (1 - t), c = t * t, middle = 2 * (1 - t) * t;
    out.x = a * this.grown[offset] + middle * this.grown[offset + 3] + c * this.grown[offset + 6];
    out.y = a * this.grown[offset + 1] + middle * this.grown[offset + 4] + c * this.grown[offset + 7];
    out.z = a * this.grown[offset + 2] + middle * this.grown[offset + 5] + c * this.grown[offset + 8];
  }

  static pointOnQuad(b: Branch, t: number): ScenePoint {
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
  samplePosition(branchId: number, t: number, out: ScenePoint): void {
    const off = this.offsets;
    this.sampleGrown(branchId, t, out);
    out.x += lerp(off.startX[branchId], off.tipX[branchId], t);
    out.y += lerp(off.startY[branchId], off.tipY[branchId], t);
    out.z += lerp(off.startZ[branchId], off.tipZ[branchId], t);
  }

  /** Tube frames follow the actual grown curve, including its inherited wind offset. */
  sampleTangent(branchId: number, t: number, out: ScenePoint): void {
    const offset = branchId * 9;
    const off = this.offsets;
    out.x = 2 * ((1 - t) * (this.grown[offset + 3] - this.grown[offset])
      + t * (this.grown[offset + 6] - this.grown[offset + 3])) + off.tipX[branchId] - off.startX[branchId];
    out.y = 2 * ((1 - t) * (this.grown[offset + 4] - this.grown[offset + 1])
      + t * (this.grown[offset + 7] - this.grown[offset + 4])) + off.tipY[branchId] - off.startY[branchId];
    out.z = 2 * ((1 - t) * (this.grown[offset + 5] - this.grown[offset + 2])
      + t * (this.grown[offset + 8] - this.grown[offset + 5])) + off.tipZ[branchId] - off.startZ[branchId];
  }

  updateSway(time: number, wind: number): void {
    wind = Number.isFinite(wind) ? wind : 0;
    const off = this.offsets;
    for (let i = 0; i < this.count; i++) {
      const b = this.branches[i];
      const parentT = b.parentT;
      off.startX[i] = b.parent >= 0 ? lerp(off.startX[b.parent], off.tipX[b.parent], parentT) : 0;
      off.startY[i] = b.parent >= 0 ? lerp(off.startY[b.parent], off.tipY[b.parent], parentT) : 0;
      off.startZ[i] = b.parent >= 0 ? lerp(off.startZ[b.parent], off.tipZ[b.parent], parentT) : 0;
      const phase = time * b.freq + b.phase;
      off.tipX[i] = off.startX[i] + Math.sin(phase) * b.flex * wind * this.reveals[i];
      off.tipY[i] = off.startY[i] + Math.cos(phase * 0.73) * b.flex * wind * 0.15 * this.reveals[i];
      off.tipZ[i] = off.startZ[i] + Math.sin(phase * 0.83) * b.flex * wind * 0.55 * this.reveals[i];
    }
  }

  private grow(parent: number, parentT: number, depth: number, start: ScenePoint, azimuth: number, lean: number,
    length: number, width: number, rng: () => number, children = true): void {
    if (depth < 1 || this.count >= BRANCH_LIMIT) return;
    const x1 = start.x + Math.cos(azimuth) * Math.sin(lean) * length * this.preset.spread;
    const y1 = start.y + Math.cos(lean) * length;
    const z1 = start.z + Math.sin(azimuth) * Math.sin(lean) * length * this.preset.spread;
    const id = this.count;
    const tipRatio = parent < 0 ? (this.preset.crown === 'conifer' ? 0.04 : 0.22) : depth === 1 ? 0.06 : 0.36;
    this.branches.push({
      parent, parentT, depth, x0: start.x, y0: start.y, z0: start.z,
      cx: lerp(start.x, x1, 0.42) + randRange(rng, -0.065, 0.065) * length,
      cy: lerp(start.y, y1, 0.52) - Math.sin(lean) * length * 0.10,
      cz: lerp(start.z, z1, 0.42) + randRange(rng, -0.065, 0.065) * length,
      x1, y1, z1, w0: width, w1: width * tipRatio,
      flex: 0.002 + (BRANCH_MAX_DEPTH - depth) * 0.003,
      phase: rng() * TAU, freq: randRange(rng, 0.7, 1.4), leafy: depth <= 2,
    });
    if (!children) return;
    const branch = this.branches[id];
    const sideSign = rng() < 0.5 ? -1 : 1;
    for (let i = 0; i < (depth === 2 ? 3 : 2); i++) {
      // A longer leader and a shorter side shoot avoid repeated symmetric Y forks.
      const t = i === 0 ? 1 : randRange(rng, 0.58, 0.82);
      const terminal = depth === 2;
      const turn = i === 0 ? randRange(rng, terminal ? -0.65 : -0.4, terminal ? 0.65 : 0.4)
        : randRange(rng, terminal ? 1.05 : 0.72, terminal ? 1.85 : 1.3) * sideSign * (i === 1 ? 1 : -1);
      const childLean = terminal ? lean + randRange(rng, 0.12, 0.55) : lean + randRange(rng, -0.22, 0.25);
      this.grow(id, t, depth - 1, TreeTrunk.pointOnQuad(branch, t),
        azimuth + turn, Math.max(0.25, Math.min(1.65, childLean)),
        length * randRange(rng, i === 0 ? 0.60 : 0.46, i === 0 ? 0.76 : 0.66),
        (branch.w0 + (branch.w1 - branch.w0) * t) * (i === 0 ? 0.9 : 0.58), rng);
    }
  }
}
