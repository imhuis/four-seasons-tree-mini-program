import type { DirectionalLight, Group, HemisphereLight, Mesh, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial, WebGLRenderer } from 'three';
import { clamp, wrap01 } from '../utils/math';
import { createScopedThreejs } from '../vendor/three';
import { BranchSystem } from './BranchSystem';
import { FlowerSystem } from './FlowerSystem';
import { LeafSystem, type FoliageSource } from './LeafSystem';
import { ParticleSystem } from './ParticleSystem';
import { SeasonController } from './SeasonController';
import { SnowSystem } from './SnowSystem';
import { TreeTrunk } from './TreeTrunk';
import { DEFAULT_TREE_PRESET, treePresetById } from './TreePresets';
import { GrowthController } from './GrowthController';
import { EnvironmentController, type EnvironmentState, type WeatherMode } from './EnvironmentController';
import { FruitSystem } from './FruitSystem';
import { RainSystem } from './RainSystem';
import { MeshBatch } from './MeshBatch';
import type { Three } from './types';
import { GroundSystem } from './GroundSystem';

const MAX_DPR = 2;
const MAX_DELTA = 0.05;
const HUD_INTERVAL_MS = 120;

export interface HudSnapshot {
  progress: number; seasonIndex: number; phaseIndex: number; playing: boolean;
  presetId: string; growthProgress: number; growthStageIndex: number; growthPlaying: boolean;
  timeProgress: number; dayPlaying: boolean; weather: WeatherMode; weatherIntensity: number; lightIntensity: number;
}

/** Owns the canvas-scoped engine, GPU resources, camera and animation lifecycle. */
export class TreeScene {
  private readonly seasons = new SeasonController();
  private trunk = new TreeTrunk();
  private readonly growth = new GrowthController();
  private readonly environment = new EnvironmentController();
  private three: Three | null = null;
  private treeGroup: Group | null = null;
  private sunlight: DirectionalLight | null = null;
  private ambient: HemisphereLight | null = null;
  private fruits: FruitSystem | null = null;
  private seed: MeshBatch | null = null;
  private rain: RainSystem | null = null;
  private growthProgress = 0.75;
  private growthPlaying = false;
  private timeProgress = 0.5;
  private dayPlaying = false;
  private cssWidth = 0;
  private cssHeight = 0;
  private canvas: WechatMiniprogram.Canvas | null = null;
  private renderer: WebGLRenderer | null = null;
  private world: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private sky: Scene | null = null;
  private skyCamera: OrthographicCamera | null = null;
  private skyMesh: Mesh | null = null;
  private skyMaterial: ShaderMaterial | null = null;
  private ground: GroundSystem | null = null;
  private branches: BranchSystem | null = null;
  private leaves: LeafSystem | null = null;
  private flowers: FlowerSystem | null = null;
  private particles: ParticleSystem | null = null;
  private snow: SnowSystem | null = null;
  private seasonProgress = 0;
  private elapsed = 0;
  private lastTick = 0;
  private frameHandle = 0;
  private running = false;
  private playing = false;
  private lastHudAt = 0;
  private lastHud: HudSnapshot | null = null;
  private leafAccumulator = 0;
  private petalAccumulator = 0;
  private azimuth = 0.45;
  private elevation = 0.16;
  private distance = 1.8;
  private zoom = 1;
  private readonly source: FoliageSource = { x: 0, y: 0, z: 0, size: 0, tint: 0 };
  onHudUpdate: ((snapshot: HudSnapshot) => void) | null = null;

  attach(canvas: WechatMiniprogram.Canvas, cssWidth: number, cssHeight: number): void {
    if (this.canvas !== null) throw new Error('Scene is already attached');
    if (!(cssWidth > 0 && cssHeight > 0)) throw new Error('Canvas has no visible size');
    this.canvas = canvas;
    try {
      const three = createScopedThreejs(canvas);
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

      this.ground = new GroundSystem(three);
      this.world.add(this.ground.group);

      this.treeGroup = new three.Group();
      this.world.add(this.treeGroup);
      this.installTree(three, this.trunk);
      this.seed = new MeshBatch(three, 1, 'oval');
      this.particles = new ParticleSystem(three, this.ground.surface.heightAt);
      this.snow = new SnowSystem(three, this.particles, 60607, true);
      this.rain = new RainSystem(this.particles);
      this.world.add(this.seed.mesh, this.particles.batch.mesh);
      this.resize(cssWidth, cssHeight);
    } catch (error: unknown) {
      this.destroy();
      throw error;
    }
  }

  resize(cssWidth: number, cssHeight: number): void {
    if (this.renderer === null || this.camera === null || !(cssWidth > 0 && cssHeight > 0)) return;
    this.cssWidth = cssWidth; this.cssHeight = cssHeight;
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.renderer.setPixelRatio(clamp(info.pixelRatio || 1, 1, MAX_DPR));
    this.renderer.setSize(cssWidth, cssHeight, false);
    this.camera.aspect = cssWidth / cssHeight;
    if (this.skyMaterial !== null) this.skyMaterial.uniforms.aspect.value = this.camera.aspect;
    this.camera.updateProjectionMatrix();
    const bounds = this.trunk.bounds;
    let radius = 0;
    for (const b of this.trunk.branches) {
      radius = Math.max(radius, Math.hypot(b.x0, b.z0), Math.hypot(b.cx, b.cz), Math.hypot(b.x1, b.z1));
    }
    radius += 0.065;
    const halfFov = this.camera.fov * Math.PI / 360;
    this.distance = Math.max(bounds.maxY * 0.64 / Math.tan(halfFov),
      radius * 1.10 / (Math.tan(halfFov) * this.camera.aspect)) + radius * 0.35;
    this.updateCamera();
    this.renderOnce();
  }

  rotateView(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.azimuth -= dx * 0.008;
    this.elevation = clamp(this.elevation + dy * 0.005, 0.04, 0.65);
    this.updateCamera();
  }

  zoomView(ratio: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0) return;
    this.zoom = clamp(this.zoom / ratio, 0.72, 1.65);
    this.updateCamera();
  }

  private updateCamera(): void {
    const camera = this.camera;
    if (camera === null) return;
    const targetY = this.trunk.bounds.maxY * 0.43;
    const radius = this.distance * this.zoom;
    camera.position.set(Math.sin(this.azimuth) * Math.cos(this.elevation) * radius,
      targetY + Math.sin(this.elevation) * radius, Math.cos(this.azimuth) * Math.cos(this.elevation) * radius);
    camera.lookAt(0, targetY, 0);
  }

  start(): void {
    if (this.running || this.canvas === null) return;
    this.running = true; this.lastTick = 0;
    this.frameHandle = this.canvas.requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.canvas !== null && this.frameHandle !== 0) this.canvas.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0; this.lastTick = 0;
  }

  destroy(): void {
    this.stop();
    this.branches?.dispose(); this.leaves?.dispose(); this.flowers?.dispose();
    this.fruits?.dispose(); this.seed?.dispose();
    this.particles?.dispose(); this.snow?.dispose();
    this.ground?.dispose();
    this.skyMesh?.geometry.dispose(); this.skyMaterial?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.canvas = null; this.renderer = null; this.world = null; this.camera = null;
    this.sky = null; this.skyCamera = null; this.skyMesh = null; this.skyMaterial = null;
    this.ground = null;
    this.branches = null; this.leaves = null; this.flowers = null; this.particles = null; this.snow = null;
    this.fruits = null; this.seed = null; this.rain = null;
    this.treeGroup = null; this.three = null; this.sunlight = null; this.ambient = null;
    this.onHudUpdate = null;
    this.lastHud = null;
  }

  setSeasonProgress(progress: number): void {
    if (!Number.isFinite(progress)) return;
    const next = wrap01(progress);
    const gap = Math.abs(next - this.seasonProgress);
    if (Math.min(gap, 1 - gap) > 0.08) {
      this.particles?.clear(); this.snow?.reset();
      this.leafAccumulator = this.petalAccumulator = 0;
      this.environment.resetSnow(); this.rain?.reset();
    }
    this.seasonProgress = next;
    this.playing = false;
    this.update(0);
    this.pushHud(true);
  }

  getProgress(): number { return this.seasonProgress; }
  setAutoPlay(playing: boolean): void { this.playing = playing; this.pushHud(true); }
  get autoPlaying(): boolean { return this.playing; }

  getSnapshot(): HudSnapshot {
    const state = this.seasons.state;
    return { progress: this.seasonProgress, seasonIndex: state.seasonIndex, phaseIndex: state.phaseIndex, playing: this.playing,
      presetId: this.trunk.preset.id, growthProgress: this.growthProgress, growthStageIndex: this.growth.update(this.growthProgress).stageIndex,
      growthPlaying: this.growthPlaying, timeProgress: this.timeProgress, dayPlaying: this.dayPlaying,
      weather: this.environment.weather, weatherIntensity: this.environment.intensity, lightIntensity: this.environment.light };
  }

  setTreePreset(id: string): boolean {
    const preset = treePresetById(id);
    if (preset === undefined) return false;
    if (preset.id === this.trunk.preset.id) return true;
    const trunk = new TreeTrunk(20261003, preset);
    if (this.three !== null) this.installTree(this.three, trunk);
    this.trunk = trunk;
    this.seasons.setPreset(preset);
    this.particles?.clear(); this.snow?.reset(); this.rain?.reset();
    this.leafAccumulator = this.petalAccumulator = 0;
    if (this.renderer !== null) this.resize(this.cssWidth, this.cssHeight);
    else this.update(0);
    this.pushHud(true);
    return true;
  }

  /** Allocate the replacement before disposing the visible model. */
  private installTree(three: Three, trunk: TreeTrunk): void {
    let branches: BranchSystem | null = null, leaves: LeafSystem | null = null;
    let flowers: FlowerSystem | null = null, fruits: FruitSystem | null = null;
    try {
      branches = new BranchSystem(three, trunk); leaves = new LeafSystem(three, trunk);
      flowers = new FlowerSystem(three, trunk); fruits = new FruitSystem(three, trunk);
    } catch (error: unknown) {
      branches?.dispose(); leaves?.dispose(); flowers?.dispose(); fruits?.dispose();
      throw error;
    }
    const group = this.treeGroup;
    if (group !== null) while (group.children.length > 0) group.remove(group.children[0]);
    this.branches?.dispose(); this.leaves?.dispose(); this.flowers?.dispose(); this.fruits?.dispose();
    this.branches = branches; this.leaves = leaves; this.flowers = flowers; this.fruits = fruits;
    group?.add(branches.group, leaves.batch.mesh, flowers.batch.mesh, fruits.batch.mesh);
  }

  setGrowthProgress(value: number): void {
    if (!Number.isFinite(value)) return;
    const next = clamp(value, 0, 1);
    if (Math.abs(next - this.growthProgress) > 0.08) this.particles?.clear();
    this.growthProgress = next; this.growthPlaying = false;
    this.update(0); this.pushHud(true);
  }
  setGrowthPlay(playing: boolean): void {
    if (playing && this.growthProgress >= 1) this.growthProgress = 0;
    this.growthPlaying = playing; this.pushHud(true);
  }
  setTimeProgress(value: number): void {
    if (!Number.isFinite(value)) return;
    this.timeProgress = wrap01(value); this.dayPlaying = false;
    this.update(0); this.pushHud(true);
  }
  setDayPlay(playing: boolean): void { this.dayPlaying = playing; this.pushHud(true); }
  setWeather(mode: string): boolean {
    if (!this.environment.setWeather(mode)) return false;
    this.particles?.clear(); this.snow?.reset(); this.rain?.reset();
    this.update(0); this.pushHud(true); return true;
  }
  setWeatherIntensity(value: number): void { this.environment.setIntensity(value); this.update(0); this.pushHud(true); }
  setLightIntensity(value: number): void { this.environment.setLight(value); this.update(0); this.pushHud(true); }

  renderOnce(): void { this.update(0); this.render(); }

  private readonly tick = (): void => {
    if (!this.running || this.canvas === null) return;
    const now = Date.now();
    const delta = this.lastTick === 0 ? 1 / 60 : clamp((now - this.lastTick) / 1000, 0, MAX_DELTA);
    this.lastTick = now;
    this.elapsed += delta;
    this.update(delta);
    this.render();
    this.pushHud(false);
    if (this.running && this.canvas !== null) this.frameHandle = this.canvas.requestAnimationFrame(this.tick);
  };

  private update(delta: number): void {
    if (this.playing) this.seasonProgress = wrap01(this.seasonProgress + delta / 48);
    if (this.growthPlaying) {
      this.growthProgress = Math.min(1, this.growthProgress + delta / 90);
      if (this.growthProgress >= 1) this.growthPlaying = false;
    }
    if (this.dayPlaying) this.timeProgress = wrap01(this.timeProgress + delta / 120);
    const state = this.seasons.update(this.seasonProgress);
    const growth = this.growth.update(this.growthProgress);
    const environment = this.environment.update(this.timeProgress, state, delta);
    state.leafAmount *= growth.foliage;
    state.flowerAmount *= growth.maturity;
    state.fruitAmount *= growth.maturity;
    state.fallingLeafRate *= growth.foliage;
    state.petalRate *= growth.maturity;
    state.snowAmount = environment.snowCover; state.snowRate = environment.snowRate;
    state.windStrength = environment.windStrength;
    this.trunk.setGrowth(this.growthProgress);
    this.trunk.updateSway(this.elapsed, state.windStrength);
    this.treeGroup?.scale.setScalar(growth.scale);
    if (this.treeGroup !== null) this.treeGroup.visible = this.growthProgress > 0;
    this.ground?.update(this.elapsed, state, environment, growth, this.trunk.preset, this.trunk.bounds.maxY);
    this.branches?.update(state, growth.thickness, 0.35 + 0.65 * environment.daylight);
    this.leaves?.update(this.elapsed, state);
    this.flowers?.update(state);
    this.fruits?.update(state);
    if (this.seed !== null) {
      this.seed.begin();
      this.seed.write(0, 0.012, 0, 0.025 * growth.seedAmount, 0.014 * growth.seedAmount, 0.012 * growth.seedAmount, 0, 0, DEFAULT_TREE_PRESET.trunkColor);
      this.seed.commit();
    }
    this.leafAccumulator = Math.min(4, this.leafAccumulator + state.fallingLeafRate * delta);
    this.petalAccumulator = Math.min(4, this.petalAccumulator + state.petalRate * delta);
    while (this.leafAccumulator >= 1) {
      this.leafAccumulator--;
      if (this.leaves?.pickSource(Math.random(), this.elapsed, state, this.source)) {
        this.scaleSource(growth.scale); this.particles?.emit('leaf', this.source, state);
      }
    }
    while (this.petalAccumulator >= 1) {
      this.petalAccumulator--;
      if (this.flowers?.pickSource(Math.random(), this.source)) {
        this.scaleSource(growth.scale); this.particles?.emit('petal', this.source, state);
      }
    }
    this.snow?.update(delta, this.trunk.bounds.maxY, state);
    this.rain?.update(delta, this.trunk.bounds.maxY, environment.rainRate, state);
    this.particles?.update(delta, this.elapsed, state);
    this.applyEnvironment(environment);
  }

  private scaleSource(scale: number): void {
    this.source.x *= scale; this.source.y *= scale; this.source.z *= scale; this.source.size *= scale;
  }

  private applyEnvironment(environment: EnvironmentState): void {
    if (this.skyMaterial !== null) {
      this.skyMaterial.uniforms.top.value.setRGB(environment.skyTop[0] / 255, environment.skyTop[1] / 255, environment.skyTop[2] / 255);
      this.skyMaterial.uniforms.bottom.value.setRGB(environment.skyBottom[0] / 255, environment.skyBottom[1] / 255, environment.skyBottom[2] / 255);
      this.skyMaterial.uniforms.night.value = 1 - environment.daylight;
    }
    if (this.ambient !== null) this.ambient.intensity = environment.ambientIntensity;
    if (this.sunlight !== null) {
      this.sunlight.intensity = environment.lightIntensity;
      this.sunlight.position.set(Math.cos(environment.sunAngle) * 3, Math.max(0.4, Math.sin(environment.sunAngle) * 4), 3);
      this.sunlight.color.setRGB(1 - (1 - environment.daylight) * 0.45, 0.94, 0.88 + (1 - environment.daylight) * 0.12);
    }
  }

  private render(): void {
    if (this.renderer === null || this.world === null || this.camera === null || this.sky === null || this.skyCamera === null) return;
    this.renderer.clear();
    this.renderer.render(this.sky, this.skyCamera);
    this.renderer.render(this.world, this.camera);
  }

  private pushHud(force: boolean): void {
    const now = Date.now();
    if (this.onHudUpdate === null || (!force && now - this.lastHudAt < HUD_INTERVAL_MS)) return;
    this.lastHudAt = now;
    const snapshot = this.getSnapshot();
    const previous = this.lastHud;
    if (!force && previous !== null && (Object.keys(snapshot) as (keyof HudSnapshot)[])
      .every(key => snapshot[key] === previous[key])) return;
    this.lastHud = snapshot;
    this.onHudUpdate(snapshot);
  }
}
