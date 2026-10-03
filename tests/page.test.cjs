const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

function pageHarness(options = {}) {
  const instanceQuery = options.instanceQuery !== false;
  let definition;
  let nextTimer = 0;
  const timers = new Map();
  const queries = [];
  const nextTicks = [];
  const path = resolve(__dirname, '../miniprogram/pages/season-tree/index.js');
  class Scene {
    constructor() { this.started = false; this.destroyed = false; }
    attach() { if (Scene.fail) throw new Error('WebGL unavailable'); }
    start() { this.started = true; }
    stop() { this.started = false; }
    destroy() { this.destroyed = true; }
    getProgress() { return 0; }
    resize(width, height) { this.size = [width, height]; }
    getSnapshot() {
      return {
        progress: 0, seasonIndex: 0, phaseIndex: 0, playing: false,
        presetId: 'sakura', growthProgress: 0.75, growthStageIndex: 3, growthPlaying: false,
        timeProgress: 0.5, dayPlaying: false, weather: 'auto', weatherIntensity: 0.65, lightIntensity: 1,
      };
    }
  }
  Scene.fail = false;
  const makeQuery = () => {
    const query = { select() { return query; }, fields() { return query; }, exec(callback) { queries.push(callback); } };
    return query;
  };
  const context = {
    exports: {},
    Page: value => { definition = value; },
    require: id => id.endsWith('/TreeScene') ? { TreeScene: Scene } : require(resolve(path, '..', id)),
    wx: {
      nextTick: callback => nextTicks.push(callback),
      getWindowInfo: () => ({ statusBarHeight: 20 }),
      createSelectorQuery: makeQuery,
    },
    console: { error() {} },
    setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  };
  vm.runInNewContext(readFileSync(path, 'utf8'), context, { filename: path });
  const page = Object.assign({}, definition, {
    data: { ...definition.data },
    setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback(); },
    ...(instanceQuery ? { createSelectorQuery: makeQuery } : {}),
  });
  return { page, Scene, queries, timers, nextTicks };
}

test('repeated HUD updates do not indefinitely postpone the caption transition', () => {
  const { page, Scene, timers } = pageHarness();
  const snapshot = { ...new Scene().getSnapshot(), progress: 0.3, seasonIndex: 1, phaseIndex: 2 };
  page.syncHud(snapshot);
  const original = [...timers.keys()];
  page.syncHud(snapshot);
  assert.deepEqual([...timers.keys()], original);
  [...timers.values()][0]();
  assert.equal(page.data.seasonTitle, '夏');
  assert.equal(page.pendingCaption, '');
});

test('late canvas query cannot start a scene after page unload', () => {
  const { page, queries } = pageHarness();
  page.setupScene();
  page.onUnload();
  queries[0]([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.scene, null);
});

test('falls back to wx.createSelectorQuery when the page instance lacks it (preview simulator)', () => {
  const { page, queries } = pageHarness({ instanceQuery: false });
  page.setupScene();
  queries[0]([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.data.renderState, 'ready');
  assert.notEqual(page.scene, null);
  assert.equal(page.scene.started, true);
});

test('a scene initialized while hidden stays paused until onShow', () => {
  const { page, queries } = pageHarness();
  page.setupScene(); page.onHide();
  queries[0]([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.scene.started, false);
  page.onShow(); assert.equal(page.scene.started, true);
  page.onUnload(); assert.equal(page.scene, null);
});

test('WebGL initialization failure shows retry and a fresh canvas can initialize', () => {
  const { page, Scene, queries, nextTicks } = pageHarness();
  Scene.fail = true;
  page.setupScene(); queries.shift()([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.data.renderState, 'error');
  assert.equal(page.scene, null);
  Scene.fail = false;
  page.onRetryScene(); nextTicks.shift()();
  queries.shift()([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.data.renderState, 'ready');
  assert.equal(page.data.canvasMounted, true);
});

test('resize uses stage dimensions instead of whole-window dimensions', () => {
  const { page, Scene, queries, nextTicks } = pageHarness();
  page.scene = new Scene();
  page.onResize({ size: { windowWidth: 800, windowHeight: 900, statusBarHeight: 24 } });
  nextTicks.shift()(); queries.shift()([{ width: 800, height: 740 }]);
  assert.deepEqual(page.scene.size, [800, 740]);
});

test('touch transitions support rotate and pinch without jumping after a finger lifts', () => {
  const { page } = pageHarness();
  const rotations = [];
  const zooms = [];
  page.scene = { rotateView: (...delta) => rotations.push(delta), zoomView: ratio => zooms.push(ratio) };
  const touch = (x, y) => ({ clientX: x, clientY: y });
  page.onCanvasTouchStart({ touches: [touch(20, 40)] });
  page.onCanvasTouchMove({ touches: [touch(30, 45)] });
  assert.deepEqual(rotations, [[10, 5]]);
  page.onCanvasTouchStart({ touches: [touch(30, 45), touch(130, 45)] });
  page.onCanvasTouchMove({ touches: [touch(30, 45), touch(180, 45)] });
  assert.equal(zooms[0], 1.5);
  page.onCanvasTouchEnd({ touches: [touch(180, 45)] });
  page.onCanvasTouchMove({ touches: [touch(185, 46)] });
  assert.deepEqual(rotations[1], [5, 1]);
});

test('same-season species changes update captions without repeating their fade timer', () => {
  const { page, Scene, timers } = pageHarness();
  const snapshot = { ...new Scene().getSnapshot(), presetId: 'ginkgo' };
  page.syncHud(snapshot);
  const original = [...timers.keys()];
  page.syncHud(snapshot);
  assert.deepEqual([...timers.keys()], original);
  assert.equal(page.data.presetLabel, '🟡 银杏');
  [...timers.values()][0]();
  assert.equal(page.data.seasonSlogan, '嫩绿新叶');
});

test('expanding growth and environment settings measures the newly sized canvas', () => {
  const { page, Scene, queries, nextTicks } = pageHarness();
  page.scene = new Scene();
  page.onToggleControls();
  assert.equal(page.data.controlsOpen, true);
  nextTicks.shift()(); queries.shift()([{ width: 375, height: 320 }]);
  assert.deepEqual(page.scene.size, [375, 320]);
});
