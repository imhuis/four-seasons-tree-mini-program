const test = require('node:test');
const assert = require('node:assert/strict');
const three = require('three');
const { GroundSurface } = require('../miniprogram/render/GroundSurface');
const { GroundSystem } = require('../miniprogram/render/GroundSystem');
const { GrowthController } = require('../miniprogram/render/GrowthController');
const { EnvironmentController } = require('../miniprogram/render/EnvironmentController');
const { SeasonController } = require('../miniprogram/render/SeasonController');
const { ParticleSystem } = require('../miniprogram/render/ParticleSystem');
const { TreeScene } = require('../miniprogram/render/TreeScene');
const { treePresetById } = require('../miniprogram/render/TreePresets');
const { GROUND_LEAF_CAPACITY, PARTICLE_POOL_SIZE } = require('../miniprogram/render/types');

function fixture(id = 'sakura') {
  const preset = treePresetById(id);
  const ground = new GroundSystem(three);
  const seasons = new SeasonController(preset);
  const growth = new GrowthController();
  const environment = new EnvironmentController();
  const update = (progress, time = 0.5, lifetime = 0.75, delta = 0) => {
    const season = seasons.update(progress);
    const age = growth.update(lifetime);
    const weather = environment.update(time, season, delta);
    season.leafAmount *= age.foliage;
    season.flowerAmount *= age.maturity;
    season.snowAmount = weather.snowCover;
    ground.update(time * 100, season, weather, age, preset, 0.9);
    return season;
  };
  return { ground, environment, update };
}

function versions(ground) {
  const result = [];
  ground.group.traverse(object => {
    if (object.geometry) result.push(...Object.values(object.geometry.attributes).map(attribute => attribute.version));
  });
  return result;
}

test('terrain height queries follow rendered triangles and keep the tree base level', () => {
  const surface = new GroundSurface(three);
  const positions = surface.geometry.attributes.position;
  const indices = surface.geometry.index.array;
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    low = Math.min(low, positions.getY(i)); high = Math.max(high, positions.getY(i));
    assert.ok(surface.geometry.attributes.normal.getY(i) > 0.95);
  }
  assert.ok(high - low > 0.02 && high - low < 0.05, 'subtle relief has actual depth');
  for (let face = 0; face < indices.length; face += 3) {
    const triangle = Array.from(indices.slice(face, face + 3));
    // Interior points and centroids independently verify both triangles in every sector.
    for (const weights of [[1 / 3, 1 / 3, 1 / 3], [0.1, 0.2, 0.7]]) {
      const center = ['getX', 'getY', 'getZ'].map(axis => triangle.reduce((sum, vertex, i) => sum + positions[axis](vertex) * weights[i], 0));
      assert.ok(Math.abs(surface.heightAt(center[0], center[2]) - center[1]) < 1e-7, `triangle ${face / 3}`);
    }
  }
  for (const [x, z] of [[0, 0], [0.03, -0.03], [8, -8], [NaN, 1], [1, Infinity]]) {
    assert.ok(Math.abs(surface.heightAt(x, z) + 0.005) < 1e-7);
  }
  surface.dispose();
});

test('landscape placement is deterministic and grass roots meet the terrain', () => {
  const first = new GroundSystem(three), second = new GroundSystem(three);
  for (const name of ['grass', 'rocks']) {
    assert.deepEqual(first[name].geometry.attributes.position.array, second[name].geometry.attributes.position.array);
    assert.ok(first[name].geometry.drawRange.count > 0);
  }
  const grass = first.grass.geometry.attributes.position;
  const roots = first.grass.geometry.attributes.groundRoot;
  for (let start = 0; start < grass.count; start += 24) {
    let lowest = Infinity, centerX = 0, centerZ = 0;
    for (let vertex = start; vertex < start + 24; vertex++) {
      lowest = Math.min(lowest, grass.getY(vertex));
      centerX += grass.getX(vertex) / 24; centerZ += grass.getZ(vertex) / 24;
    }
    assert.ok(Math.abs(lowest - roots.getX(start)) < 0.002, 'blade base is embedded, not floating');
    assert.ok(Math.abs(roots.getX(start) - first.surface.heightAt(centerX, centerZ)) < 0.002);
  }
  first.dispose(); second.dispose();
});

test('daylight and wind animate uniforms without reuploading landscape geometry', () => {
  const { ground, environment, update } = fixture();
  environment.setWeather('clear');
  update(0.375);
  const before = versions(ground);
  const daylightColor = ground.surface.material.uniforms.soil.value.clone();
  for (let frame = 0; frame < 60; frame++) update(0.375, frame / 1440);
  assert.deepEqual(versions(ground), before);
  assert.ok(ground.surface.material.uniforms.soil.value.r < daylightColor.r);
  assert.ok(ground.grassUniforms.time.value > 0 && ground.grassUniforms.wind.value > 0);
  ground.dispose();
});

test('seasonal litter reflects bloom, autumn species colors and snow cover', () => {
  const sakura = fixture();
  sakura.environment.setWeather('clear');
  sakura.update(0.125);
  const springPetals = sakura.ground.petals.geometry.drawRange.count;
  assert.ok(springPetals > 0);
  sakura.update(0.375);
  const summerLeaves = sakura.ground.leaves.geometry.drawRange.count;
  const summerGrass = sakura.ground.grassUniforms.height.value;
  assert.equal(sakura.ground.petals.geometry.drawRange.count, 0);
  sakura.update(0.625);
  assert.ok(sakura.ground.leaves.geometry.drawRange.count > summerLeaves);
  assert.ok(sakura.ground.grassUniforms.height.value < summerGrass);
  sakura.update(0.625, 0.5, 0);
  assert.equal(sakura.ground.leaves.geometry.drawRange.count, 0);
  assert.equal(sakura.ground.petals.geometry.drawRange.count, 0);
  sakura.environment.setWeather('snow'); sakura.environment.setIntensity(1);
  sakura.update(0.875, 0.5, 0.75, 8);
  assert.equal(sakura.ground.leaves.geometry.drawRange.count, 0);
  assert.ok(sakura.ground.surface.material.uniforms.snow.value > 0.9);
  assert.ok(sakura.ground.rockSnow.value > 0.9);
  assert.ok(sakura.ground.grassUniforms.height.value < summerGrass / 4);
  const ginkgo = fixture('ginkgo');
  ginkgo.environment.setWeather('clear'); ginkgo.update(0.625);
  assert.ok(ginkgo.ground.leaves.geometry.drawRange.count > 0);
  const colors = ginkgo.ground.leaves.geometry.attributes.color.array;
  assert.ok(colors[0] > colors[2] * 2 && colors[1] > colors[2] * 2, 'golden ginkgo litter');
  sakura.ground.dispose(); ginkgo.ground.dispose();
});

test('rain darkening and manual snow accumulation work outside winter and thaw continuously', () => {
  const { ground, environment, update } = fixture();
  environment.setWeather('rain'); environment.setIntensity(1);
  update(0.375);
  assert.ok(ground.surface.material.uniforms.wetness.value > 0.9);
  environment.setWeather('snow');
  update(0.375, 0.5, 0.75, 8);
  const snow = ground.surface.material.uniforms.snow.value;
  const snowHeight = ground.grassUniforms.height.value;
  assert.ok(snow > 0.9);
  assert.equal(ground.surface.material.uniforms.wetness.value, 0);
  assert.equal(ground.leaves.geometry.drawRange.count, 0);
  environment.setWeather('clear'); update(0.375, 0.5, 0.75, 0.05);
  assert.ok(ground.surface.material.uniforms.snow.value < snow && ground.surface.material.uniforms.snow.value > snow / 2);
  update(0.375, 0.5, 0.75, 10);
  assert.ok(ground.surface.material.uniforms.snow.value < 1e-6);
  assert.ok(ground.grassUniforms.height.value > snowHeight);
  ground.dispose();
});

test('soft shadows follow the sun, growth and light intensity', () => {
  const { ground, environment, update } = fixture();
  environment.setWeather('clear');
  const u = ground.surface.material.uniforms;
  update(0.375, 0.3);
  const morning = u.shadowDirection.value.clone(), morningLength = u.shadowLength.value;
  update(0.375, 0.5);
  assert.ok(u.shadowLength.value < morningLength);
  const matureLength = u.shadowLength.value;
  update(0.375, 0.5, 0.25);
  assert.ok(u.shadowLength.value < matureLength);
  update(0.375, 0.7);
  assert.ok(morning.x * u.shadowDirection.value.x < 0, 'direction crosses from morning to evening');
  assert.ok(Math.abs(u.shadowDirection.value.length() - 1) < 1e-7);
  update(0.375, 0);
  assert.equal(u.shadowOpacity.value, 0);
  environment.setLight(0); update(0.375);
  assert.equal(u.shadowOpacity.value, 0); assert.equal(u.contactOpacity.value, 0);
  ground.dispose();
});

test('fallen leaves and petals settle above actual relief in a bounded pool', () => {
  const surface = new GroundSurface(three);
  const particles = new ParticleSystem(three, surface.heightAt);
  const state = new SeasonController().update(0.625);
  const source = { x: 0.55, y: surface.heightAt(0.55, 0.1), z: 0.1, size: 0.02, tint: 0, color: [180, 65, 32], shape: 'maple' };
  particles.emit('leaf', source, state); particles.emit('petal', source, state);
  particles.update(0, 0, state);
  const settled = particles.pool.filter(p => p.active && p.grounded);
  assert.equal(settled.length, 2);
  for (const p of settled) assert.ok(Math.abs(p.y - surface.heightAt(p.x, p.z) - 0.004) < 1e-7);
  assert.deepEqual(settled.find(p => p.kind === 'leaf').color, source.color);
  assert.deepEqual(settled.find(p => p.kind === 'petal').color, state.flowerColor);
  for (let i = 0; i < 100; i++) { particles.emit('petal', source, state); particles.update(0, 0, state); }
  assert.ok(particles.pool.filter(p => p.active && p.grounded).length <= GROUND_LEAF_CAPACITY);
  assert.equal(particles.pool.length, PARTICLE_POOL_SIZE + GROUND_LEAF_CAPACITY);
  particles.update(25, 25, state);
  assert.equal(particles.batch.geometry.drawRange.count, 0);
  particles.dispose(); surface.dispose();
});

test('species replacement preserves the landscape and scene destruction releases it once', () => {
  const adapter = require('../miniprogram/vendor/three');
  const originalFactory = adapter.createScopedThreejs, originalWx = global.wx;
  class Renderer { setPixelRatio() {} setSize() {} clear() {} render() {} dispose() {} forceContextLoss() {} }
  adapter.createScopedThreejs = () => ({ ...three, WebGLRenderer: Renderer });
  global.wx = { getWindowInfo: () => ({ pixelRatio: 1 }) };
  try {
    const scene = new TreeScene();
    scene.attach({ requestAnimationFrame: () => 1, cancelAnimationFrame() {} }, 375, 600);
    const ground = scene.ground, resources = new Map();
    ground.group.traverse(object => {
      for (const resource of [object.geometry, object.material]) if (resource && !resources.has(resource)) {
        resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
      }
    });
    scene.setSeasonProgress(0.625); scene.setWeather('clear'); scene.setTreePreset('ginkgo');
    assert.equal(scene.ground, ground);
    assert.equal(scene.particles.groundHeight, ground.surface.heightAt);
    assert.ok(ground.leaves.geometry.drawRange.count > 0);
    assert.equal(scene.snow.batch.geometry.drawRange.count, 0, 'terrain owns the snow cover');
    for (const count of resources.values()) assert.equal(count, 0);
    scene.destroy(); scene.destroy();
    for (const count of resources.values()) assert.equal(count, 1);
  } finally { adapter.createScopedThreejs = originalFactory; global.wx = originalWx; }
});
