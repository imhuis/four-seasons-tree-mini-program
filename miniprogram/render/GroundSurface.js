"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroundSurface = void 0;
const math_1 = require("../utils/math");
const SEGMENTS = 64;
const RADII = [0.08, 0.16, 0.25, 0.35, 0.46, 0.58, 0.72, 0.88, 1.06, 1.28, 1.55, 1.9, 2.4, 3];
const LEVEL = -0.005;
const STEP = math_1.TAU / SEGMENTS;
/** Static low-relief terrain; height queries interpolate the actual rendered triangles. */
class GroundSurface {
    constructor(three) {
        this.heightAt = (x, z) => {
            if (!Number.isFinite(x) || !Number.isFinite(z))
                return LEVEL;
            const radius = Math.hypot(x, z);
            if (radius < 1e-8)
                return LEVEL;
            const angle = (Math.atan2(z, x) + math_1.TAU) % math_1.TAU;
            const side = Math.min(SEGMENTS - 1, Math.floor(angle / STEP));
            const polygonRadius = radius * Math.cos(angle - (side + 0.5) * STEP) / Math.cos(STEP / 2);
            let ring = 0;
            while (ring < RADII.length && polygonRadius > RADII[ring])
                ring++;
            if (ring === RADII.length)
                return LEVEL;
            const outer = 1 + ring * SEGMENTS + side;
            const next = 1 + ring * SEGMENTS + (side + 1) % SEGMENTS;
            if (ring === 0)
                return this.triangleHeight(x, z, 0, next, outer);
            const inner = outer - SEGMENTS, innerNext = next - SEGMENTS;
            const height = this.triangleHeight(x, z, inner, next, outer, true);
            return Number.isNaN(height) ? this.triangleHeight(x, z, inner, innerNext, next) : height;
        };
        this.positions = new Float32Array((1 + RADII.length * SEGMENTS) * 3);
        this.positions[1] = LEVEL;
        const indices = [];
        for (let ring = 0; ring < RADII.length; ring++) {
            for (let side = 0; side < SEGMENTS; side++) {
                const id = 1 + ring * SEGMENTS + side;
                const angle = side * STEP;
                const x = Math.cos(angle) * RADII[ring], z = Math.sin(angle) * RADII[ring];
                const relief = (0, math_1.smoothstep)((RADII[ring] - 0.12) / 0.25) * (1 - (0, math_1.smoothstep)((RADII[ring] - 1.15) / 1.05));
                this.positions[id * 3] = x;
                this.positions[id * 3 + 1] = LEVEL + relief * (0.013 * Math.sin(x * 5.1 + z * 1.7) + 0.010 * Math.cos(z * 4.3 - x * 2.1));
                this.positions[id * 3 + 2] = z;
                const next = 1 + ring * SEGMENTS + (side + 1) % SEGMENTS;
                if (ring === 0)
                    indices.push(0, next, id);
                else {
                    const inner = id - SEGMENTS, innerNext = next - SEGMENTS;
                    indices.push(inner, next, id, inner, innerNext, next);
                }
            }
        }
        this.geometry = new three.BufferGeometry();
        this.geometry.addAttribute('position', new three.BufferAttribute(this.positions, 3));
        this.geometry.setIndex(new three.BufferAttribute(new Uint16Array(indices), 1));
        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingSphere();
        this.material = new three.ShaderMaterial({
            uniforms: {
                soil: { value: new three.Color() }, grass: { value: new three.Color() }, snowColor: { value: new three.Color() },
                snow: { value: 0 }, wetness: { value: 0 }, sun: { value: new three.Vector3() },
                shadowDirection: { value: new three.Vector2() }, shadowLength: { value: 0 }, shadowWidth: { value: 0.2 },
                shadowOpacity: { value: 0 }, canopy: { value: 0 }, contactSize: { value: 0.07 }, contactOpacity: { value: 0.2 },
            },
            vertexShader: `varying vec3 groundPoint; varying vec3 groundNormal;
        void main() { groundPoint = position; groundNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `
        uniform vec3 soil, grass, snowColor, sun; uniform float snow, wetness;
        uniform vec2 shadowDirection; uniform float shadowLength, shadowWidth, shadowOpacity, canopy, contactSize, contactOpacity;
        varying vec3 groundPoint; varying vec3 groundNormal;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
            mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          vec2 p = groundPoint.xz; float radius = length(p);
          float patch = noise(p * 4.0 + vec2(4.1, 8.3));
          float detail = noise(p * 14.0);
          float meadow = smoothstep(0.28, 0.66, patch) * smoothstep(0.08, 0.25, radius)
            * (1.0 - smoothstep(0.85, 1.65, radius));
          vec3 color = mix(soil, grass, meadow * 0.72) * (0.95 + detail * 0.09);
          color *= 1.0 - wetness * 0.16;
          float snowThreshold = 0.10 + patch * 0.55 + detail * 0.15 + max(0.0, groundPoint.y) * 3.0;
          float snowPatch = smoothstep(snowThreshold - 0.08, snowThreshold + 0.12, snow * 1.1);
          color = mix(color, snowColor * (0.97 + detail * 0.03), snowPatch);
          color *= 0.88 + 0.12 * max(0.0, dot(normalize(groundNormal), normalize(sun)));
          float along = dot(p, shadowDirection);
          float across = dot(p, vec2(-shadowDirection.y, shadowDirection.x));
          vec2 crown = vec2((along - shadowLength) / max(0.07, shadowWidth * 1.15), across / max(0.05, shadowWidth));
          float crownShadow = exp(-dot(crown, crown) * 2.0) * canopy;
          float stem = exp(-across * across / max(0.0002, contactSize * contactSize * 0.16))
            * smoothstep(-0.01, 0.04, along) * (1.0 - smoothstep(shadowLength * 0.6, max(0.07, shadowLength), along));
          float contact = exp(-dot(p, p) / max(0.0001, contactSize * contactSize));
          color *= 1.0 - max(crownShadow, stem * 0.6) * shadowOpacity - contact * contactOpacity;
          gl_FragColor = vec4(color, 1.0);
        }`,
        });
        this.mesh = new three.Mesh(this.geometry, this.material);
    }
    triangleHeight(x, z, a, b, c, check = false) {
        const p = this.positions;
        const ax = p[a * 3], az = p[a * 3 + 2], bx = p[b * 3], bz = p[b * 3 + 2], cx = p[c * 3], cz = p[c * 3 + 2];
        const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
        const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
        if (check && (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6))
            return NaN;
        return u * p[a * 3 + 1] + v * p[b * 3 + 1] + (1 - u - v) * p[c * 3 + 1];
    }
    dispose() { this.geometry.dispose(); this.material.dispose(); }
}
exports.GroundSurface = GroundSurface;
//# sourceMappingURL=GroundSurface.js.map