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
  const wxApi = {
    getWindowInfo: () => ({ statusBarHeight: 20 }),
    createSelectorQuery: makeQuery,
  };
  // 部分模拟器实现 wx.nextTick，部分不实现（见 nextTick 回退测试）。
  if (options.wxNextTick !== false) wxApi.nextTick = callback => nextTicks.push(callback);
  // 同理 wx.showToast / wx.login 也可能缺失。
  if (options.wxShowToast !== false) wxApi.showToast = () => {};
  if (options.wxLogin !== false) wxApi.login = () => ({ fail() {} });

  const context = {
    exports: {},
    Page: value => { definition = value; },
    require: id => id.endsWith('/TreeScene') ? { TreeScene: Scene } : require(resolve(path, '..', id)),
    wx: wxApi,
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

/* ------------------------------------------------------------------ *
 * 模拟器兼容性：部分 wx API 缺失时不得抛错
 * 参考：WorkBuddy 预览面板的模拟器只实现了部分 wx API。
 * 缺方法时裸调用会抛 "wx.nextTick is not a function" 并中断页面生命周期，
 * 导致场景根本起不来——这比功能缺失更难排查。
 * ------------------------------------------------------------------ */

test('falls back to setTimeout when wx.nextTick is missing (preview simulator)', () => {
  const { page, Scene, queries, timers, nextTicks } = pageHarness({ wxNextTick: false });

  // 展开设置会走 measureScene → 原本直接调 wx.nextTick
  page.scene = new Scene();
  page.onToggleControls();

  assert.equal(nextTicks.length, 0, '该环境不应调用 wx.nextTick');
  assert.equal(timers.size, 1, '应退化为 setTimeout');
  assert.equal(page.data.controlsOpen, true);

  // 回退的回调仍要真的执行并完成测量
  [...timers.values()][0]();
  queries.shift()([{ width: 375, height: 320 }]);
  assert.deepEqual(page.scene.size, [375, 320]);
});

test('scene still initializes when the simulator lacks nextTick entirely', () => {
  const { page, queries, timers } = pageHarness({ wxNextTick: false });
  page.setupScene();
  assert.equal(queries.length, 1);
  queries[0]([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.data.renderState, 'ready');
  assert.notEqual(page.scene, null);
  assert.equal(page.scene.started, true);
});

test('onReady path completes without wx.nextTick', () => {
  const { page, queries, timers } = pageHarness({ wxNextTick: false });
  // onReady → setupScene，页面不因缺少 wx.nextTick 而抛错
  page.onReady();
  queries[0]([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.data.renderState, 'ready');
  assert.notEqual(page.scene, null);
});

test('canvas remount retry works without wx.nextTick', () => {
  const { page, queries, timers } = pageHarness({ wxNextTick: false });
  page.setData({ renderState: 'error' });
  page.onRetryScene();
  page.setData({ canvasMounted: true });
  // 回退用的是 setTimeout 而非 wx.nextTick
  [...timers.values()][0]();
  assert.equal(queries.length, 1);
  queries[0]([{ node: {}, width: 375, height: 600 }]);
  assert.equal(page.data.renderState, 'ready');
  assert.notEqual(page.scene, null);
});

test('weather failure prompt is skipped silently when wx.showToast is missing', () => {
  const { page } = pageHarness({ wxShowToast: false });
  // 不应抛错：toast 缺失只是少一条提示，不能中断失败处理
  page.toast('天气暂不可用');
  page.applyWeather(null);
  assert.equal(page.data.weatherErrorText, '天气暂不可用 · 点此重试');
});

test('cloud sync degrades to local mode when wx.login is missing (preview simulator)', () => {
  const { page } = pageHarness({ wxLogin: false });
  // 关键：onLoad 不得抛错，否则后面的天气取数与场景初始化都跑不到
  page.onLoad();
  assert.equal(page.data.cloudStatusText, '本地模式 · 进度不保存');
});

test('memory warning stops the render loop and onShow brings it back', () => {
  const { page, Scene } = pageHarness();
  const { broadcastMemoryWarning, resetMemoryWarningForTest } = require(resolve(__dirname, '../miniprogram/utils/app-events.js'));
  resetMemoryWarningForTest();
  page.onLoad();
  page.scene = new Scene();
  page.scene.start();
  // 模拟 app.ts 收到 wx.onMemoryWarning 后转发
  broadcastMemoryWarning(15);
  assert.equal(page.scene.started, false, 'render loop must yield under memory pressure');
  // 告警是瞬时信号，回前台必须自动恢复，不能停在黑屏
  page.onShow();
  assert.equal(page.scene.started, true);
  page.onUnload();
  resetMemoryWarningForTest();
});

test('a memory warning arriving before the scene exists is replayed, not dropped', () => {
  const { page, Scene, queries } = pageHarness();
  const { broadcastMemoryWarning, resetMemoryWarningForTest, highestMemoryWarningLevel } =
    require(resolve(__dirname, '../miniprogram/utils/app-events.js'));
  resetMemoryWarningForTest();
  // 先广播再订阅：onLoad 补判历史告警，场景就绪后应立刻停表
  broadcastMemoryWarning(10);
  page.onLoad();
  page.setupScene();
  queries[0]([{ node: {}, width: 375, height: 600 }]);
  assert.equal(highestMemoryWarningLevel(), 10);
  assert.equal(page.scene.started, false);
  page.onUnload();
  resetMemoryWarningForTest();
});

test('unsubscribing on unload keeps the memory warning bus free of dead pages', () => {
  const { page } = pageHarness();
  const { broadcastMemoryWarning, resetMemoryWarningForTest, onMemoryWarning } =
    require(resolve(__dirname, '../miniprogram/utils/app-events.js'));
  resetMemoryWarningForTest();
  page.onLoad();
  let notified = 0;
  const off = onMemoryWarning(() => { notified++; });
  page.onUnload();
  broadcastMemoryWarning(15);
  assert.equal(notified, 1, 'other subscribers must still be notified');
  off();
  broadcastMemoryWarning(15);
  assert.equal(notified, 1);
  resetMemoryWarningForTest();
});
