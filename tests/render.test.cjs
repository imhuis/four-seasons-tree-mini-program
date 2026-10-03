const test = require('node:test');
const assert = require('node:assert/strict');
const three = require('three');
const { TreeTrunk } = require('../miniprogram/render/TreeTrunk');
const { SeasonController } = require('../miniprogram/render/SeasonController');
const { TreeScene } = require('../miniprogram/render/TreeScene');
const { LeafSystem } = require('../miniprogram/render/LeafSystem');
const { FlowerSystem } = require('../miniprogram/render/FlowerSystem');
const { ParticleSystem } = require('../miniprogram/render/ParticleSystem');
const { MeshBatch } = require('../miniprogram/render/MeshBatch');
const { BRANCH_LIMIT } = require('../miniprogram/render/types');
const { BranchSystem } = require('../miniprogram/render/BranchSystem');
const { SnowSystem } = require('../miniprogram/render/SnowSystem');
const { treePresetById } = require('../miniprogram/render/TreePresets');

test('tree is deterministic, bounded and has depth in all four directions', () => {
  const trunk = new TreeTrunk();
  assert.deepEqual(trunk.branches, new TreeTrunk().branches);
  assert.ok(trunk.count <= BRANCH_LIMIT);
  assert.ok(trunk.bounds.minX < -0.1 && trunk.bounds.maxX > 0.1);
  assert.ok(trunk.bounds.minZ < -0.1 && trunk.bounds.maxZ > 0.1);
  for (let i = 1; i < trunk.count; i++) assert.ok(trunk.branches[i].parent < i);
});

test('animated child joints remain attached to their parent in 3D', () => {
  const trunk = new TreeTrunk();
  trunk.updateSway(15, 1);
  const parentPoint = { x: 0, y: 0, z: 0 };
  const childPoint = { x: 0, y: 0, z: 0 };
  for (let i = 1; i < trunk.count; i++) {
    const branch = trunk.branches[i];
    const t = branch.parent === 0 ? branch.y0 / trunk.branches[0].y1 : 1;
    trunk.samplePosition(branch.parent, t, parentPoint);
    trunk.samplePosition(i, 0, childPoint);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(parentPoint[axis] - childPoint[axis]) < 1e-7);
  }
});

test('winter wraps continuously to spring while reusing the season state', () => {
  const seasons = new SeasonController();
  const start = structuredClone(seasons.update(0));
  const state = seasons.state;
  assert.equal(seasons.update(1), state);
  assert.deepEqual(seasons.state, start);
  const before = structuredClone(seasons.update(1 - 1e-7));
  for (const property of ['leafAmount', 'snowAmount', 'flowerAmount']) assert.ok(Math.abs(before[property] - start[property]) < 1e-5);
});

test('manual season changes pause playback and notify the correct season immediately', () => {
  const scene = new TreeScene();
  let snapshot;
  scene.onHudUpdate = value => { snapshot = value; };
  scene.setAutoPlay(true);
  scene.setSeasonProgress(0.625);
  assert.equal(scene.autoPlaying, false);
  assert.equal(snapshot.seasonIndex, 2);
  assert.equal(snapshot.phaseIndex, 5);
  scene.setSeasonProgress(NaN);
  assert.equal(scene.getProgress(), 0.625);
  scene.setSeasonProgress(1);
  assert.equal(snapshot.seasonIndex, 0);
  assert.equal(scene.getProgress(), 0);
});

test('start is idempotent, stop cancels RAF, resume resets the time step', () => {
  const scene = new TreeScene();
  let requested = 0;
  const cancelled = [];
  scene.canvas = { requestAnimationFrame: () => ++requested, cancelAnimationFrame: id => cancelled.push(id) };
  scene.start(); scene.start();
  assert.equal(requested, 1);
  scene.stop(); scene.stop();
  assert.deepEqual(cancelled, [1]);
  scene.lastTick = 123;
  scene.start();
  assert.equal(scene.lastTick, 0);
  assert.equal(requested, 2);
  scene.destroy(); scene.destroy();
  assert.deepEqual(cancelled, [1, 2]);
});

test('summer foliage and spring flowers disappear correctly in winter', () => {
  const trunk = new TreeTrunk();
  const seasons = new SeasonController();
  const leaves = new LeafSystem(three, trunk);
  const flowers = new FlowerSystem(three, trunk);
  leaves.update(1, seasons.update(0.25));
  const summerCount = leaves.batch.geometry.drawRange.count;
  leaves.update(1, seasons.update(0.875));
  assert.ok(leaves.batch.geometry.drawRange.count < summerCount / 5);
  flowers.update(seasons.update(0.125));
  assert.ok(flowers.batch.geometry.drawRange.count > 0);
  flowers.update(seasons.update(0.375));
  assert.equal(flowers.batch.geometry.drawRange.count, 0);
  leaves.dispose(); flowers.dispose();
});

test('ground rotation keeps every vertex flat and batch capacity remains bounded', () => {
  const batch = new MeshBatch(three, 1);
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.002, 1.3, Math.PI / 2, [255, 255, 255]);
  batch.write(0, 0, 0, 1, 1, 1, 0, 0, [255, 255, 255]);
  batch.commit();
  const positions = batch.geometry.attributes.position.array;
  for (let i = 1; i < positions.length; i += 3) assert.ok(Math.abs(positions[i]) <= 0.002001);
  assert.equal(batch.geometry.drawRange.count, 24);
  batch.dispose();
});

test('batched face normals match transformed triangles for every shape, including flat and mixed meshes', () => {
  const batch = new MeshBatch(three, 18, 'mixed');
  const shapes = ['diamond', 'needle', 'oval', 'maple', 'star', 'fan'];
  for (const thickness of [0, 0.001, 0.04]) {
    for (const shape of shapes) {
      batch.write(0.03, 0.2, -0.1, 0.02, 0.013, thickness, 1.3, -0.8, [224, 111, 68], -5, shape);
    }
  }
  batch.commit();
  const count = batch.geometry.drawRange.count * 3;
  const reference = new three.BufferGeometry();
  reference.addAttribute('position', new three.BufferAttribute(batch.geometry.attributes.position.array.slice(0, count), 3));
  reference.computeVertexNormals();
  const expected = reference.attributes.normal.array;
  const actual = batch.geometry.attributes.normal.array;
  for (let i = 0; i < count; i++) {
    assert.ok(Number.isFinite(actual[i]));
    assert.ok(Math.abs(actual[i] - expected[i]) < 0.0001, `normal component ${i}`);
  }
  reference.dispose(); batch.dispose();
});

test('batch uploads cover active triangles after shrinking, emptying and changing mesh shapes', () => {
  const batch = new MeshBatch(three, 3, 'mixed');
  for (const shapes of [['maple', 'oval', 'fan'], ['diamond'], [], ['needle', 'star']]) {
    const versions = Object.values(batch.geometry.attributes).map(attribute => attribute.version);
    batch.begin();
    for (const shape of shapes) batch.write(0, 0, 0, 0.1, 0.05, 0.01, 0, 0, [255, 255, 255], 0, shape);
    batch.commit();
    assert.equal(batch.mesh.visible, shapes.length > 0);
    Object.values(batch.geometry.attributes).forEach((attribute, index) => {
      assert.equal(attribute.version, versions[index] + (shapes.length > 0 ? 1 : 0));
      if (shapes.length > 0) {
        assert.deepEqual(attribute.updateRange, { offset: 0, count: batch.geometry.drawRange.count * 3 });
        // The r108 renderer consumes and resets each pending range.
        attribute.updateRange.count = -1;
      }
    });
  }
  batch.dispose();
});

test('plain bark retains its color during sway and changed colors still reach the buffer', () => {
  for (const preset of [treePresetById('sakura'), treePresetById('birch'), treePresetById('crape-myrtle')]) {
    const trunk = new TreeTrunk(7, preset);
    const branches = new BranchSystem(three, trunk);
    const state = new SeasonController(preset).update(0.375);
    branches.update(state);
    const geometry = branches.group.children[0].geometry;
    const colorVersion = geometry.attributes.color.version;
    const positions = geometry.attributes.position.array.slice();
    trunk.updateSway(3, 1);
    branches.update(state);
    assert.notDeepEqual(geometry.attributes.position.array, positions);
    assert.equal(geometry.attributes.color.version, colorVersion + (preset.bark === 'plain' ? 0 : 1));
    state.trunkColor[0] = 255;
    branches.update(state);
    assert.equal(geometry.attributes.color.version, colorVersion + (preset.bark === 'plain' ? 1 : 2));
    branches.dispose();
  }
});

test('unchanged snow cover keeps emitting flakes and changed cover rebuilds mounds', () => {
  const particles = new ParticleSystem(three);
  const snow = new SnowSystem(three, particles);
  const state = new SeasonController().update(0.875);
  state.snowAmount = 0.7; state.snowRate = 20;
  snow.update(0, 1, state);
  const version = snow.batch.geometry.attributes.position.version;
  snow.update(0.1, 1, state);
  assert.equal(snow.batch.geometry.attributes.position.version, version);
  assert.ok(particles.pool.some(particle => particle.active && particle.kind === 'snow'));
  state.snowAmount = 0.4;
  snow.update(0, 1, state);
  assert.equal(snow.batch.geometry.attributes.position.version, version + 1);
  assert.equal(snow.batch.material.opacity, 0.4);
  state.snowAmount = 0;
  snow.update(0, 1, state);
  assert.equal(snow.batch.mesh.visible, false);
  snow.dispose(); particles.dispose();
});

test('unchanged HUD snapshots are skipped while commands and playback still notify', () => {
  const scene = new TreeScene();
  const snapshots = [];
  scene.onHudUpdate = snapshot => snapshots.push(snapshot);
  scene.pushHud(false);
  scene.lastHudAt = 0;
  scene.pushHud(false);
  assert.equal(snapshots.length, 1);
  scene.setAutoPlay(true);
  assert.equal(snapshots.length, 2);
  scene.update(0.2);
  scene.lastHudAt = 0;
  scene.pushHud(false);
  assert.equal(snapshots.length, 3);
  assert.ok(snapshots[2].progress > snapshots[1].progress);
  scene.destroy();
});

test('falling leaves settle and a large season jump removes stale particles', () => {
  const seasons = new SeasonController();
  const autumn = seasons.update(0.625);
  const particles = new ParticleSystem(three);
  particles.emit('leaf', { x: 0.1, y: 0.01, z: 0.1, size: 0.02, tint: 0 }, autumn);
  particles.update(0.2, 0.2, autumn);
  particles.update(0, 0.2, autumn);
  assert.ok(particles.batch.geometry.drawRange.count > 0);
  const scene = new TreeScene();
  scene.particles = particles;
  scene.setSeasonProgress(0.375);
  assert.equal(particles.batch.geometry.drawRange.count, 0);
  scene.destroy();
});

test('attach sizes the drawing buffer with capped DPR and destroy disposes every resource once', () => {
  const adapter = require('../miniprogram/vendor/three');
  const originalFactory = adapter.createScopedThreejs;
  const originalWx = global.wx;
  let renderer;
  class Renderer {
    constructor() { renderer = this; this.disposed = 0; this.lost = 0; }
    setPixelRatio(value) { this.ratio = value; }
    setSize(width, height, updateStyle) { this.size = [width, height]; assert.equal(updateStyle, false); }
    clear() {}
    render() {}
    dispose() { this.disposed++; }
    forceContextLoss() { this.lost++; }
  }
  adapter.createScopedThreejs = () => ({ ...three, WebGLRenderer: Renderer });
  global.wx = { getWindowInfo: () => ({ pixelRatio: 3 }) };
  try {
    const scene = new TreeScene();
    scene.attach({ requestAnimationFrame() { return 1; }, cancelAnimationFrame() {} }, 375, 600);
    assert.equal(renderer.ratio, 2);
    assert.deepEqual(renderer.size, [375, 600]);
    const resources = new Map();
    for (const root of [scene.world, scene.sky]) root.traverse(object => {
      for (const resource of [object.geometry, object.material]) {
        if (resource && !resources.has(resource)) {
          resources.set(resource, 0);
          resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
        }
      }
    });
    scene.destroy(); scene.destroy();
    assert.ok(resources.size >= 14);
    for (const disposed of resources.values()) assert.equal(disposed, 1);
    assert.equal(renderer.disposed, 1);
    assert.equal(renderer.lost, 1);
    assert.equal(scene.canvas, null);
  } finally { adapter.createScopedThreejs = originalFactory; global.wx = originalWx; }
});

test('failed attachment releases a partially initialized renderer and does not start RAF', () => {
  const adapter = require('../miniprogram/vendor/three');
  const originalFactory = adapter.createScopedThreejs;
  const originalWx = global.wx;
  let disposed = 0;
  let lost = 0;
  class Renderer {
    setPixelRatio() {}
    setSize() { throw new Error('Drawing buffer allocation failed'); }
    dispose() { disposed++; }
    forceContextLoss() { lost++; }
  }
  adapter.createScopedThreejs = () => ({ ...three, WebGLRenderer: Renderer });
  global.wx = { getWindowInfo: () => ({ pixelRatio: 2 }) };
  try {
    const scene = new TreeScene();
    assert.throws(() => scene.attach({ requestAnimationFrame() { assert.fail('Unexpected RAF'); } }, 375, 600), /allocation failed/);
    scene.start(); scene.destroy();
    assert.equal(disposed, 1);
    assert.equal(lost, 1);
    assert.equal(scene.canvas, null);
  } finally { adapter.createScopedThreejs = originalFactory; global.wx = originalWx; }
});
