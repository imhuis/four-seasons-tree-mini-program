"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeshBatch = void 0;
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
function polygon(points) {
    const vertices = [];
    for (let i = 0; i < points.length; i += 2) {
        const next = (i + 2) % points.length;
        vertices.push(0, 0, 1, points[i], points[i + 1], 0, points[next], points[next + 1], 0, 0, 0, -1, points[next], points[next + 1], 0, points[i], points[i + 1], 0);
    }
    return vertices;
}
function lobes(count) {
    const points = [];
    for (let i = 0; i < count * 2; i++) {
        const angle = i * Math.PI / count;
        const radius = i % 2 === 0 ? 1 : 0.42;
        points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    return polygon(points);
}
const oval = [];
for (let i = 0; i < 10; i++)
    oval.push(Math.cos(i * Math.PI / 5), Math.sin(i * Math.PI / 5));
const fan = [-0.8, 0];
for (let i = 0; i <= 8; i++) {
    const angle = -Math.PI * 0.48 + i * Math.PI * 0.96 / 8;
    fan.push(-0.6 + Math.cos(angle) * 1.6, Math.sin(angle));
}
const TEMPLATES = {
    diamond: VERTICES, needle: VERTICES, oval: polygon(oval),
    maple: lobes(7), star: lobes(5), fan: polygon(fan),
};
function faceNormals(vertices) {
    const normals = [];
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
const FACE_NORMALS = {
    diamond: faceNormals(VERTICES), needle: faceNormals(VERTICES), oval: faceNormals(TEMPLATES.oval),
    maple: faceNormals(TEMPLATES.maple), star: faceNormals(TEMPLATES.star), fan: faceNormals(TEMPLATES.fan),
};
function leafSurface(points) {
    const vertices = [];
    const height = (x, y) => 0.24 * (1 - x * x) - 0.28 * y * y;
    for (let i = 0; i < points.length; i += 2) {
        const next = (i + 2) % points.length;
        vertices.push(0, 0, 0.24, points[i], points[i + 1], height(points[i], points[i + 1]), points[next], points[next + 1], height(points[next], points[next + 1]));
    }
    // A short petiole places the blade beyond the branch instead of floating around it.
    vertices.push(-1.28, -0.025, 0, -0.90, 0, 0, -1.28, 0.025, 0);
    return vertices;
}
const LEAF_TEMPLATES = {
    diamond: leafSurface([-1, 0, 0, -1, 1, 0, 0, 1]),
    needle: leafSurface([-1, 0, -0.4, -0.75, 1, 0, -0.4, 0.75]),
    oval: leafSurface([-1, 0, -0.7, -0.55, -0.3, -0.88, 0.15, -0.94, 0.57, -0.63, 1, 0,
        0.59, 0.60, 0.19, 0.92, -0.28, 0.89, -0.69, 0.56]),
    maple: leafSurface([-1, 0, -0.55, -0.22, -0.8, -0.5, -0.3, -0.55, -0.4, -0.96, 0, -0.58,
        0.38, -0.9, 0.40, -0.30, 1, 0, 0.40, 0.30, 0.38, 0.9, 0, 0.58,
        -0.4, 0.96, -0.3, 0.55, -0.8, 0.5, -0.55, 0.22]),
    star: leafSurface([-1, 0, -0.55, -0.23, -0.6, -0.82, -0.10, -0.43, 0.35, -1,
        0.40, -0.24, 1, 0, 0.40, 0.24, 0.35, 1, -0.10, 0.43, -0.6, 0.82, -0.55, 0.23]),
    fan: leafSurface([-1, 0, -0.20, -0.75, 0.35, -0.95, 0.65, -0.90, 0.95, -0.65, 1, -0.18,
        0.76, 0, 1, 0.18, 0.95, 0.65, 0.65, 0.90, 0.35, 0.95, -0.20, 0.75]),
};
const LEAF_NORMALS = {
    diamond: faceNormals(LEAF_TEMPLATES.diamond), needle: faceNormals(LEAF_TEMPLATES.needle),
    oval: faceNormals(LEAF_TEMPLATES.oval), maple: faceNormals(LEAF_TEMPLATES.maple),
    star: faceNormals(LEAF_TEMPLATES.star), fan: faceNormals(LEAF_TEMPLATES.fan),
};
/**
 * 颜色比较阈值：1/510。两个相邻 8 位色阶之间的一半。
 *
 * 为什么需要它：颜色来自季节曲线的连续插值，自动播放时每帧都在变，
 * 只是变得极慢（48 秒一轮，单帧位移约 0.09/255）。用严格相等判断永远命中不了，
 * 通道会照旧每帧重传。取半个色阶做阈值后，播放过程中颜色基本稳定在数组里，
 * 只有真正换季时才重传——几何通道照旧每帧更新，视觉上看不出差别。
 *
 * 误差有界：脏标记一旦置位就写入本帧的真实值，偏差不会跨帧累积。
 */
const COLOR_EPSILON = 1 / 510;
class MeshBatch {
    constructor(three, capacity, shape = 'diamond', surface = 'solid') {
        this.capacity = capacity;
        this.shape = shape;
        this.count = 0;
        this.vertexCount = 0;
        /** 本帧是否有颜色偏离上一帧上传值（见 COLOR_EPSILON）。 */
        this.colorDirty = false;
        /** 颜色是否至少上传过一次。首次必须传：GPU 缓冲区的初始内容是未定义的。 */
        this.colorUploaded = false;
        this.geometry = new three.BufferGeometry();
        this.templates = surface === 'leaf' ? LEAF_TEMPLATES : TEMPLATES;
        this.templateNormals = surface === 'leaf' ? LEAF_NORMALS : FACE_NORMALS;
        const vertices = shape === 'mixed' ? Math.max(...Object.values(this.templates).map(template => template.length / 3))
            : this.templates[shape].length / 3;
        this.positions = new Float32Array(capacity * vertices * 3);
        this.colors = new Float32Array(this.positions.length);
        this.normals = new Float32Array(this.positions.length);
        this.positionAttribute = new three.BufferAttribute(this.positions, 3).setDynamic(true);
        this.colorAttribute = new three.BufferAttribute(this.colors, 3).setDynamic(true);
        this.normalAttribute = new three.BufferAttribute(this.normals, 3).setDynamic(true);
        // 几何通道每帧都变；颜色单独走脏标记，不放进这个列表。
        const attributes = [this.positionAttribute, this.normalAttribute];
        this.geometry.addAttribute('position', this.positionAttribute);
        this.geometry.addAttribute('color', this.colorAttribute);
        this.geometry.addAttribute('normal', this.normalAttribute);
        this.uv = surface === 'leaf' ? new Float32Array(capacity * vertices * 2) : null;
        if (this.uv !== null) {
            const uvAttribute = new three.BufferAttribute(this.uv, 2);
            if (shape === 'mixed')
                attributes.push(uvAttribute.setDynamic(true));
            else {
                const template = this.templates[shape];
                for (let item = 0; item < capacity; item++) {
                    for (let i = 0; i < template.length; i += 3) {
                        const offset = (item * vertices + i / 3) * 2;
                        this.uv[offset] = template[i] * 0.5 + 0.5;
                        this.uv[offset + 1] = template[i + 1] * 0.5 + 0.5;
                    }
                }
            }
            this.geometry.addAttribute('uv', uvAttribute);
        }
        this.attributes = attributes;
        this.material = new three.MeshLambertMaterial({ vertexColors: three.VertexColors, side: three.DoubleSide });
        if (surface === 'leaf') {
            this.material.onBeforeCompile = shader => {
                shader.uniforms.treeLeafVeins = { value: shape === 'fan' ? 1 : shape === 'maple' || shape === 'star' ? 2 : 0 };
                shader.vertexShader = `varying vec2 treeLeafUv;\n${shader.vertexShader}`
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntreeLeafUv = uv;');
                shader.fragmentShader = `uniform float treeLeafVeins; varying vec2 treeLeafUv;\n${shader.fragmentShader}`
                    .replace('#include <color_fragment>', `#include <color_fragment>
            vec2 blade = treeLeafUv * 2.0 - 1.0;
            float midrib = 1.0 - smoothstep(0.012, 0.045, abs(blade.y));
            float ribs = 1.0 - smoothstep(0.015, 0.05, abs(fract((blade.x - abs(blade.y) * 0.85) * 4.0) - 0.5));
            float veins = max(midrib, ribs * 0.45) * (1.0 - smoothstep(0.65, 1.0, abs(blade.y)));
            if (treeLeafVeins > 0.5) {
              float angle = atan(blade.y, max(0.001, blade.x + 1.0));
              float rays = treeLeafVeins < 1.5 ? 18.0 : 6.0;
              veins = (1.0 - smoothstep(0.035, 0.13, abs(sin(angle * rays)))) * 0.65;
            }
            diffuseColor.rgb *= 0.90 + 0.10 * (1.0 - abs(blade.y)) + veins * 0.13;
            if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.12, 0.94), 0.5);`)
                    .replace('#include <envmap_fragment>', `
            vec3 transmittedLight = gl_FrontFacing ? vLightBack : vLightFront;
            outgoingLight += diffuseColor.rgb * transmittedLight * 0.12;
            #include <envmap_fragment>`);
            };
        }
        this.mesh = new three.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.geometry.setDrawRange(0, 0);
    }
    begin() {
        this.count = 0;
        this.vertexCount = 0;
        this.colorDirty = false;
    }
    write(x, y, z, length, width, thickness, rotation, tilt, color, tint = 0, shape = 'diamond', roll = 0) {
        if (this.count >= this.capacity || length <= 0)
            return;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);
        const cr = Math.cos(roll), sr = Math.sin(roll);
        const meshShape = this.shape === 'mixed' ? shape : this.shape;
        const vertices = this.templates[meshShape];
        const faceNormals = this.templateNormals[meshShape];
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
            const rolledNormalY = ny * cr - nz * sr;
            const rolledNormalZ = ny * sr + nz * cr;
            const rotatedNormalY = nx * sin + rolledNormalY * cos;
            const normalX = (nx * cos - rolledNormalY * sin) * inverseLength;
            const normalY = (rotatedNormalY * ct - rolledNormalZ * st) * inverseLength;
            const normalZ = (rotatedNormalY * st + rolledNormalZ * ct) * inverseLength;
            for (let i = face; i < face + 9; i += 3) {
                const lx = vertices[i] * length;
                const ly = vertices[i + 1] * width * cr - vertices[i + 2] * thickness * sr;
                const lz = vertices[i + 1] * width * sr + vertices[i + 2] * thickness * cr;
                const rotatedY = lx * sin + ly * cos;
                const index = offset + i;
                this.positions[index] = x + lx * cos - ly * sin;
                this.positions[index + 1] = y + rotatedY * ct - lz * st;
                this.positions[index + 2] = z + rotatedY * st + lz * ct;
                this.normals[index] = normalX;
                this.normals[index + 1] = normalY;
                this.normals[index + 2] = normalZ;
                // 与数组里"上次真正上传过"的值比对，而不是无条件重写再重传。
                if (Math.abs(this.colors[index] - red) > COLOR_EPSILON
                    || Math.abs(this.colors[index + 1] - green) > COLOR_EPSILON
                    || Math.abs(this.colors[index + 2] - blue) > COLOR_EPSILON) {
                    this.colorDirty = true;
                    this.colors[index] = red;
                    this.colors[index + 1] = green;
                    this.colors[index + 2] = blue;
                }
                if (this.uv !== null && this.shape === 'mixed') {
                    this.uv[index / 3 * 2] = vertices[i] * 0.5 + 0.5;
                    this.uv[index / 3 * 2 + 1] = vertices[i + 1] * 0.5 + 0.5;
                }
            }
        }
    }
    commit() {
        this.geometry.setDrawRange(0, this.vertexCount);
        this.mesh.visible = this.count > 0;
        if (!this.mesh.visible)
            return;
        // r108 counts scalar components here and resets the range after each GPU upload.
        for (const attribute of this.attributes) {
            attribute.updateRange.offset = 0;
            attribute.updateRange.count = this.vertexCount * attribute.itemSize;
            attribute.needsUpdate = true;
        }
        // 颜色脏标记跨帧保留：这一帧没变就不重传，GPU 缓冲里仍是上次那一份正确数据。
        // 顶点数量变了也不受影响——缩量只是 drawRange 变小，缓冲区内容依旧有效。
        if (this.colorDirty || !this.colorUploaded) {
            this.colorDirty = false;
            this.colorUploaded = true;
            this.colorAttribute.updateRange.offset = 0;
            this.colorAttribute.updateRange.count = this.vertexCount * this.colorAttribute.itemSize;
            this.colorAttribute.needsUpdate = true;
        }
    }
    dispose() { this.geometry.dispose(); this.material.dispose(); }
}
exports.MeshBatch = MeshBatch;
//# sourceMappingURL=MeshBatch.js.map