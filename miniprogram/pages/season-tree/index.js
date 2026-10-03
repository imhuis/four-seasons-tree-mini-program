"use strict";
/**
 * 四时木 · 页面层
 *
 * 这一层刻意保持"薄"：
 * - 它不参与任何逐帧计算，只负责把 Canvas 节点交给 TreeScene；
 * - setData 仅用于 UI 状态（滑块位置、季节文案），并通过 HUD 节流
 *   （TreeScene 每 120ms 才回调一次）把频率压到 8 次/秒左右，
 *   绝不会把 60FPS 的动画数据塞进 data。
 */
Object.defineProperty(exports, "__esModule", { value: true });
const TreeScene_1 = require("../../render/TreeScene");
const types_1 = require("../../render/types");
const TreePresets_1 = require("../../render/TreePresets");
const GrowthController_1 = require("../../render/GrowthController");
const EnvironmentController_1 = require("../../render/EnvironmentController");
const season_sync_1 = require("../../utils/season-sync");
/** 文案交叠淡出的时长（毫秒），需与 index.wxss 里的 transition 保持一致。 */
const CAPTION_FADE_MS = 140;
/** 浏览进度写入云端的去抖间隔（毫秒）：拖动结束稍作停留再保存。 */
const CLOUD_SAVE_DEBOUNCE_MS = 2000;
Page({
    data: {
        safeTop: 20,
        sliderValue: 0,
        seasonTitle: types_1.SEASON_TITLES[0],
        seasonSlogan: TreePresets_1.DEFAULT_TREE_PRESET.seasons[0],
        phaseName: types_1.PHASE_NAMES[0],
        playing: false,
        captionFading: false,
        renderState: 'loading',
        canvasMounted: true,
        presetNames: TreePresets_1.TREE_PRESETS.map(preset => `${preset.icon} ${preset.name}`),
        presetIndex: 0,
        presetLabel: `${TreePresets_1.DEFAULT_TREE_PRESET.icon} ${TreePresets_1.DEFAULT_TREE_PRESET.name}`,
        treeDescription: TreePresets_1.DEFAULT_TREE_PRESET.description,
        controlsOpen: false,
        growthValue: 750,
        growthStage: '成树',
        growthPlaying: false,
        timeValue: 720,
        timeText: '12:00',
        dayPlaying: false,
        weatherLabels: EnvironmentController_1.WEATHER_LABELS,
        weatherIndex: 0,
        weatherValue: 65,
        lightValue: 100,
        isNight: false,
        cloudStatusText: '连接云端…',
    },
    /** 场景实例。所有动画状态都在这里面，不进 data。 */
    scene: null,
    captionTimer: null,
    pendingCaption: '',
    pendingSlogan: '',
    visible: true,
    disposed: false,
    setupAttempt: 0,
    touchX: 0,
    touchY: 0,
    pinchDistance: 0,
    touchCount: 0,
    /* --- 云同步 --- */
    /** 独立访客数（每用户只计一次）。 */
    visitCount: 0,
    /** 云端恢复的进度：场景就绪前先暂存，就绪后再应用。 */
    pendingRestoreProgress: -1,
    /** 最近一次成功写入云端的进度（去重，避免重复 upsert）。 */
    lastSavedProgress: -1,
    cloudSaveTimer: null,
    onLoad() {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        this.setData({ safeTop: info.statusBarHeight || 20 });
        this.startCloudSync();
    },
    onReady() {
        this.setupScene();
    },
    onShow() {
        this.visible = true;
        // 首次 onShow 时场景还没建好（onReady 在 onShow 之后），这里直接跳过
        const scene = this.scene;
        if (scene !== null)
            scene.start();
    },
    onHide() {
        this.visible = false;
        this.touchCount = 0;
        // 页面不可见时立刻停表：小程序在后台继续跑 rAF 会持续耗电
        const scene = this.scene;
        if (scene !== null)
            scene.stop();
        // 退到后台前把最新进度写进云端（后台定时器不再可靠，这里直接落库）。
        this.flushCloudSave();
    },
    onUnload() {
        this.disposed = true;
        this.setupAttempt++;
        this.flushCloudSave();
        if (this.captionTimer !== null) {
            clearTimeout(this.captionTimer);
            this.captionTimer = null;
        }
        const scene = this.scene;
        if (scene !== null) {
            scene.destroy();
            this.scene = null;
        }
    },
    onResize(res) {
        const scene = this.scene;
        if (scene === null)
            return;
        this.setData({ safeTop: res.size.statusBarHeight || this.data.safeTop });
        this.measureScene();
    },
    /**
     * 兼容获取 SelectorQuery。
     * - 真机 / 微信开发者工具：Page 实例自带 createSelectorQuery，默认作用于当前页面；
     * - WorkBuddy 预览面板等模拟器：只实现全局 wx.createSelectorQuery，没有挂到页面实例上，
     *   直接调 this.createSelectorQuery() 会抛 "is not a function" 并中断生命周期；
     *   wx.createSelectorQuery() 在页面中调用时同样默认作用于当前页面，可安全回退。
     * 两者都不可用时返回 null，由调用方走错误 / 忽略路径。
     */
    selectorQuery() {
        if (typeof this.createSelectorQuery === 'function') {
            return this.createSelectorQuery();
        }
        if (typeof wx !== 'undefined' && typeof wx.createSelectorQuery === 'function') {
            return wx.createSelectorQuery();
        }
        return null;
    },
    measureScene() {
        const scene = this.scene;
        if (scene === null)
            return;
        // The stage excludes the safe area and controls; window size is not canvas size.
        wx.nextTick(() => {
            if (this.disposed || this.scene !== scene)
                return;
            const query = this.selectorQuery();
            if (query === null)
                return;
            query.select('#seasonCanvas').fields({ size: true }).exec((results) => {
                if (this.disposed || this.scene !== scene)
                    return;
                const size = results[0];
                if ((size === null || size === void 0 ? void 0 : size.width) && size.height)
                    scene.resize(size.width, size.height);
            });
        });
    },
    /* ---------------------------------------------------------------- *
     * 初始化
     * ---------------------------------------------------------------- */
    setupScene() {
        const attempt = ++this.setupAttempt;
        const query = this.selectorQuery();
        if (query === null) {
            this.setData({ renderState: 'error' });
            return;
        }
        query
            .select('#seasonCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
            var _a, _b;
            if (this.disposed || attempt !== this.setupAttempt)
                return;
            const first = res[0];
            if (first === undefined || first.node === undefined) {
                this.setData({ renderState: 'error' });
                return;
            }
            const scene = new TreeScene_1.TreeScene();
            try {
                scene.attach(first.node, (_a = first.width) !== null && _a !== void 0 ? _a : 0, (_b = first.height) !== null && _b !== void 0 ? _b : 0);
            }
            catch (error) {
                console.error('WebGL scene initialization failed', error);
                this.setData({ renderState: 'error' });
                return;
            }
            scene.onHudUpdate = (snapshot) => {
                this.syncHud(snapshot);
            };
            this.scene = scene;
            this.setData({ renderState: 'ready' });
            if (this.visible)
                scene.start();
            // 云端进度若先于场景返回，在这里补应用一次。
            if (this.pendingRestoreProgress >= 0) {
                scene.setSeasonProgress(this.pendingRestoreProgress);
                this.pendingRestoreProgress = -1;
            }
            this.syncHud(scene.getSnapshot());
        });
    },
    onRetryScene() {
        var _a;
        if (this.data.renderState !== 'error')
            return;
        (_a = this.scene) === null || _a === void 0 ? void 0 : _a.destroy();
        this.scene = null;
        // The adapter scopes itself to a canvas once; retry with a new native node.
        this.setData({ renderState: 'loading', canvasMounted: false, playing: false }, () => {
            if (this.disposed)
                return;
            this.setData({ canvasMounted: true }, () => {
                wx.nextTick(() => { if (!this.disposed)
                    this.setupScene(); });
            });
        });
    },
    /* ---------------------------------------------------------------- *
     * HUD 同步（逐帧状态只留在场景内）
     * ---------------------------------------------------------------- */
    syncHud(snapshot) {
        var _a, _b, _c, _d;
        const presetIndex = TreePresets_1.TREE_PRESETS.findIndex(preset => preset.id === snapshot.presetId);
        const preset = (_a = TreePresets_1.TREE_PRESETS[presetIndex]) !== null && _a !== void 0 ? _a : TreePresets_1.DEFAULT_TREE_PRESET;
        const minutes = Math.floor(snapshot.timeProgress * 1440) % 1440;
        const patch = {
            playing: snapshot.playing,
            presetIndex: Math.max(0, presetIndex), presetLabel: `${preset.icon} ${preset.name}`,
            treeDescription: preset.description,
            growthValue: Math.round(snapshot.growthProgress * 1000), growthStage: GrowthController_1.GROWTH_STAGES[snapshot.growthStageIndex],
            growthPlaying: snapshot.growthPlaying, timeValue: minutes,
            timeText: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
            dayPlaying: snapshot.dayPlaying, weatherIndex: EnvironmentController_1.WEATHER_MODES.indexOf(snapshot.weather),
            weatherValue: Math.round(snapshot.weatherIntensity * 100), lightValue: Math.round(snapshot.lightIntensity * 100),
            isNight: snapshot.timeProgress < 0.25 || snapshot.timeProgress > 0.75,
        };
        const sliderValue = Math.round(snapshot.progress * 1000);
        if (sliderValue !== this.data.sliderValue) {
            patch.sliderValue = sliderValue;
        }
        const phaseName = (_b = types_1.PHASE_NAMES[snapshot.phaseIndex]) !== null && _b !== void 0 ? _b : types_1.PHASE_NAMES[0];
        if (phaseName !== this.data.phaseName) {
            patch.phaseName = phaseName;
        }
        const title = (_c = types_1.SEASON_TITLES[snapshot.seasonIndex]) !== null && _c !== void 0 ? _c : types_1.SEASON_TITLES[0];
        const slogan = (_d = preset.seasons[snapshot.seasonIndex]) !== null && _d !== void 0 ? _d : '';
        if (title !== (this.pendingCaption || this.data.seasonTitle) || slogan !== (this.pendingSlogan || this.data.seasonSlogan)) {
            this.applyCaption(title, slogan);
        }
        for (const key of Object.keys(patch))
            if (patch[key] === this.data[key])
                delete patch[key];
        if (Object.keys(patch).length > 0) {
            this.setData(patch);
        }
    },
    /**
     * 季节标题的交叠淡出：先淡出旧文案，再换成新文案并淡入。
     * 用定时器而不是直接替换，是为了避免文字在拖动时"硬切"。
     */
    applyCaption(title, slogan) {
        if (this.captionTimer !== null) {
            clearTimeout(this.captionTimer);
        }
        this.pendingCaption = title;
        this.pendingSlogan = slogan;
        this.setData({ captionFading: true });
        this.captionTimer = setTimeout(() => {
            this.captionTimer = null;
            this.pendingCaption = '';
            this.pendingSlogan = '';
            this.setData({ seasonTitle: title, seasonSlogan: slogan, captionFading: false });
        }, CAPTION_FADE_MS);
    },
    /* ---------------------------------------------------------------- *
     * 云同步（浏览进度保存 / 恢复 · 独立访客计数）
     * ---------------------------------------------------------------- */
    startCloudSync() {
        (0, season_sync_1.initCloudSync)({
            onStatus: (status) => {
                this.updateCloudStatusText(status);
            },
            onVisitCount: (count) => {
                this.visitCount = count;
                this.updateCloudStatusText((0, season_sync_1.isCloudSessionReady)() ? 'synced' : 'local');
            },
            onRestoredProgress: (progress) => {
                const scene = this.scene;
                if (scene !== null) {
                    scene.setSeasonProgress(progress);
                }
                else {
                    // 场景尚未就绪：暂存，setupScene 完成后应用。
                    this.pendingRestoreProgress = progress;
                }
            },
        });
    },
    updateCloudStatusText(status) {
        let text;
        if (status === 'connecting') {
            text = '连接云端…';
        }
        else if (status === 'synced') {
            text = this.visitCount > 0 ? `已同步 · 第 ${this.visitCount} 位访客` : '已同步';
        }
        else {
            text = '本地模式 · 进度不保存';
        }
        if (text !== this.data.cloudStatusText)
            this.setData({ cloudStatusText: text });
    },
    /** 拖动结束/自动播放推进后调用：去抖合并短时间内的多次进度变化。 */
    scheduleCloudSave() {
        if (this.scene === null || !(0, season_sync_1.isCloudSessionReady)())
            return;
        if (this.cloudSaveTimer !== null)
            return;
        this.cloudSaveTimer = setTimeout(() => {
            this.cloudSaveTimer = null;
            this.flushCloudSave();
        }, CLOUD_SAVE_DEBOUNCE_MS);
    },
    /**
     * 把当前浏览进度写入云端（去抖到期 / onHide 时调用）。
     * 场景对象是进度的唯一数据源，直接读取，避免维护第二份状态。
     */
    flushCloudSave() {
        if (this.cloudSaveTimer !== null) {
            clearTimeout(this.cloudSaveTimer);
            this.cloudSaveTimer = null;
        }
        const scene = this.scene;
        if (scene === null || !(0, season_sync_1.isCloudSessionReady)())
            return;
        const progress = scene.getProgress();
        if (progress === this.lastSavedProgress)
            return;
        this.lastSavedProgress = progress;
        // fire-and-forget：失败信息由 season-sync 打进日志，不打断页面。
        void (0, season_sync_1.saveSeasonProgress)(progress);
    },
    /* ---------------------------------------------------------------- *
     * 交互
     * ---------------------------------------------------------------- */
    onSliderChanging(e) {
        const scene = this.scene;
        if (scene === null)
            return;
        // 场景更新归一化进度，并将季节文案同步回 HUD。
        scene.setSeasonProgress(e.detail.value / 1000);
        if (this.data.playing)
            this.setData({ playing: false });
        // bindchanging（type=drag）只驱动动画；bindchange（type=change，拖动结束）才写云端。
        if (e.type === 'change')
            this.scheduleCloudSave();
    },
    onTogglePlay() {
        const scene = this.scene;
        if (scene === null)
            return;
        const playing = !scene.autoPlaying;
        scene.setAutoPlay(playing);
        // 按钮状态跟随场景的自动播放状态。
        this.setData({ playing });
    },
    onPresetChange(e) {
        var _a;
        const preset = TreePresets_1.TREE_PRESETS[Number(e.detail.value)];
        if (preset === undefined)
            return;
        try {
            (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setTreePreset(preset.id);
        }
        catch (error) {
            console.error('Tree preset initialization failed', error);
            wx.showToast({ title: '树种切换失败，请重试', icon: 'none' });
        }
    },
    onToggleControls() { this.setData({ controlsOpen: !this.data.controlsOpen }, () => this.measureScene()); },
    onGrowthChanging(e) { var _a; (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setGrowthProgress(e.detail.value / 1000); },
    onToggleGrowth() { var _a; (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setGrowthPlay(!this.data.growthPlaying); },
    onTimeChanging(e) { var _a; (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setTimeProgress(e.detail.value / 1440); },
    onToggleDay() { var _a; (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setDayPlay(!this.data.dayPlaying); },
    onWeatherChange(e) {
        var _a;
        const weather = EnvironmentController_1.WEATHER_MODES[Number(e.detail.value)];
        if (weather !== undefined)
            (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setWeather(weather);
    },
    onWeatherIntensity(e) { var _a; (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setWeatherIntensity(e.detail.value / 100); },
    onLightChanging(e) { var _a; (_a = this.scene) === null || _a === void 0 ? void 0 : _a.setLightIntensity(e.detail.value / 100); },
    onCanvasTouchStart(e) {
        const first = e.touches[0];
        if (first === undefined)
            return;
        this.touchCount = e.touches.length;
        this.touchX = first.clientX;
        this.touchY = first.clientY;
        const second = e.touches[1];
        this.pinchDistance = second === undefined ? 0 : Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    },
    onCanvasTouchMove(e) {
        const first = e.touches[0];
        const scene = this.scene;
        if (scene === null || first === undefined)
            return;
        if (this.touchCount !== e.touches.length) {
            this.onCanvasTouchStart(e);
            return;
        }
        const second = e.touches[1];
        if (second !== undefined) {
            const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
            if (this.pinchDistance > 0)
                scene.zoomView(distance / this.pinchDistance);
            this.pinchDistance = distance;
        }
        else if (this.touchCount > 0) {
            scene.rotateView(first.clientX - this.touchX, first.clientY - this.touchY);
        }
        this.touchX = first.clientX;
        this.touchY = first.clientY;
    },
    onCanvasTouchEnd(e) {
        this.touchCount = 0;
        this.pinchDistance = 0;
        if (e.touches.length > 0)
            this.onCanvasTouchStart(e);
    },
    onShareAppMessage() {
        return {
            title: '四时木 · 一棵树走过四季',
            path: '/pages/season-tree/index',
        };
    },
});
//# sourceMappingURL=index.js.map