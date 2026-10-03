import type { Group } from 'three';
import { lerpColor, makeRgb, rgb, sampleColorStops, type RGB } from '../utils/color';
import { clamp, createRng, sampleKeyframes, smoothstep, TAU } from '../utils/math';
import type { EnvironmentState } from './EnvironmentController';
import type { GrowthState } from './GrowthController';
import { GroundSurface } from './GroundSurface';
import { MeshBatch } from './MeshBatch';
import type { SeasonState } from './SeasonController';
import type { TreePreset } from './TreePresets';
import type { Three } from './types';

const GRASS_COLORS: readonly RGB[] = ['#9FBA78', '#99BA71', '#78955D', '#738E58', '#A4A365', '#AD975F', '#A49C7C', '#ABA38D', '#9FBA78'].map(rgb);
const GRASS_HEIGHT = [0.55, 0.85, 1, 1, 0.82, 0.6, 0.35, 0.3, 0.55];
const LEAF_COVER = [0.14, 0.04, 0.02, 0.03, 0.55, 1, 0.8, 0.35, 0.14];
const WHITE: RGB = [240, 241, 235];
interface Scatter { x: number; z: number; size: number; rotation: number; threshold: number; tint: number; }

/** Persistent landscape, batched props and season-driven litter, independent of tree replacement. */
export class GroundSystem {
  readonly group: Group;
  readonly surface: GroundSurface;
  readonly grass: MeshBatch;
  readonly rocks: MeshBatch;
  readonly leaves: MeshBatch;
  readonly petals: MeshBatch;
  private readonly leafScatter: Scatter[] = [];
  private readonly petalScatter: Scatter[] = [];
  private readonly grassColor = makeRgb();
  private readonly leafColor = makeRgb();
  private readonly color = makeRgb();
  private lastPreset = '';
  private lastProgress = -1;
  private lastSnow = -1;
  private lastFoliage = -1;
  private lastMaturity = -1;
  private readonly grassUniforms = { time: { value: 0 }, wind: { value: 0 }, height: { value: 1 }, snow: { value: 0 } };
  private readonly rockSnow = { value: 0 };

  constructor(three: Three) {
    this.group = new three.Group();
    this.surface = new GroundSurface(three);
    this.grass = new MeshBatch(three, 100 * 3);
    this.rocks = new MeshBatch(three, 24, 'oval');
    this.leaves = new MeshBatch(three, 150, 'mixed');
    this.petals = new MeshBatch(three, 80, 'oval');
    this.group.add(this.surface.mesh, this.grass.mesh, this.rocks.mesh, this.leaves.mesh, this.petals.mesh);
    const random = createRng(202610031);
    this.buildProps(three, random);
    for (let i = 0; i < 150; i++) this.leafScatter.push(this.scatter(random, 0.16, 0.82, 0.014, 0.026));
    for (let i = 0; i < 80; i++) this.petalScatter.push(this.scatter(random, 0.12, 0.7, 0.007, 0.013));
    this.grass.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { groundTime: this.grassUniforms.time, groundWind: this.grassUniforms.wind,
        groundGrassHeight: this.grassUniforms.height, groundSnow: this.grassUniforms.snow });
      shader.vertexShader = `attribute float groundRoot; uniform float groundTime, groundWind, groundGrassHeight;
        varying float grassBladeHeight;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
          float bladeHeight = max(0.0, transformed.y - groundRoot) * groundGrassHeight;
          transformed.y = groundRoot + bladeHeight;
          transformed.x += sin(groundTime * 1.5 + position.x * 8.0 + position.z * 6.0) * bladeHeight * bladeHeight * groundWind * 3.0;
          grassBladeHeight = bladeHeight;`);
      shader.fragmentShader = `uniform float groundSnow; varying float grassBladeHeight;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          float cover = smoothstep(0.25, 0.85, groundSnow) * (1.0 - smoothstep(0.005, 0.05, grassBladeHeight));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.95, 0.93), cover);`);
    };
    this.rocks.material.onBeforeCompile = shader => {
      shader.uniforms.groundSnow = this.rockSnow;
      shader.vertexShader = `varying float rockFacing;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nrockFacing = normal.y;');
      shader.fragmentShader = `uniform float groundSnow; varying float rockFacing;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.95, 0.93), smoothstep(0.2, 0.7, rockFacing) * groundSnow);`);
    };
  }

  private scatter(random: () => number, minRadius: number, maxRadius: number, minSize: number, maxSize: number): Scatter {
    // Offset clusters create clear patches, rather than a uniform ring around the tree.
    const cluster = Math.floor(random() * 5), angle = cluster * TAU / 5 + 0.5;
    const radius = minRadius + random() * (maxRadius - minRadius);
    return { x: Math.cos(angle) * radius + (random() - 0.5) * 0.24,
      z: Math.sin(angle) * radius + (random() - 0.5) * 0.24, size: minSize + random() * (maxSize - minSize),
      rotation: random() * TAU, threshold: random() * 0.8, tint: random() * 28 - 14 };
  }

  private buildProps(three: Three, random: () => number): void {
    this.grass.begin(); this.rocks.begin();
    const roots = new Float32Array(this.grass.geometry.attributes.position.count);
    for (let tuft = 0; tuft < 100; tuft++) {
      const s = this.scatter(random, 0.22, 1.02, 0.020, 0.043);
      for (let blade = 0; blade < 3; blade++) {
        const x = s.x + (random() - 0.5) * 0.013, z = s.z + (random() - 0.5) * 0.013;
        const root = this.surface.heightAt(x, z) - 0.001;
        const size = s.size * (0.7 + random() * 0.5);
        this.grass.write(x, root + size, z, size, size * 0.12, 0.0004,
          Math.PI / 2 + (random() - 0.5) * 0.3, 0, WHITE, s.tint, 'diamond', s.rotation);
        roots.fill(root, (tuft * 3 + blade) * 24, (tuft * 3 + blade + 1) * 24);
      }
    }
    this.grass.geometry.addAttribute('groundRoot', new three.BufferAttribute(roots, 1));
    for (let i = 0; i < 24; i++) {
      const s = this.scatter(random, 0.26, 1.0, 0.018, 0.045);
      const height = s.size * (0.35 + random() * 0.35);
      this.rocks.write(s.x, this.surface.heightAt(s.x, s.z) + height * 0.65, s.z,
        s.size, s.size * (0.6 + random() * 0.3), height, s.rotation, Math.PI / 2, [151, 146, 129], s.tint);
    }
    this.grass.commit(); this.rocks.commit();
  }

  update(time: number, season: SeasonState, environment: EnvironmentState, growth: GrowthState, preset: TreePreset, treeHeight: number): void {
    sampleColorStops(this.grassColor, GRASS_COLORS, season.seasonProgress);
    const brightness = 0.24 + 0.76 * environment.daylight;
    const light = Math.max(0.12, environment.ambientIntensity / (0.3 + 0.35 * environment.daylight));
    const u = this.surface.material.uniforms;
    u.soil.value.setRGB(environment.groundColor[0] / 255 * light, environment.groundColor[1] / 255 * light, environment.groundColor[2] / 255 * light);
    u.grass.value.setRGB(this.grassColor[0] / 255 * brightness * light, this.grassColor[1] / 255 * brightness * light, this.grassColor[2] / 255 * brightness * light);
    u.snowColor.value.setRGB(brightness * light * 0.97, brightness * light * 0.98, brightness * light);
    u.snow.value = environment.snowCover;
    u.wetness.value = clamp(environment.rainRate / 100, 0, 1);
    const sunX = Math.cos(environment.sunAngle) * 3, sunY = Math.max(0.4, Math.sin(environment.sunAngle) * 4), sunZ = 3;
    u.sun.value.set(sunX, sunY, sunZ);
    const horizontal = Math.hypot(sunX, sunZ);
    u.shadowDirection.value.set(-sunX / horizontal, -sunZ / horizontal);
    u.shadowLength.value = clamp(treeHeight * growth.scale * 0.48 * horizontal / sunY, 0.015, 1.2);
    u.shadowWidth.value = 0.045 + growth.scale * 0.20;
    u.shadowOpacity.value = environment.daylight * environment.lightIntensity * 0.34;
    u.canopy.value = 0.12 + season.leafAmount * 0.75 + season.flowerAmount * 0.18;
    u.contactSize.value = 0.018 + growth.scale * 0.06;
    u.contactOpacity.value = Math.min(0.23, environment.ambientIntensity * 0.3 + environment.lightIntensity * 0.10);
    this.grass.material.color.setRGB(this.grassColor[0] / 255, this.grassColor[1] / 255, this.grassColor[2] / 255);
    this.grassUniforms.time.value = time;
    this.grassUniforms.wind.value = environment.windStrength;
    this.grassUniforms.height.value = sampleKeyframes(GRASS_HEIGHT, season.seasonProgress) * (1 - environment.snowCover * 0.75);
    this.grassUniforms.snow.value = this.rockSnow.value = environment.snowCover;
    this.updateLitter(season, growth, preset);
  }

  private updateLitter(season: SeasonState, growth: GrowthState, preset: TreePreset): void {
    if (preset.id === this.lastPreset && season.seasonProgress === this.lastProgress && season.snowAmount === this.lastSnow
      && growth.foliage === this.lastFoliage && growth.maturity === this.lastMaturity) return;
    this.lastPreset = preset.id; this.lastProgress = season.seasonProgress; this.lastSnow = season.snowAmount;
    this.lastFoliage = growth.foliage; this.lastMaturity = growth.maturity;
    const snow = 1 - smoothstep(season.snowAmount);
    const leaves = sampleKeyframes(LEAF_COVER, season.seasonProgress) * growth.foliage * snow;
    // TreeScene already applies maturity to the flower amount.
    const petals = season.flowerAmount * preset.flowerDensity * snow;
    sampleColorStops(this.leafColor, preset.leafColors, 0.625);
    this.leaves.begin(); this.petals.begin();
    for (let i = 0; i < this.leafScatter.length; i++) {
      const s = this.leafScatter[i];
      const scale = smoothstep((leaves - s.threshold) / 0.22);
      if (scale < 0.01) continue;
      lerpColor(this.color, this.leafColor, i % 3 === 0 ? preset.leafColors[4] : this.leafColor, preset.autumnVariation);
      const size = s.size * scale;
      const width = preset.leafShape === 'needle' ? 0.12 : preset.leafShape === 'oval' ? 0.48 : 0.8;
      this.leaves.write(s.x, this.surface.heightAt(s.x, s.z) + 0.003, s.z, size, size * width, 0.0007,
        s.rotation, Math.PI / 2, this.color, s.tint, preset.leafShape);
    }
    for (const s of this.petalScatter) {
      const size = s.size * smoothstep((petals - s.threshold) / 0.25);
      if (size < 0.0002) continue;
      this.petals.write(s.x, this.surface.heightAt(s.x, s.z) + 0.003, s.z, size, size * 0.65, 0.0006,
        s.rotation, Math.PI / 2, season.flowerColor, s.tint);
    }
    this.leaves.commit(); this.petals.commit();
  }

  dispose(): void {
    this.surface.dispose(); this.grass.dispose(); this.rocks.dispose(); this.leaves.dispose(); this.petals.dispose();
  }
}
