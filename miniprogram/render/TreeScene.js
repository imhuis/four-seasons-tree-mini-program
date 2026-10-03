"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreeScene = void 0;
const math_1 = require("../utils/math");
const three_1 = require("../vendor/three");
const BranchSystem_1 = require("./BranchSystem");
const FlowerSystem_1 = require("./FlowerSystem");
const LeafSystem_1 = require("./LeafSystem");
const ParticleSystem_1 = require("./ParticleSystem");
const SeasonController_1 = require("./SeasonController");
const SnowSystem_1 = require("./SnowSystem");
const TreeTrunk_1 = require("./TreeTrunk");
const TreePresets_1 = require("./TreePresets");
const GrowthController_1 = require("./GrowthController");
const EnvironmentController_1 = require("./EnvironmentController");
const FruitSystem_1 = require("./FruitSystem");
const RainSystem_1 = require("./RainSystem");
const MeshBatch_1 = require("./MeshBatch");
const MAX_DPR = 2;
const MAX_DELTA = 0.05;
const HUD_INTERVAL_MS = 120;
/** Owns the canvas-scoped engine, GPU resources, camera and animation lifecycle. */
class TreeScene {
    constructor() {
        this.seasons = new SeasonController_1.SeasonController();
        this.trunk = new TreeTrunk_1.TreeTrunk();
        this.growth = new GrowthController_1.GrowthController();
        this.environment = new EnvironmentController_1.EnvironmentController();
        this.three = null;
        this.treeGroup = null;
        this.sunlight = null;
        this.ambient = null;
        this.fruits = null;
        this.seed = null;
        this.rain = null;
        this.growthProgress = 0.75;
        this.growthPlaying = false;
        this.timeProgress = 0.5;
        this.dayPlaying = false;
        this.cssWidth = 0;
        this.cssHeight = 0;
        this.canvas = null;
        this.renderer = null;
        this.world = null;
        this.camera = null;
        this.sky = null;
        this.skyCamera = null;
        this.skyMesh = null;
        this.skyMaterial = null;
        this.ground = null;
        this.groundMaterial = null;
        this.groundSnow = null;
        this.groundSnowMaterial = null;
        this.shadow = null;
        this.shadowMaterial = null;
        this.branches = null;
        this.leaves = null;
        this.flowers = null;
        this.particles = null;
        this.snow = null;
        this.seasonProgress = 0;
        this.elapsed = 0;
        this.lastTick = 0;
        this.frameHandle = 0;
        this.running = false;
        this.playing = false;
        this.lastHudAt = 0;
        this.lastHud = null;
        this.leafAccumulator = 0;
        this.petalAccumulator = 0;
        this.azimuth = 0.45;
        this.elevation = 0.16;
        this.distance = 1.8;
        this.zoom = 1;
        this.source = { x: 0, y: 0, z: 0, size: 0, tint: 0 };
        this.onHudUpdate = null;
        this.tick = () => {
            if (!this.running || this.canvas === null)
                return;
            const now = Date.now();
            const delta = this.lastTick === 0 ? 1 / 60 : (0, math_1.clamp)((now - this.lastTick) / 1000, 0, MAX_DELTA);
            this.lastTick = now;
            this.elapsed += delta;
            this.update(delta);
            this.render();
            this.pushHud(false);
            if (this.running && this.canvas !== null)
                this.frameHandle = this.canvas.requestAnimationFrame(this.tick);
        };
    }
    attach(canvas, cssWidth, cssHeight) {
        if (this.canvas !== null)
            throw new Error('Scene is already attached');
        if (!(cssWidth > 0 && cssHeight > 0))
            throw new Error('Canvas has no visible size');
        this.canvas = canvas;
        try {
            const three = (0, three_1.createScopedThreejs)(canvas);
            this.three = three;
            // The adapter's document.createElementNS returns this canvas. Avoid browser globals.
            this.renderer = new three.WebGLRenderer({ antialias: true, alpha: false, stencil: false });
            this.renderer.autoClear = false;
            this.world = new three.Scene();
            this.camera = new three.PerspectiveCamera(36, cssWidth / cssHeight, 0.02, 30);
            this.ambient = new three.HemisphereLight(0xfffbef, 0x8d9a86, 0.65);
            this.world.add(this.ambient);
            const sun = new three.DirectionalLight(0xfff5df, 0.65);
            sun.position.set(-2, 3, 4);
            this.sunlight = sun;
            this.world.add(sun);
            this.sky = new three.Scene();
            this.skyCamera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            this.skyMaterial = new three.ShaderMaterial({
                uniforms: { top: { value: new three.Color() }, bottom: { value: new three.Color() }, night: { value: 0 }, aspect: { value: 1 } },
                vertexShader: 'varying vec2 skyUv; void main() { skyUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float night; uniform float aspect; varying vec2 skyUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 color = mix(bottom, top, skyUv.y);
            vec2 cell = skyUv * vec2(65.0, 100.0);
            float star = step(0.985, hash(floor(cell))) * (1.0 - smoothstep(0.0, 0.11, length(fract(cell) - 0.5)));
            float moon = 1.0 - smoothstep(0.028, 0.031, length((skyUv - vec2(0.82, 0.83)) * vec2(aspect, 1.0)));
            color += vec3(0.75, 0.79, 0.84) * (star + moon * 0.8) * night;
            gl_FragColor = vec4(color, 1.0);
          }`,
                depthTest: false, depthWrite: false,
            });
            this.skyMesh = new three.Mesh(new three.PlaneBufferGeometry(2, 2), this.skyMaterial);
            this.sky.add(this.skyMesh);
            // Keep the broad ground area on the season palette; light only the 3D details.
            this.groundMaterial = new three.MeshBasicMaterial({ color: 0xd6cab4 });
            this.ground = new three.Mesh(new three.CircleBufferGeometry(3, 64), this.groundMaterial);
            this.ground.rotation.x = -Math.PI / 2;
            this.ground.position.y = -0.005;
            this.world.add(this.ground);
            this.groundSnowMaterial = new three.MeshBasicMaterial({ color: 0xfcfcfa, transparent: true, opacity: 0, depthWrite: false });
            this.groundSnow = new three.Mesh(new three.CircleBufferGeometry(3, 64), this.groundSnowMaterial);
            this.groundSnow.rotation.x = -Math.PI / 2;
            this.groundSnow.position.y = -0.003;
            this.world.add(this.groundSnow);
            this.shadowMaterial = new three.MeshBasicMaterial({ color: 0x5c5845, transparent: true, opacity: 0.10, depthWrite: false });
            this.shadow = new three.Mesh(new three.CircleBufferGeometry(0.25, 40), this.shadowMaterial);
            this.shadow.rotation.x = -Math.PI / 2;
            this.shadow.position.y = -0.001;
            this.shadow.scale.set(1, 0.8, 1);
            this.world.add(this.shadow);
            this.treeGroup = new three.Group();
            this.world.add(this.treeGroup);
            this.installTree(three, this.trunk);
            this.seed = new MeshBatch_1.MeshBatch(three, 1, 'oval');
            this.particles = new ParticleSystem_1.ParticleSystem(three);
            this.snow = new SnowSystem_1.SnowSystem(three, this.particles);
            this.rain = new RainSystem_1.RainSystem(this.particles);
            this.world.add(this.seed.mesh, this.particles.batch.mesh, this.snow.batch.mesh);
            this.resize(cssWidth, cssHeight);
        }
        catch (error) {
            this.destroy();
            throw error;
        }
    }
    resize(cssWidth, cssHeight) {
        if (this.renderer === null || this.camera === null || !(cssWidth > 0 && cssHeight > 0))
            return;
        this.cssWidth = cssWidth;
        this.cssHeight = cssHeight;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this.renderer.setPixelRatio((0, math_1.clamp)(info.pixelRatio || 1, 1, MAX_DPR));
        this.renderer.setSize(cssWidth, cssHeight, false);
        this.camera.aspect = cssWidth / cssHeight;
        if (this.skyMaterial !== null)
            this.skyMaterial.uniforms.aspect.value = this.camera.aspect;
        this.camera.updateProjectionMatrix();
        const bounds = this.trunk.bounds;
        let radius = 0;
        for (const b of this.trunk.branches) {
            radius = Math.max(radius, Math.hypot(b.x0, b.z0), Math.hypot(b.cx, b.cz), Math.hypot(b.x1, b.z1));
        }
        radius += 0.065;
        const halfFov = this.camera.fov * Math.PI / 360;
        this.distance = Math.max(bounds.maxY * 0.64 / Math.tan(halfFov), radius * 1.10 / (Math.tan(halfFov) * this.camera.aspect)) + radius * 0.35;
        this.updateCamera();
        this.renderOnce();
    }
    rotateView(dx, dy) {
        if (!Number.isFinite(dx) || !Number.isFinite(dy))
            return;
        this.azimuth -= dx * 0.008;
        this.elevation = (0, math_1.clamp)(this.elevation + dy * 0.005, 0.04, 0.65);
        this.updateCamera();
    }
    zoomView(ratio) {
        if (!Number.isFinite(ratio) || ratio <= 0)
            return;
        this.zoom = (0, math_1.clamp)(this.zoom / ratio, 0.72, 1.65);
        this.updateCamera();
    }
    updateCamera() {
        const camera = this.camera;
        if (camera === null)
            return;
        const targetY = this.trunk.bounds.maxY * 0.43;
        const radius = this.distance * this.zoom;
        camera.position.set(Math.sin(this.azimuth) * Math.cos(this.elevation) * radius, targetY + Math.sin(this.elevation) * radius, Math.cos(this.azimuth) * Math.cos(this.elevation) * radius);
        camera.lookAt(0, targetY, 0);
    }
    start() {
        if (this.running || this.canvas === null)
            return;
        this.running = true;
        this.lastTick = 0;
        this.frameHandle = this.canvas.requestAnimationFrame(this.tick);
    }
    stop() {
        this.running = false;
        if (this.canvas !== null && this.frameHandle !== 0)
            this.canvas.cancelAnimationFrame(this.frameHandle);
        this.frameHandle = 0;
        this.lastTick = 0;
    }
    destroy() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        this.stop();
        (_a = this.branches) === null || _a === void 0 ? void 0 : _a.dispose();
        (_b = this.leaves) === null || _b === void 0 ? void 0 : _b.dispose();
        (_c = this.flowers) === null || _c === void 0 ? void 0 : _c.dispose();
        (_d = this.fruits) === null || _d === void 0 ? void 0 : _d.dispose();
        (_e = this.seed) === null || _e === void 0 ? void 0 : _e.dispose();
        (_f = this.particles) === null || _f === void 0 ? void 0 : _f.dispose();
        (_g = this.snow) === null || _g === void 0 ? void 0 : _g.dispose();
        (_h = this.ground) === null || _h === void 0 ? void 0 : _h.geometry.dispose();
        (_j = this.groundMaterial) === null || _j === void 0 ? void 0 : _j.dispose();
        (_k = this.groundSnow) === null || _k === void 0 ? void 0 : _k.geometry.dispose();
        (_l = this.groundSnowMaterial) === null || _l === void 0 ? void 0 : _l.dispose();
        (_m = this.shadow) === null || _m === void 0 ? void 0 : _m.geometry.dispose();
        (_o = this.shadowMaterial) === null || _o === void 0 ? void 0 : _o.dispose();
        (_p = this.skyMesh) === null || _p === void 0 ? void 0 : _p.geometry.dispose();
        (_q = this.skyMaterial) === null || _q === void 0 ? void 0 : _q.dispose();
        (_r = this.renderer) === null || _r === void 0 ? void 0 : _r.dispose();
        (_s = this.renderer) === null || _s === void 0 ? void 0 : _s.forceContextLoss();
        this.canvas = null;
        this.renderer = null;
        this.world = null;
        this.camera = null;
        this.sky = null;
        this.skyCamera = null;
        this.skyMesh = null;
        this.skyMaterial = null;
        this.ground = null;
        this.groundMaterial = null;
        this.groundSnow = null;
        this.groundSnowMaterial = null;
        this.shadow = null;
        this.shadowMaterial = null;
        this.branches = null;
        this.leaves = null;
        this.flowers = null;
        this.particles = null;
        this.snow = null;
        this.fruits = null;
        this.seed = null;
        this.rain = null;
        this.treeGroup = null;
        this.three = null;
        this.sunlight = null;
        this.ambient = null;
        this.onHudUpdate = null;
        this.lastHud = null;
    }
    setSeasonProgress(progress) {
        var _a, _b, _c;
        if (!Number.isFinite(progress))
            return;
        const next = (0, math_1.wrap01)(progress);
        const gap = Math.abs(next - this.seasonProgress);
        if (Math.min(gap, 1 - gap) > 0.08) {
            (_a = this.particles) === null || _a === void 0 ? void 0 : _a.clear();
            (_b = this.snow) === null || _b === void 0 ? void 0 : _b.reset();
            this.leafAccumulator = this.petalAccumulator = 0;
            this.environment.resetSnow();
            (_c = this.rain) === null || _c === void 0 ? void 0 : _c.reset();
        }
        this.seasonProgress = next;
        this.playing = false;
        this.update(0);
        this.pushHud(true);
    }
    getProgress() { return this.seasonProgress; }
    setAutoPlay(playing) { this.playing = playing; this.pushHud(true); }
    get autoPlaying() { return this.playing; }
    getSnapshot() {
        const state = this.seasons.state;
        return { progress: this.seasonProgress, seasonIndex: state.seasonIndex, phaseIndex: state.phaseIndex, playing: this.playing,
            presetId: this.trunk.preset.id, growthProgress: this.growthProgress, growthStageIndex: this.growth.update(this.growthProgress).stageIndex,
            growthPlaying: this.growthPlaying, timeProgress: this.timeProgress, dayPlaying: this.dayPlaying,
            weather: this.environment.weather, weatherIntensity: this.environment.intensity, lightIntensity: this.environment.light };
    }
    setTreePreset(id) {
        var _a, _b, _c;
        const preset = (0, TreePresets_1.treePresetById)(id);
        if (preset === undefined)
            return false;
        if (preset.id === this.trunk.preset.id)
            return true;
        const trunk = new TreeTrunk_1.TreeTrunk(20261003, preset);
        if (this.three !== null)
            this.installTree(this.three, trunk);
        this.trunk = trunk;
        this.seasons.setPreset(preset);
        (_a = this.particles) === null || _a === void 0 ? void 0 : _a.clear();
        (_b = this.snow) === null || _b === void 0 ? void 0 : _b.reset();
        (_c = this.rain) === null || _c === void 0 ? void 0 : _c.reset();
        this.leafAccumulator = this.petalAccumulator = 0;
        if (this.renderer !== null)
            this.resize(this.cssWidth, this.cssHeight);
        else
            this.update(0);
        this.pushHud(true);
        return true;
    }
    /** Allocate the replacement before disposing the visible model. */
    installTree(three, trunk) {
        var _a, _b, _c, _d;
        let branches = null, leaves = null;
        let flowers = null, fruits = null;
        try {
            branches = new BranchSystem_1.BranchSystem(three, trunk);
            leaves = new LeafSystem_1.LeafSystem(three, trunk);
            flowers = new FlowerSystem_1.FlowerSystem(three, trunk);
            fruits = new FruitSystem_1.FruitSystem(three, trunk);
        }
        catch (error) {
            branches === null || branches === void 0 ? void 0 : branches.dispose();
            leaves === null || leaves === void 0 ? void 0 : leaves.dispose();
            flowers === null || flowers === void 0 ? void 0 : flowers.dispose();
            fruits === null || fruits === void 0 ? void 0 : fruits.dispose();
            throw error;
        }
        const group = this.treeGroup;
        if (group !== null)
            while (group.children.length > 0)
                group.remove(group.children[0]);
        (_a = this.branches) === null || _a === void 0 ? void 0 : _a.dispose();
        (_b = this.leaves) === null || _b === void 0 ? void 0 : _b.dispose();
        (_c = this.flowers) === null || _c === void 0 ? void 0 : _c.dispose();
        (_d = this.fruits) === null || _d === void 0 ? void 0 : _d.dispose();
        this.branches = branches;
        this.leaves = leaves;
        this.flowers = flowers;
        this.fruits = fruits;
        group === null || group === void 0 ? void 0 : group.add(branches.group, leaves.batch.mesh, flowers.batch.mesh, fruits.batch.mesh);
    }
    setGrowthProgress(value) {
        var _a;
        if (!Number.isFinite(value))
            return;
        const next = (0, math_1.clamp)(value, 0, 1);
        if (Math.abs(next - this.growthProgress) > 0.08)
            (_a = this.particles) === null || _a === void 0 ? void 0 : _a.clear();
        this.growthProgress = next;
        this.growthPlaying = false;
        this.update(0);
        this.pushHud(true);
    }
    setGrowthPlay(playing) {
        if (playing && this.growthProgress >= 1)
            this.growthProgress = 0;
        this.growthPlaying = playing;
        this.pushHud(true);
    }
    setTimeProgress(value) {
        if (!Number.isFinite(value))
            return;
        this.timeProgress = (0, math_1.wrap01)(value);
        this.dayPlaying = false;
        this.update(0);
        this.pushHud(true);
    }
    setDayPlay(playing) { this.dayPlaying = playing; this.pushHud(true); }
    setWeather(mode) {
        var _a, _b, _c;
        if (!this.environment.setWeather(mode))
            return false;
        (_a = this.particles) === null || _a === void 0 ? void 0 : _a.clear();
        (_b = this.snow) === null || _b === void 0 ? void 0 : _b.reset();
        (_c = this.rain) === null || _c === void 0 ? void 0 : _c.reset();
        this.update(0);
        this.pushHud(true);
        return true;
    }
    setWeatherIntensity(value) { this.environment.setIntensity(value); this.update(0); this.pushHud(true); }
    setLightIntensity(value) { this.environment.setLight(value); this.update(0); this.pushHud(true); }
    renderOnce() { this.update(0); this.render(); }
    update(delta) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (this.playing)
            this.seasonProgress = (0, math_1.wrap01)(this.seasonProgress + delta / 48);
        if (this.growthPlaying) {
            this.growthProgress = Math.min(1, this.growthProgress + delta / 90);
            if (this.growthProgress >= 1)
                this.growthPlaying = false;
        }
        if (this.dayPlaying)
            this.timeProgress = (0, math_1.wrap01)(this.timeProgress + delta / 120);
        const state = this.seasons.update(this.seasonProgress);
        const growth = this.growth.update(this.growthProgress);
        const environment = this.environment.update(this.timeProgress, state, delta);
        state.leafAmount *= growth.foliage;
        state.flowerAmount *= growth.maturity;
        state.fruitAmount *= growth.maturity;
        state.fallingLeafRate *= growth.foliage;
        state.petalRate *= growth.maturity;
        state.snowAmount = environment.snowCover;
        state.snowRate = environment.snowRate;
        state.windStrength = environment.windStrength;
        this.trunk.setGrowth(this.growthProgress);
        this.trunk.updateSway(this.elapsed, state.windStrength);
        (_a = this.treeGroup) === null || _a === void 0 ? void 0 : _a.scale.setScalar(growth.scale);
        if (this.treeGroup !== null)
            this.treeGroup.visible = this.growthProgress > 0;
        if (this.shadow !== null) {
            const shadowScale = Math.max(0.15, growth.scale);
            this.shadow.scale.set(shadowScale, shadowScale * 0.8, 1);
        }
        (_b = this.branches) === null || _b === void 0 ? void 0 : _b.update(state, growth.thickness, 0.35 + 0.65 * environment.daylight);
        (_c = this.leaves) === null || _c === void 0 ? void 0 : _c.update(this.elapsed, state);
        (_d = this.flowers) === null || _d === void 0 ? void 0 : _d.update(state);
        (_e = this.fruits) === null || _e === void 0 ? void 0 : _e.update(state);
        if (this.seed !== null) {
            this.seed.begin();
            this.seed.write(0, 0.012, 0, 0.025 * growth.seedAmount, 0.014 * growth.seedAmount, 0.012 * growth.seedAmount, 0, 0, TreePresets_1.DEFAULT_TREE_PRESET.trunkColor);
            this.seed.commit();
        }
        this.leafAccumulator = Math.min(4, this.leafAccumulator + state.fallingLeafRate * delta);
        this.petalAccumulator = Math.min(4, this.petalAccumulator + state.petalRate * delta);
        while (this.leafAccumulator >= 1) {
            this.leafAccumulator--;
            if ((_f = this.leaves) === null || _f === void 0 ? void 0 : _f.pickSource(Math.random(), this.elapsed, state, this.source)) {
                this.scaleSource(growth.scale);
                (_g = this.particles) === null || _g === void 0 ? void 0 : _g.emit('leaf', this.source, state);
            }
        }
        while (this.petalAccumulator >= 1) {
            this.petalAccumulator--;
            if ((_h = this.flowers) === null || _h === void 0 ? void 0 : _h.pickSource(Math.random(), this.source)) {
                this.scaleSource(growth.scale);
                (_j = this.particles) === null || _j === void 0 ? void 0 : _j.emit('petal', this.source, state);
            }
        }
        (_k = this.snow) === null || _k === void 0 ? void 0 : _k.update(delta, this.trunk.bounds.maxY, state);
        (_l = this.rain) === null || _l === void 0 ? void 0 : _l.update(delta, this.trunk.bounds.maxY, environment.rainRate, state);
        (_m = this.particles) === null || _m === void 0 ? void 0 : _m.update(delta, this.elapsed, state);
        this.applyEnvironment(state, environment);
    }
    scaleSource(scale) {
        this.source.x *= scale;
        this.source.y *= scale;
        this.source.z *= scale;
        this.source.size *= scale;
    }
    applyEnvironment(state, environment) {
        var _a;
        if (this.skyMaterial !== null) {
            this.skyMaterial.uniforms.top.value.setRGB(environment.skyTop[0] / 255, environment.skyTop[1] / 255, environment.skyTop[2] / 255);
            this.skyMaterial.uniforms.bottom.value.setRGB(environment.skyBottom[0] / 255, environment.skyBottom[1] / 255, environment.skyBottom[2] / 255);
            this.skyMaterial.uniforms.night.value = 1 - environment.daylight;
        }
        if (this.ambient !== null)
            this.ambient.intensity = environment.ambientIntensity;
        if (this.sunlight !== null) {
            this.sunlight.intensity = environment.lightIntensity;
            this.sunlight.position.set(Math.cos(environment.sunAngle) * 3, Math.max(0.4, Math.sin(environment.sunAngle) * 4), 3);
            this.sunlight.color.setRGB(1 - (1 - environment.daylight) * 0.45, 0.94, 0.88 + (1 - environment.daylight) * 0.12);
        }
        (_a = this.groundMaterial) === null || _a === void 0 ? void 0 : _a.color.setRGB(environment.groundColor[0] / 255, environment.groundColor[1] / 255, environment.groundColor[2] / 255);
        if (this.groundSnowMaterial !== null) {
            this.groundSnowMaterial.opacity = state.snowAmount * 0.85;
            const brightness = 0.35 + environment.daylight * 0.65;
            this.groundSnowMaterial.color.setRGB(brightness, brightness, brightness);
        }
        if (this.groundSnow !== null)
            this.groundSnow.visible = state.snowAmount > 0.01;
        if (this.shadowMaterial !== null)
            this.shadowMaterial.opacity = 0.10 * environment.daylight * (1 - state.snowAmount * 0.5);
    }
    render() {
        if (this.renderer === null || this.world === null || this.camera === null || this.sky === null || this.skyCamera === null)
            return;
        this.renderer.clear();
        this.renderer.render(this.sky, this.skyCamera);
        this.renderer.render(this.world, this.camera);
    }
    pushHud(force) {
        const now = Date.now();
        if (this.onHudUpdate === null || (!force && now - this.lastHudAt < HUD_INTERVAL_MS))
            return;
        this.lastHudAt = now;
        const snapshot = this.getSnapshot();
        const previous = this.lastHud;
        if (!force && previous !== null && Object.keys(snapshot)
            .every(key => snapshot[key] === previous[key]))
            return;
        this.lastHud = snapshot;
        this.onHudUpdate(snapshot);
    }
}
exports.TreeScene = TreeScene;
//# sourceMappingURL=TreeScene.js.map