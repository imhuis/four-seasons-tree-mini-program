import type { BufferAttribute, BufferGeometry, Mesh, MeshLambertMaterial } from 'three';
import type { RGB } from '../utils/color';
import type { Three } from './types';
import type { LeafShape } from './TreePresets';

export type MeshShape = LeafShape | 'diamond';

// Closed, faceted leaf/petal/flake. Batching needs no WebGL instancing extension.
const VERTICES = [
  0, 0, 1, 1, 0, 0, 0, 1, 0,
  0, 0, 1, 0, 1, 0, -1, 0, 0,
  0, 0, 1, -1, 0, 0, 0, -1, 0,
  0, 0, 1, 0, -1, 0, 1, 0, 0,
  0, 0, -1, 0, 1, 0, 1, 0, 0,
  0, 0, -1, -1, 0, 0, 0, 1, 0,
  0, 0, -1, 0, -1, 0, -1, 0, 0,
  0, 0, -1, 1, 0, 0, 0, -1, 0,
];

function polygon(points: readonly number[]): number[] {
  const vertices: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const next = (i + 2) % points.length;
    vertices.push(0, 0, 1, points[i], points[i + 1], 0, points[next], points[next + 1], 0,
      0, 0, -1, points[next], points[next + 1], 0, points[i], points[i + 1], 0);
  }
  return vertices;
}

function lobes(count: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < count * 2; i++) {
    const angle = i * Math.PI / count;
    const radius = i % 2 === 0 ? 1 : 0.42;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return polygon(points);
}
const oval: number[] = [];
for (let i = 0; i < 10; i++) oval.push(Math.cos(i * Math.PI / 5), Math.sin(i * Math.PI / 5));
const fan: number[] = [-0.8, 0];
for (let i = 0; i <= 8; i++) {
  const angle = -Math.PI * 0.48 + i * Math.PI * 0.96 / 8;
  fan.push(-0.6 + Math.cos(angle) * 1.6, Math.sin(angle));
}
const TEMPLATES: Record<MeshShape, readonly number[]> = {
  diamond: VERTICES, needle: VERTICES, oval: polygon(oval),
  maple: lobes(7), star: lobes(5), fan: polygon(fan),
};

function faceNormals(vertices: readonly number[]): number[] {
  const normals: number[] = [];
  for (let i = 0; i < vertices.length; i += 9) {
    const ax = vertices[i] - vertices[i + 3];
    const ay = vertices[i + 1] - vertices[i + 4];
    const az = vertices[i + 2] - vertices[i + 5];
    const cx = vertices[i + 6] - vertices[i + 3];
    const cy = vertices[i + 7] - vertices[i + 4];
    const cz = vertices[i + 8] - vertices[i + 5];
    normals.push(cy * az - cz * ay, cz * ax - cx * az, cx * ay - cy * ax);
  }
  return normals;
}

const FACE_NORMALS: Record<MeshShape, readonly number[]> = {
  diamond: faceNormals(VERTICES), needle: faceNormals(VERTICES), oval: faceNormals(TEMPLATES.oval),
  maple: faceNormals(TEMPLATES.maple), star: faceNormals(TEMPLATES.star), fan: faceNormals(TEMPLATES.fan),
};

export class MeshBatch {
  readonly geometry: BufferGeometry;
  readonly material: MeshLambertMaterial;
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly normals: Float32Array;
  private readonly positionAttribute: BufferAttribute;
  private readonly colorAttribute: BufferAttribute;
  private readonly normalAttribute: BufferAttribute;
  private readonly attributes: readonly BufferAttribute[];
  private count = 0;
  private vertexCount = 0;

  constructor(three: Three, private readonly capacity: number, private readonly shape: MeshShape | 'mixed' = 'diamond') {
    this.geometry = new three.BufferGeometry();
    const vertices = shape === 'mixed' ? 84 : TEMPLATES[shape].length / 3;
    this.positions = new Float32Array(capacity * vertices * 3);
    this.colors = new Float32Array(this.positions.length);
    this.normals = new Float32Array(this.positions.length);
    this.positionAttribute = new three.BufferAttribute(this.positions, 3).setDynamic(true);
    this.colorAttribute = new three.BufferAttribute(this.colors, 3).setDynamic(true);
    this.normalAttribute = new three.BufferAttribute(this.normals, 3).setDynamic(true);
    this.attributes = [this.positionAttribute, this.colorAttribute, this.normalAttribute];
    this.geometry.addAttribute('position', this.positionAttribute);
    this.geometry.addAttribute('color', this.colorAttribute);
    this.geometry.addAttribute('normal', this.normalAttribute);
    this.material = new three.MeshLambertMaterial({ vertexColors: three.VertexColors, side: three.DoubleSide });
    this.mesh = new three.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.geometry.setDrawRange(0, 0);
  }

  begin(): void { this.count = 0; this.vertexCount = 0; }

  write(x: number, y: number, z: number, length: number, width: number, thickness: number,
    rotation: number, tilt: number, color: RGB, tint = 0, shape: MeshShape = 'diamond'): void {
    if (this.count >= this.capacity || length <= 0) return;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const meshShape = this.shape === 'mixed' ? shape : this.shape;
    const vertices = TEMPLATES[meshShape];
    const faceNormals = FACE_NORMALS[meshShape];
    const red = Math.max(0, Math.min(255, color[0] + tint)) / 255;
    const green = Math.max(0, Math.min(255, color[1] + tint)) / 255;
    const blue = Math.max(0, Math.min(255, color[2] + tint)) / 255;
    const offset = this.vertexCount * 3;
    this.count++;
    this.vertexCount += vertices.length / 3;
    for (let face = 0; face < vertices.length; face += 9) {
      const normal = face / 3;
      // Scale the face cross product before rotating, including flat (zero-thickness) meshes.
      const nx = faceNormals[normal] * width * thickness;
      const ny = faceNormals[normal + 1] * length * thickness;
      const nz = faceNormals[normal + 2] * length * width;
      const inverseLength = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      const rotatedNormalY = nx * sin + ny * cos;
      const normalX = (nx * cos - ny * sin) * inverseLength;
      const normalY = (rotatedNormalY * ct - nz * st) * inverseLength;
      const normalZ = (rotatedNormalY * st + nz * ct) * inverseLength;
      for (let i = face; i < face + 9; i += 3) {
        const lx = vertices[i] * length;
        const ly = vertices[i + 1] * width;
        const lz = vertices[i + 2] * thickness;
        const rotatedY = lx * sin + ly * cos;
        const index = offset + i;
        this.positions[index] = x + lx * cos - ly * sin;
        this.positions[index + 1] = y + rotatedY * ct - lz * st;
        this.positions[index + 2] = z + rotatedY * st + lz * ct;
        this.normals[index] = normalX;
        this.normals[index + 1] = normalY;
        this.normals[index + 2] = normalZ;
        this.colors[index] = red;
        this.colors[index + 1] = green;
        this.colors[index + 2] = blue;
      }
    }
  }

  commit(): void {
    this.geometry.setDrawRange(0, this.vertexCount);
    this.mesh.visible = this.count > 0;
    if (!this.mesh.visible) return;
    // r108 counts scalar components here and resets the range after each GPU upload.
    for (const attribute of this.attributes) {
      attribute.updateRange.offset = 0;
      attribute.updateRange.count = this.vertexCount * 3;
      attribute.needsUpdate = true;
    }
  }

  dispose(): void { this.geometry.dispose(); this.material.dispose(); }
}
