const test = require('node:test');
const assert = require('node:assert/strict');
const three = require('three');
const { TREE_PRESETS, treePresetById } = require('../miniprogram/render/TreePresets');
const { TreeTrunk } = require('../miniprogram/render/TreeTrunk');
const { SeasonController } = require('../miniprogram/render/SeasonController');
const { GrowthController } = require('../miniprogram/render/GrowthController');
const { EnvironmentController } = require('../miniprogram/render/EnvironmentController');
const { TreeScene } = require('../miniprogram/render/TreeScene');
const { LeafSystem } = require('../miniprogram/render/LeafSystem');
const { FlowerSystem } = require('../miniprogram/render/FlowerSystem');
const { FruitSystem } = require('../miniprogram/render/FruitSystem');
const { RainSystem } = require('../miniprogram/render/RainSystem');
const { ParticleSystem } = require('../miniprogram/render/ParticleSystem');
const { BRANCH_LIMIT, PARTICLE_POOL_SIZE, GROUND_LEAF_CAPACITY } = require('../miniprogram/render/types');

test('all twelve species have bounded deterministic crowns and continuous seasonal curves', () => {
  assert.equal(TREE_PRESETS.length, 12);
  assert.equal(new Set(TREE_PRESETS.map(preset => preset.id)).size, 12);
  assert.equal(treePresetById('unknown'), undefined);
  for (const preset of TREE_PRESETS) {
    const trunk = new TreeTrunk(7, preset);
    assert.deepEqual(trunk.branches, new TreeTrunk(7, preset).branches);
    assert.ok(trunk.count > 0 && trunk.count <= BRANCH_LIMIT);
    const seasons = new SeasonController(preset);
    const start = structuredClone(seasons.update(0));
    assert.deepEqual(seasons.update(1), start);
    assert.equal(seasons.update(0.875).leafAmount, 0, preset.id);
    for (const p of [0, 0.125, 0.375, 0.625, 0.875]) {
      const state = seasons.update(p);
      assert.ok(state.flowerAmount >= 0 && state.flowerAmount <= 1);
      assert.ok(state.fruitAmount >= 0 && state.fruitAmount <= 1);
    }
  }
  const redwood = new TreeTrunk(7, treePresetById('dawn-redwood')).bounds;
  const sakura = new TreeTrunk(7, treePresetById('sakura')).bounds;
  assert.ok(redwood.maxY / (redwood.maxX - redwood.minX) > sakura.maxY / (sakura.maxX - sakura.minX));
});

test('species bloom and fruit schedules produce the requested seasonal details', () => {
  for (const [id, bloomTime, quietTime] of [['sakura', 0.125, 0.375], ['plum', 0.875, 0.375], ['crape-myrtle', 0.375, 0.125], ['magnolia', 0.125, 0.875], ['golden-rain', 0.125, 0.875]]) {
    const preset = treePresetById(id);
    const trunk = new TreeTrunk(7, preset);
    const seasons = new SeasonController(preset);
    const flowers = new FlowerSystem(three, trunk);
    flowers.update(seasons.update(bloomTime));
    const count = flowers.batch.geometry.drawRange.count;
    flowers.update(seasons.update(quietTime));
    assert.ok(count > flowers.batch.geometry.drawRange.count, id);
    flowers.dispose();
  }
  for (const id of ['persimmon', 'sweetgum', 'magnolia']) {
    const preset = treePresetById(id);
    const fruits = new FruitSystem(three, new TreeTrunk(7, preset));
    fruits.update(new SeasonController(preset).update(0.875));
    assert.ok(fruits.batch.geometry.drawRange.count > 0, id);
    fruits.dispose();
  }
  const ginkgo = new SeasonController(treePresetById('ginkgo')).update(0.625).leafColor;
  assert.ok(ginkgo[0] > 200 && ginkgo[1] > 150 && ginkgo[2] < 80);
});

test('fan, lobed and needle foliage has distinct geometry and vanishes on winter branches', () => {
  const vertices = new Map();
  for (const id of ['sakura', 'japanese-maple', 'ginkgo', 'bald-cypress']) {
    const preset = treePresetById(id);
    const trunk = new TreeTrunk(7, preset);
    const leaves = new LeafSystem(three, trunk);
    const seasons = new SeasonController(preset);
    leaves.update(0, seasons.update(0.375));
    assert.ok(leaves.batch.geometry.drawRange.count > 0);
    vertices.set(preset.leafShape, leaves.batch.geometry.attributes.position.array.length / (trunk.branches.filter(branch => branch.leafy).length * preset.leafDensity * 3));
    leaves.update(0, seasons.update(0.875));
    assert.equal(leaves.batch.geometry.drawRange.count, 0);
    trunk.setGrowth(0);
    leaves.update(0, seasons.update(0.375));
    assert.equal(leaves.batch.geometry.drawRange.count, 0);
    leaves.dispose();
  }
  assert.equal(vertices.get('needle'), 24);
  assert.equal(vertices.get('maple'), 84);
  assert.ok(vertices.get('fan') > vertices.get('needle'));
});

test('all branch joints stay attached throughout growth and sway for every crown', () => {
  const parent = { x: 0, y: 0, z: 0 }, child = { x: 0, y: 0, z: 0 };
  const growth = new GrowthController();
  let previousScale = 0;
  for (const progress of [0, 0.04, 0.12, 0.24, 0.4, 0.75, 1]) {
    const state = growth.update(progress);
    assert.ok(state.scale >= previousScale);
    previousScale = state.scale;
    for (const preset of TREE_PRESETS) {
      const trunk = new TreeTrunk(7, preset);
      trunk.setGrowth(progress); trunk.updateSway(2, 1);
      for (let id = 1; id < trunk.count; id++) {
        const branch = trunk.branches[id];
        const t = branch.parent === 0 ? branch.y0 / trunk.branches[0].y1 : 1;
        trunk.samplePosition(branch.parent, t, parent); trunk.samplePosition(id, 0, child);
        for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(parent[axis] - child[axis]) < 1e-7, `${preset.id}/${progress}/${axis}`);
      }
    }
  }
  assert.equal(growth.update(0).seedAmount, 1);
  assert.equal(growth.update(0.75).maturity, 1);
  assert.equal(growth.update(1).stageIndex, 4);
  assert.ok(growth.state.foliage < growth.update(0.75).foliage);
});

test('manual weather overrides seasons, snow melts and zero precipitation stops emission', () => {
  const environment = new EnvironmentController();
  const winter = new SeasonController().update(0.875);
  environment.setWeather('rain');
  let state = environment.update(0.5, winter, 1);
  assert.ok(state.rainRate > 0); assert.equal(state.snowRate, 0);
  environment.setWeather('snow');
  state = environment.update(0.5, winter, 5);
  assert.equal(state.rainRate, 0); assert.ok(state.snowRate > 0 && state.snowCover > 0);
  environment.setIntensity(0);
  assert.equal(environment.update(0.5, winter, 0).snowRate, 0);
  environment.setWeather('clear');
  const cover = state.snowCover;
  state = environment.update(0.5, winter, 1);
  assert.equal(state.rainRate + state.snowRate, 0); assert.ok(state.snowCover < cover);
  assert.ok(environment.update(0.5, winter, 10).snowCover < 1e-6);
  assert.equal(environment.setWeather('invalid'), false);
  environment.setIntensity(NaN); assert.equal(environment.intensity, 0);
});

test('daylight changes sky and lighting continuously across midnight', () => {
  const environment = new EnvironmentController();
  environment.setWeather('clear');
  const summer = new SeasonController().update(0.375);
  const noon = structuredClone(environment.update(0.5, summer, 0));
  const night = structuredClone(environment.update(0, summer, 0));
  assert.ok(noon.daylight > night.daylight && noon.lightIntensity > night.lightIntensity);
  assert.ok(noon.skyTop[0] > night.skyTop[0]);
  assert.deepEqual(environment.update(1, summer, 0), night);
  const before = environment.update(1 - 1e-6, summer, 0);
  for (const field of ['daylight', 'lightIntensity', 'ambientIntensity']) assert.ok(Math.abs(before[field] - night[field]) < 1e-5);
  environment.setLight(0); assert.equal(environment.update(0.5, summer, 0).lightIntensity, 0);
});

test('growth, seasons and day clocks play independently and growth stops at old age', () => {
  const scene = new TreeScene();
  scene.setSeasonProgress(0.3); scene.setGrowthProgress(0.25); scene.setTimeProgress(0.4);
  scene.setAutoPlay(true); scene.setGrowthPlay(true); scene.setDayPlay(true);
  scene.update(1);
  const snapshot = scene.getSnapshot();
  assert.ok(snapshot.progress > 0.3 && snapshot.growthProgress > 0.25 && snapshot.timeProgress > 0.4);
  scene.setGrowthProgress(0.99);
  assert.equal(scene.autoPlaying, true); assert.equal(scene.getSnapshot().dayPlaying, true);
  scene.setGrowthPlay(true); scene.update(2);
  assert.equal(scene.getSnapshot().growthProgress, 1); assert.equal(scene.getSnapshot().growthPlaying, false);
  scene.setTimeProgress(1); assert.equal(scene.getSnapshot().timeProgress, 0);
  assert.equal(scene.getSnapshot().playing, true);
  scene.setGrowthProgress(NaN); scene.setTimeProgress(Infinity);
  assert.equal(scene.getSnapshot().growthProgress, 1); assert.equal(scene.getSnapshot().timeProgress, 0);
  scene.destroy();
});

test('rain and mixed foliage remain inside the shared bounded particle pool', () => {
  const particles = new ParticleSystem(three);
  const rain = new RainSystem(particles);
  const state = new SeasonController().update(0.375);
  for (let i = 0; i < 120; i++) { rain.update(0.05, 1, 100, state); particles.update(0.05, i * 0.05, state); }
  assert.ok(particles.batch.geometry.drawRange.count > 0);
  assert.ok(particles.pool.filter(particle => particle.active).length <= PARTICLE_POOL_SIZE + GROUND_LEAF_CAPACITY);
  assert.ok(particles.pool.every(particle => !particle.active || particle.kind === 'rain'));
  particles.clear(); assert.equal(particles.batch.geometry.drawRange.count, 0);
  particles.dispose();
});

test('species replacement releases old GPU resources while keeping all controls and one tree group', () => {
  const adapter = require('../miniprogram/vendor/three');
  const originalFactory = adapter.createScopedThreejs, originalWx = global.wx;
  class Renderer { setPixelRatio() {} setSize() {} clear() {} render() {} dispose() {} forceContextLoss() {} }
  adapter.createScopedThreejs = () => ({ ...three, WebGLRenderer: Renderer });
  global.wx = { getWindowInfo: () => ({ pixelRatio: 1 }) };
  try {
    const scene = new TreeScene();
    scene.attach({ requestAnimationFrame: () => 1, cancelAnimationFrame() {} }, 375, 600);
    scene.setSeasonProgress(0.625); scene.setGrowthProgress(0.3); scene.setTimeProgress(0.2); scene.setWeather('rain');
    scene.setAutoPlay(true); scene.setDayPlay(true); scene.setGrowthPlay(true);
    const before = scene.getSnapshot();
    for (const preset of TREE_PRESETS.slice(1)) {
      const resources = new Map();
      scene.treeGroup.traverse(object => {
        for (const resource of [object.geometry, object.material]) if (resource && !resources.has(resource)) {
          resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
        }
      });
      assert.equal(scene.setTreePreset(preset.id), true);
      for (const count of resources.values()) assert.equal(count, 1);
      const after = scene.getSnapshot();
      assert.equal(after.presetId, preset.id);
      for (const key of ['progress', 'growthProgress', 'timeProgress', 'playing', 'growthPlaying', 'dayPlaying', 'weather']) assert.equal(after[key], before[key]);
      assert.equal(scene.treeGroup.children.length, 4);
      assert.ok(scene.camera.aspect > 0 && Number.isFinite(scene.distance));
    }
    const current = scene.getSnapshot();
    assert.equal(scene.setTreePreset('invalid'), false); assert.deepEqual(scene.getSnapshot(), current);
    scene.destroy(); scene.destroy();
  } finally { adapter.createScopedThreejs = originalFactory; global.wx = originalWx; }
});
