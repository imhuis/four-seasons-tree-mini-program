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
    const t = branch.parentT;
    trunk.samplePosition(branch.parent, t, parentPoint);
    trunk.samplePosition(i, 0, childPoint);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(parentPoint[axis] - childPoint[axis]) < 1e-7);
  }
});

test('branch tangents follow the live curve during growth and wind', () => {
  const trunk = new TreeTrunk();
  const before = { x: 0, y: 0, z: 0 }, after = { x: 0, y: 0, z: 0 }, tangent = { x: 0, y: 0, z: 0 };
  const step = 0.001;
  for (const growth of [0, 0.24, 0.55, 1]) {
    trunk.setGrowth(growth); trunk.updateSway(8, 1);
    for (let id = 0; id < trunk.count; id++) {
      for (const t of [0.05, 0.5, 0.95]) {
        trunk.samplePosition(id, t - step, before); trunk.samplePosition(id, t + step, after);
        trunk.sampleTangent(id, t, tangent);
        for (const axis of ['x', 'y', 'z']) {
          assert.ok(Math.abs(tangent[axis] - (after[axis] - before[axis]) / (2 * step)) < 1e-7);
        }
      }
    }
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

test('batched face normals match transformed triangles for solid and rolled thin leaves', () => {
  const shapes = ['diamond', 'needle', 'oval', 'maple', 'star', 'fan'];
  for (const surface of ['solid', 'leaf']) {
    const batch = new MeshBatch(three, 18, 'mixed', surface);
    for (const thickness of [0, 0.001, 0.04]) {
      for (const shape of shapes) {
        batch.write(0.03, 0.2, -0.1, 0.02, 0.013, thickness, 1.3, -0.8, [224, 111, 68], -5, shape, 0.7);
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
  }
});

test('batch uploads cover active triangles after shrinking, emptying and changing mesh shapes', () => {
  for (const surface of ['solid', 'leaf']) {
    const batch = new MeshBatch(three, 3, 'mixed', surface);
    for (const shapes of [['maple', 'oval', 'fan'], ['diamond'], [], ['needle', 'star']]) {
      const geometry = batch.geometry;
      // 几何通道每帧必传；颜色走脏标记，单独断言（见下一个用例）。
      const versionOf = name => geometry.attributes[name].version;
      const channels = Object.keys(geometry.attributes).filter(name => name !== 'color');
      const before = Object.fromEntries(channels.map(name => [name, versionOf(name)]));
      batch.begin();
      for (const shape of shapes) batch.write(0, 0, 0, 0.1, 0.05, 0.01, 0, 0, [255, 255, 255], 0, shape);
      batch.commit();
      assert.equal(batch.mesh.visible, shapes.length > 0);
      for (const name of channels) {
        const attribute = geometry.attributes[name];
        assert.equal(attribute.version, before[name] + (shapes.length > 0 ? 1 : 0));
        if (shapes.length > 0) {
          assert.deepEqual(attribute.updateRange, { offset: 0, count: geometry.drawRange.count * attribute.itemSize });
          // The r108 renderer consumes and resets each pending range.
          attribute.updateRange.count = -1;
        }
      }
    }
    batch.dispose();
  }
});

test('color channel uploads once when unchanged and again when it actually shifts', () => {
  // 首帧必传：GPU 缓冲区初始内容未定义，即使写入值恰好是默认值。
  const batch = new MeshBatch(three, 2, 'diamond');
  const color = batch.geometry.attributes.color;
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.01, 0, 0, [255, 255, 255]);
  batch.commit();
  const first = color.version;
  assert.equal(first, 1, 'first commit must upload color');

  // 同一颜色再写一帧：几何照常更新，颜色不重传。
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.01, 0, 0, [255, 255, 255]);
  batch.commit();
  assert.equal(color.version, first, 'unchanged color must not re-upload');
  assert.equal(batch.geometry.attributes.position.version > 0, true, 'geometry still updates');

  // 半阶以内的插值位移同样跳过——季节色就是这样逐帧微移的。
  // 真实单帧位移约 0.09 个色阶，这里取 0.4 个色阶做亚阈值样本。
  const nudged = [255, 255, 254.6];
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.01, 0, 0, nudged);
  batch.commit();
  assert.equal(color.version, first, 'sub-threshold drift must not re-upload');

  // 整阶级别的变化则必须上传，且写入的是本帧真实值。
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.01, 0, 0, [200, 40, 40]);
  batch.commit();
  assert.equal(color.version, first + 1, 'real color change must upload');
  const blue = color.array[2];
  assert.ok(Math.abs(blue - 40 / 255) < 0.001, `blue channel should be current, got ${blue}`);

  // 缩量（顶点数变少）时颜色无需重传：drawRange 变小，缓冲区内容依旧有效。
  const stable = color.version;
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.01, 0, 0, [200, 40, 40]);
  batch.commit();
  assert.equal(color.version, stable, 'shrinking batch keeps color buffer valid');
  batch.dispose();
});

test('emptied batch clears the mesh and lets the next frame re-upload color', () => {
  const batch = new MeshBatch(three, 2, 'diamond');
  const color = batch.geometry.attributes.color;
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.01, 0, 0, [12, 200, 90]);
  batch.commit();
  const uploaded = color.version;

  batch.begin();
  batch.commit();
  assert.equal(batch.mesh.visible, false);
  assert.equal(batch.geometry.drawRange.count, 0);

  // 清空后颜色数组仍保留上次的值，因此同色重建不该重传——这正是我们想要的。
  batch.begin();
  batch.write(0, 0, 0, 0.1, 0.08, 0.01, 0, 0, [12, 200, 90]);
  batch.commit();
  assert.equal(color.version, uploaded);
  assert.equal(batch.mesh.visible, true);
  batch.dispose();
});

test('leaf petioles stay on live branches while their vein coordinates remain static', () => {
  for (const id of ['sakura', 'japanese-maple', 'ginkgo', 'dawn-redwood']) {
    const preset = treePresetById(id);
    const trunk = new TreeTrunk(7, preset);
    const leaves = new LeafSystem(three, trunk);
    const state = new SeasonController(preset).update(0.375);
    const geometry = leaves.batch.geometry;
    const uv = geometry.attributes.uv;
    const uvVersion = uv.version, coordinates = uv.array.slice();
    const verticesPerLeaf = geometry.attributes.position.count / leaves.leaves.length;
    const joint = { x: 0, y: 0, z: 0 };
    for (const growth of [0.38, 0.75, 1]) {
      trunk.setGrowth(growth);
      for (const time of [0, 3, 7]) {
        trunk.updateSway(time, 1); leaves.update(time, state);
        leaves.visible.forEach((index, item) => {
          const leaf = leaves.leaves[index];
          trunk.samplePosition(leaf.branch, leaf.t, joint);
          // The petiole's two base corners straddle its attachment point.
          const base = (item * verticesPerLeaf + verticesPerLeaf - 3) * 3;
          const positions = geometry.attributes.position.array;
          ['x', 'y', 'z'].forEach((axis, component) => {
            assert.ok(Math.abs((positions[base + component] + positions[base + 6 + component]) / 2 - joint[axis]) < 1e-7);
          });
        });
        assert.equal(uv.version, uvVersion);
        assert.deepEqual(uv.array, coordinates);
      }
    }
    leaves.dispose();
  }
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
