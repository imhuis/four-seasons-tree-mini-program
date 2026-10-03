"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchSystem = void 0;
const math_1 = require("../utils/math");
const RINGS = 7;
const SIDES = 8;
const SIDE_COS = [];
const SIDE_SIN = [];
for (let side = 0; side <= SIDES; side++) {
    SIDE_COS.push(Math.cos(side * math_1.TAU / SIDES));
    SIDE_SIN.push(Math.sin(side * math_1.TAU / SIDES));
}
/** All curved, tapered branch tubes share a single indexed geometry. */
class BranchSystem {
    constructor(three, trunk) {
        this.trunk = trunk;
        this.point = { x: 0, y: 0, z: 0 };
        this.tangent = { x: 0, y: 0, z: 0 };
        this.trunkColor = [-1, -1, -1];
        const vertexCount = trunk.count * RINGS * (SIDES + 1);
        this.positions = new Float32Array(vertexCount * 3);
        this.normals = new Float32Array(vertexCount * 3);
        this.colors = new Float32Array(vertexCount * 3);
        const uv = new Float32Array(vertexCount * 2);
        const indices = new Uint16Array(trunk.count * (RINGS - 1) * SIDES * 6);
        let cursor = 0;
        for (let branch = 0; branch < trunk.count; branch++) {
            const b = trunk.branches[branch];
            const length = Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
            for (let ring = 0; ring < RINGS; ring++) {
                for (let side = 0; side <= SIDES; side++) {
                    const index = (branch * RINGS * (SIDES + 1) + ring * (SIDES + 1) + side) * 2;
                    uv[index] = side / SIDES;
                    uv[index + 1] = ring / (RINGS - 1) * length * 32 + b.phase;
                }
            }
            for (let ring = 0; ring < RINGS - 1; ring++) {
                for (let side = 0; side < SIDES; side++) {
                    const a = branch * RINGS * (SIDES + 1) + ring * (SIDES + 1) + side;
                    const b = a + SIDES + 1;
                    indices.set([a, b, a + 1, b, b + 1, a + 1], cursor);
                    cursor += 6;
                }
            }
        }
        this.geometry = new three.BufferGeometry();
        this.positionAttribute = new three.BufferAttribute(this.positions, 3).setDynamic(true);
        this.normalAttribute = new three.BufferAttribute(this.normals, 3).setDynamic(true);
        this.colorAttribute = new three.BufferAttribute(this.colors, 3).setDynamic(true);
        this.geometry.addAttribute('position', this.positionAttribute);
        this.geometry.addAttribute('normal', this.normalAttribute);
        this.geometry.addAttribute('color', this.colorAttribute);
        this.geometry.addAttribute('uv', new three.BufferAttribute(uv, 2));
        this.geometry.setIndex(new three.BufferAttribute(indices, 1));
        this.material = new three.MeshLambertMaterial({ vertexColors: three.VertexColors, side: three.DoubleSide });
        this.material.onBeforeCompile = shader => {
            shader.uniforms.treeBarkStyle = { value: trunk.preset.bark === 'birch' ? 1 : trunk.preset.bark === 'mottled' ? 2 : 0 };
            shader.vertexShader = `varying vec2 treeBarkUv;\n${shader.vertexShader}`
                .replace('#include <begin_vertex>', '#include <begin_vertex>\ntreeBarkUv = uv;');
            shader.fragmentShader = `uniform float treeBarkStyle; varying vec2 treeBarkUv;\n${shader.fragmentShader}`
                .replace('#include <color_fragment>', `#include <color_fragment>
          float grain = sin(treeBarkUv.x * 87.9646 + sin(treeBarkUv.y * 0.7) * 0.55);
          float grooves = smoothstep(0.72, 0.98, grain);
          float roughness = 0.95 + 0.05 * sin(treeBarkUv.y * 8.0 + treeBarkUv.x * 138.2301);
          if (treeBarkStyle < 0.5) {
            diffuseColor.rgb *= roughness - grooves * 0.18;
          } else if (treeBarkStyle < 1.5) {
            float lenticels = smoothstep(0.87, 0.99, sin(treeBarkUv.y * 9.0 + sin(treeBarkUv.x * 12.5664)))
              * smoothstep(0.1, 0.7, sin(treeBarkUv.x * 31.4159 + treeBarkUv.y));
            diffuseColor.rgb *= roughness - lenticels * 0.52;
          } else {
            float patches = sin(treeBarkUv.y * 1.8 + sin(treeBarkUv.x * 18.8496));
            diffuseColor.rgb *= 0.9 + patches * 0.1 - grooves * 0.04;
          }`);
        };
        this.snowMaterial = new three.ShaderMaterial({
            uniforms: { amount: { value: 0 }, brightness: { value: 1 } },
            vertexShader: 'varying vec3 rimNormal; void main() { rimNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'uniform float amount; uniform float brightness; varying vec3 rimNormal; void main() { float cover = smoothstep(0.15, 0.7, rimNormal.y) * amount; if (cover < 0.01) discard; gl_FragColor = vec4(vec3(0.99, 0.99, 0.97) * brightness, cover); }',
            transparent: true, depthWrite: false, side: three.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        });
        this.group = new three.Group();
        const wood = new three.Mesh(this.geometry, this.material);
        const snow = new three.Mesh(this.geometry, this.snowMaterial);
        wood.frustumCulled = snow.frustumCulled = false;
        this.group.add(wood, snow);
    }
    update(state, thickness = 1, brightness = 1) {
        const trunk = this.trunk;
        const bark = trunk.preset.bark;
        const updateColors = bark !== 'plain' || state.trunkColor[0] !== this.trunkColor[0]
            || state.trunkColor[1] !== this.trunkColor[1] || state.trunkColor[2] !== this.trunkColor[2];
        const red = state.trunkColor[0] / 255, green = state.trunkColor[1] / 255, blue = state.trunkColor[2] / 255;
        for (let id = 0; id < trunk.count; id++) {
            const b = trunk.branches[id];
            const branchThickness = trunk.branchGrowth(id) * thickness;
            for (let ring = 0; ring < RINGS; ring++) {
                const t = ring / (RINGS - 1);
                trunk.samplePosition(id, t, this.point);
                trunk.sampleTangent(id, t, this.tangent);
                let tx = this.tangent.x, ty = this.tangent.y, tz = this.tangent.z;
                if (tx === 0 && ty === 0 && tz === 0)
                    ty = 1;
                const length = Math.hypot(tx, ty, tz) || 1;
                tx /= length;
                ty /= length;
                tz /= length;
                const refZ = Math.abs(tz) < 0.9;
                let ux = refZ ? ty : 0;
                let uy = refZ ? -tx : tz;
                let uz = refZ ? 0 : -ty;
                const uLength = Math.hypot(ux, uy, uz) || 1;
                ux /= uLength;
                uy /= uLength;
                uz /= uLength;
                const vx = ty * uz - tz * uy;
                const vy = tz * ux - tx * uz;
                const vz = tx * uy - ty * ux;
                const rootFlare = b.parent < 0 ? 1 + Math.max(0, 1 - t * 5) * 0.24 : 1;
                const radius = (b.w0 + (b.w1 - b.w0) * t) * branchThickness * rootFlare;
                for (let side = 0; side <= SIDES; side++) {
                    const nx = ux * SIDE_COS[side] + vx * SIDE_SIN[side];
                    const ny = uy * SIDE_COS[side] + vy * SIDE_SIN[side];
                    const nz = uz * SIDE_COS[side] + vz * SIDE_SIN[side];
                    const index = (id * RINGS * (SIDES + 1) + ring * (SIDES + 1) + side) * 3;
                    this.positions[index] = this.point.x + nx * radius;
                    this.positions[index + 1] = this.point.y + ny * radius;
                    this.positions[index + 2] = this.point.z + nz * radius;
                    this.normals[index] = nx;
                    this.normals[index + 1] = ny;
                    this.normals[index + 2] = nz;
                    if (updateColors) {
                        const pattern = bark !== 'plain' && b.w0 > 0.006
                            ? Math.sin(this.point.y * 90 + side * 1.5) * Math.cos(side * 2 + id) : 0;
                        const tint = b.w0 > 0.006 ? bark === 'birch' && pattern > 0.28 ? 0.3 : bark === 'mottled' ? 0.8 + pattern * 0.18 : 1 : 1;
                        this.colors[index] = red * tint;
                        this.colors[index + 1] = green * tint;
                        this.colors[index + 2] = blue * tint;
                    }
                }
            }
        }
        this.positionAttribute.needsUpdate = this.normalAttribute.needsUpdate = true;
        if (updateColors) {
            for (let channel = 0; channel < 3; channel++)
                this.trunkColor[channel] = state.trunkColor[channel];
            this.colorAttribute.needsUpdate = true;
        }
        this.snowMaterial.uniforms.amount.value = state.snowAmount;
        this.snowMaterial.uniforms.brightness.value = brightness;
        this.group.children[1].visible = state.snowAmount > 0.01;
    }
    dispose() { this.geometry.dispose(); this.material.dispose(); this.snowMaterial.dispose(); }
}
exports.BranchSystem = BranchSystem;
//# sourceMappingURL=BranchSystem.js.map