/**
 * 四时木 · 页面层
 *
 * 这一层刻意保持"薄"：
 * - 它不参与任何逐帧计算，只负责把 Canvas 节点交给 TreeScene；
 * - setData 仅用于 UI 状态（滑块位置、季节文案），并通过 HUD 节流
 *   （TreeScene 每 120ms 才回调一次）把频率压到 8 次/秒左右，
 *   绝不会把 60FPS 的动画数据塞进 data。
 */

import { TreeScene, type HudSnapshot } from '../../render/TreeScene';
import { PHASE_NAMES, SEASON_TITLES } from '../../render/types';
import { DEFAULT_TREE_PRESET, TREE_PRESETS } from '../../render/TreePresets';
import { GROWTH_STAGES } from '../../render/GrowthController';
import { WEATHER_LABELS, WEATHER_MODES } from '../../render/EnvironmentController';
import {
  initCloudSync,
  isCloudSessionReady,
  saveSeasonProgress,
  type CloudSyncStatus,
} from '../../utils/season-sync';
import {
  acknowledgeWeatherFailure,
  CITIES,
  DEFAULT_CITY,
  fetchWeather,
  formatWeatherText,
  shouldPromptWeatherFailure,
  type WeatherReport,
} from '../../utils/weather';
import { highestMemoryWarningLevel, onMemoryWarning } from '../../utils/app-events';

/** 文案交叠淡出的时长（毫秒），需与 index.wxss 里的 transition 保持一致。 */
const CAPTION_FADE_MS = 140;
/** 浏览进度写入云端的去抖间隔（毫秒）：拖动结束稍作停留再保存。 */
const CLOUD_SAVE_DEBOUNCE_MS = 2000;
/** 默认城市在 CITIES 中的下标。派生而非写死，改 CITIES 顺序时不会错位。 */
const DEFAULT_CITY_INDEX = Math.max(0, CITIES.indexOf(DEFAULT_CITY));

interface PageData {
  safeTop: number;
  sliderValue: number;
  seasonTitle: string;
  seasonSlogan: string;
  phaseName: string;
  playing: boolean;
  captionFading: boolean;
  renderState: 'loading' | 'ready' | 'error';
  canvasMounted: boolean;
  presetNames: string[];
  presetIndex: number;
  presetLabel: string;
  treeDescription: string;
  controlsOpen: boolean;
  growthValue: number;
  growthStage: string;
  growthPlaying: boolean;
  timeValue: number;
  timeText: string;
  dayPlaying: boolean;
  weatherLabels: readonly string[];
  weatherIndex: number;
  weatherValue: number;
  lightValue: number;
  isNight: boolean;
  /** 云端同步状态的一行短文案（已同步 / 本地模式等）。 */
  cloudStatusText: string;
  /** 实时天气一行文案。取数失败时为空串。 */
  weatherText: string;
  /** 天气取数失败提示（仅首次失败时出现，用户点"知道了"后不再打扰）。 */
  weatherErrorText: string;
  /** 可选城市名，供 picker 使用。 */
  cityNames: string[];
  /** 当前城市下标。 */
  cityIndex: number;
}

/** WebGL Canvas node and its actual stage size, in CSS pixels. */
interface CanvasQueryResult {
  node?: WechatMiniprogram.Canvas;
  width?: number;
  height?: number;
}

/** 屏幕旋转 / 窗口变化事件（部分基础库未导出该类型，这里就近声明）。 */
interface ResizeEvent {
  size: {
    windowWidth: number;
    windowHeight: number;
    statusBarHeight?: number;
  };
}

Page({
  data: {
    safeTop: 20,
    sliderValue: 0,
    seasonTitle: SEASON_TITLES[0],
    seasonSlogan: DEFAULT_TREE_PRESET.seasons[0],
    phaseName: PHASE_NAMES[0],
    playing: false,
    captionFading: false,
    renderState: 'loading',
    canvasMounted: true,
    presetNames: TREE_PRESETS.map(preset => `${preset.icon} ${preset.name}`),
    presetIndex: 0,
    presetLabel: `${DEFAULT_TREE_PRESET.icon} ${DEFAULT_TREE_PRESET.name}`,
    treeDescription: DEFAULT_TREE_PRESET.description,
    controlsOpen: false,
    growthValue: 750,
    growthStage: '成树',
    growthPlaying: false,
    timeValue: 720,
    timeText: '12:00',
    dayPlaying: false,
    weatherLabels: WEATHER_LABELS,
    weatherIndex: 0,
    weatherValue: 65,
    lightValue: 100,
    isNight: false,
    cloudStatusText: '连接云端…',
    weatherText: '',
    weatherErrorText: '',
    cityNames: CITIES.map(city => city.name),
    cityIndex: DEFAULT_CITY_INDEX,
  } as PageData,

  /** 场景实例。所有动画状态都在这里面，不进 data。 */
  scene: null as TreeScene | null,
  captionTimer: null as number | null,
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
  cloudSaveTimer: null as number | null,
  /* --- 内存告警 --- */
  /** 退订函数，onUnload 必须调用，否则订阅者会随页面实例一起泄漏。 */
  unsubscribeMemoryWarning: null as null | (() => void),
  /**
   * 是否正处在内存压力下。
   *
   * 必须持久化而不是在回调里直接 stop：告警可能早于场景就绪到达，
   * 那时没有 scene 可停，只有这个标记能让 setupScene 知道自己不该启动动画。
   */
  memoryPressure: false,

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ safeTop: info.statusBarHeight || 20 });
    this.startCloudSync();
    this.loadWeather();
    this.watchMemoryWarning();
  },

  onReady() {
    this.setupScene();
  },

  onShow() {
    this.visible = true;
    // 回到前台意味着系统又给了内存，解除压力状态。
    // 不这么做的话，用户每次切回来都会盯着一块静止的画面却无法操作。
    this.memoryPressure = false;
    // 首次 onShow 时场景还没建好（onReady 在 onShow 之后），这里直接跳过
    const scene = this.scene;
    if (scene !== null) scene.start();
  },

  onHide() {
    this.visible = false;
    this.touchCount = 0;
    // 页面不可见时立刻停表：小程序在后台继续跑 rAF 会持续耗电
    const scene = this.scene;
    if (scene !== null) scene.stop();
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
    if (this.unsubscribeMemoryWarning !== null) {
      this.unsubscribeMemoryWarning();
      this.unsubscribeMemoryWarning = null;
    }
    const scene = this.scene;
    if (scene !== null) {
      scene.destroy();
      this.scene = null;
    }
  },

  onResize(res: ResizeEvent) {
    const scene = this.scene;
    if (scene === null) return;
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
  selectorQuery(): WechatMiniprogram.SelectorQuery | null {
    if (typeof this.createSelectorQuery === 'function') {
      return this.createSelectorQuery();
    }
    if (typeof wx !== 'undefined' && typeof wx.createSelectorQuery === 'function') {
      return wx.createSelectorQuery();
    }
    return null;
  },

  /**
   * 兼容版 nextTick：在下一个渲染批次执行回调。
   *
   * 与 selectorQuery 同样的兼容思路——WorkBuddy 预览面板的模拟器只实现了
   * 部分 wx API，没有 nextTick，直接调用会抛 "wx.nextTick is not a function"
   * 并中断 onReady / setData 回调（场景根本起不来）。
   * 缺省时退化为 setTimeout(0)：语义上仍是"异步延后一拍"，
   * 对测量画布尺寸这类只要求"等 DOM 更新完"的操作完全够用。
   */
  /**
   * 兼容版 showToast。
   *
   * 预览面板等模拟器不一定实现 wx.showToast，缺方法时直接调用会抛错并
   * 中断当前流程（这里是失败提示路径，抛错反而会盖掉真正的失败原因）。
   * 提示只是锦上添花，缺失时静默跳过即可。
   */
  toast(title: string) {
    if (typeof wx === 'undefined' || typeof wx.showToast !== 'function') return;
    wx.showToast({ title, icon: 'none' });
  },

  nextTick(callback: () => void) {
    if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
      wx.nextTick(callback);
      return;
    }
    setTimeout(callback, 0);
  },

  measureScene() {
    const scene = this.scene;
    if (scene === null) return;
    // The stage excludes the safe area and controls; window size is not canvas size.
    this.nextTick(() => {
      if (this.disposed || this.scene !== scene) return;
      const query = this.selectorQuery();
      if (query === null) return;
      query.select('#seasonCanvas').fields({ size: true }).exec((results: unknown[]) => {
        if (this.disposed || this.scene !== scene) return;
        const size = results[0] as CanvasQueryResult | undefined;
        if (size?.width && size.height) scene.resize(size.width, size.height);
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
      .exec((res: unknown[]) => {
        if (this.disposed || attempt !== this.setupAttempt) return;
        const first = res[0] as CanvasQueryResult | undefined;
        if (first === undefined || first.node === undefined) {
          this.setData({ renderState: 'error' });
          return;
        }

        const scene = new TreeScene();
        try {
          scene.attach(first.node, first.width ?? 0, first.height ?? 0);
        } catch (error: unknown) {
          console.error('WebGL scene initialization failed', error);
          this.setData({ renderState: 'error' });
          return;
        }
        scene.onHudUpdate = (snapshot: HudSnapshot) => {
          this.syncHud(snapshot);
        };
        this.scene = scene;
        this.setData({ renderState: 'ready' });
        // 内存压力下不启动：告警可能早于场景就绪到达（见 watchMemoryWarning）。
        if (this.visible && !this.memoryPressure) scene.start();
        // 云端进度若先于场景返回，在这里补应用一次。
        if (this.pendingRestoreProgress >= 0) {
          scene.setSeasonProgress(this.pendingRestoreProgress);
          this.pendingRestoreProgress = -1;
        }
        this.syncHud(scene.getSnapshot());
      });
  },

  onRetryScene() {
    if (this.data.renderState !== 'error') return;
    this.scene?.destroy();
    this.scene = null;
    // The adapter scopes itself to a canvas once; retry with a new native node.
    this.setData({ renderState: 'loading', canvasMounted: false, playing: false }, () => {
      if (this.disposed) return;
      this.setData({ canvasMounted: true }, () => {
        this.nextTick(() => { if (!this.disposed) this.setupScene(); });
      });
    });
  },

  /* ---------------------------------------------------------------- *
   * HUD 同步（逐帧状态只留在场景内）
   * ---------------------------------------------------------------- */

  syncHud(snapshot: HudSnapshot) {
    const presetIndex = TREE_PRESETS.findIndex(preset => preset.id === snapshot.presetId);
    const preset = TREE_PRESETS[presetIndex] ?? DEFAULT_TREE_PRESET;
    const minutes = Math.floor(snapshot.timeProgress * 1440) % 1440;
    const patch: Partial<PageData> = {
      playing: snapshot.playing,
      presetIndex: Math.max(0, presetIndex), presetLabel: `${preset.icon} ${preset.name}`,
      treeDescription: preset.description,
      growthValue: Math.round(snapshot.growthProgress * 1000), growthStage: GROWTH_STAGES[snapshot.growthStageIndex],
      growthPlaying: snapshot.growthPlaying, timeValue: minutes,
      timeText: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      dayPlaying: snapshot.dayPlaying, weatherIndex: WEATHER_MODES.indexOf(snapshot.weather),
      weatherValue: Math.round(snapshot.weatherIntensity * 100), lightValue: Math.round(snapshot.lightIntensity * 100),
      isNight: snapshot.timeProgress < 0.25 || snapshot.timeProgress > 0.75,
    };

    const sliderValue = Math.round(snapshot.progress * 1000);
    if (sliderValue !== this.data.sliderValue) {
      patch.sliderValue = sliderValue;
    }

    const phaseName = PHASE_NAMES[snapshot.phaseIndex] ?? PHASE_NAMES[0];
    if (phaseName !== this.data.phaseName) {
      patch.phaseName = phaseName;
    }

    const title = SEASON_TITLES[snapshot.seasonIndex] ?? SEASON_TITLES[0];
    const slogan = preset.seasons[snapshot.seasonIndex] ?? '';
    if (title !== (this.pendingCaption || this.data.seasonTitle) || slogan !== (this.pendingSlogan || this.data.seasonSlogan)) {
      this.applyCaption(title, slogan);
    }

    for (const key of Object.keys(patch) as (keyof PageData)[]) if (patch[key] === this.data[key]) delete patch[key];

    if (Object.keys(patch).length > 0) {
      this.setData(patch);
    }
  },

  /**
   * 季节标题的交叠淡出：先淡出旧文案，再换成新文案并淡入。
   * 用定时器而不是直接替换，是为了避免文字在拖动时"硬切"。
   */
  applyCaption(title: string, slogan: string) {
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
    initCloudSync({
      onStatus: (status: CloudSyncStatus) => {
        this.updateCloudStatusText(status);
      },
      onVisitCount: (count: number) => {
        this.visitCount = count;
        this.updateCloudStatusText(isCloudSessionReady() ? 'synced' : 'local');
      },
      onRestoredProgress: (progress: number) => {
        const scene = this.scene;
        if (scene !== null) {
          scene.setSeasonProgress(progress);
        } else {
          // 场景尚未就绪：暂存，setupScene 完成后应用。
          this.pendingRestoreProgress = progress;
        }
      },
    });
  },

  updateCloudStatusText(status: CloudSyncStatus) {
    let text: string;
    if (status === 'connecting') {
      text = '连接云端…';
    } else if (status === 'synced') {
      text = this.visitCount > 0 ? `已同步 · 第 ${this.visitCount} 位访客` : '已同步';
    } else {
      text = '本地模式 · 进度不保存';
    }
    if (text !== this.data.cloudStatusText) this.setData({ cloudStatusText: text });
  },

  /** 拖动结束/自动播放推进后调用：去抖合并短时间内的多次进度变化。 */
  scheduleCloudSave() {
    if (this.scene === null || !isCloudSessionReady()) return;
    if (this.cloudSaveTimer !== null) return;
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
    if (scene === null || !isCloudSessionReady()) return;
    const progress = scene.getProgress();
    if (progress === this.lastSavedProgress) return;
    this.lastSavedProgress = progress;
    // fire-and-forget：失败信息由 season-sync 打进日志，不打断页面。
    void saveSeasonProgress(progress);
  },

  /* ---------------------------------------------------------------- *
   * 内存告警（App 层转发 → 页面让出显存）
   * ---------------------------------------------------------------- */

  /**
   * 订阅系统内存告警。
   *
   * 这一页整屏是 WebGL 画布，显存是最紧张的资源。收到告警时立刻停掉动画循环：
   * 停止渲染后 three 的绘制调用归零，驱动得以回收纹理与缓冲，比什么都不做安全得多。
   * 用户切到前台（onShow）时自动恢复——告警是瞬时信号，不该让页面停在黑屏。
   *
   * 不销毁场景：重建一次 WebGL 上下文的代价远大于停循环，纹理缓冲留着反而更快恢复。
   */
  watchMemoryWarning() {
    if (this.unsubscribeMemoryWarning !== null) return;
    // 订阅之前就发生过的告警同样要生效：告警可能早于 onLoad 到达，
    // 那时场景还不存在，只记标记，等 setupScene 时再兑现（否则事件被静默丢弃）。
    if (highestMemoryWarningLevel() > 0) this.memoryPressure = true;
    this.unsubscribeMemoryWarning = onMemoryWarning((level: number) => this.handleMemoryWarning(level));
  },

  handleMemoryWarning(level: number) {
    console.error('[season-tree] memory warning', JSON.stringify({ level }));
    this.memoryPressure = true;
    const scene = this.scene;
    // 场景还没建好时无处可停，标记留给 setupScene 兑现。
    if (scene !== null) scene.stop();
  },

  /* ---------------------------------------------------------------- *
   * 实时天气（低频取数，失败静默隐藏整行）
   * ---------------------------------------------------------------- */

  /**
   * 拉取默认城市天气。命中 30 分钟缓存则不发请求。
   * 失败时 weatherText 保持空串，WXML 的 wx:if 会把整行隐藏——宁可没有，
   * 也不用假天气糊弄用户。
   */
  loadWeather(force = false) {
    const city = CITIES[this.data.cityIndex] ?? DEFAULT_CITY;
    void fetchWeather(city, force).then(report => {
      if (this.disposed) return;
      this.applyWeather(report);
    });
  },

  /**
   * 取数成功后写入天气文案；失败时按需给出一行提示。
   * 提示用 shouldPromptWeatherFailure 收口，保证同一次失败只提示一次，
   * 不让"天气是锦上添花"变成每次打开都在念叨的噪音。
   */
  applyWeather(report: WeatherReport | null) {
    if (report === null) {
      if (shouldPromptWeatherFailure(report)) {
        this.setData({ weatherText: '', weatherErrorText: '天气暂不可用 · 点此重试' });
        this.toast('天气暂不可用');
      }
      return;
    }
    if (this.data.weatherErrorText !== '') this.setData({ weatherErrorText: '' });
    const text = formatWeatherText(report);
    if (text !== this.data.weatherText) this.setData({ weatherText: text });
  },

  /** 点失败提示 = 立刻重试一次（绕过缓存）。 */
  onRetryWeather() {
    acknowledgeWeatherFailure();
    this.setData({ weatherErrorText: '' });
    this.loadWeather(true);
  },

  onCityChange(e: WechatMiniprogram.PickerChange) {
    const city = CITIES[Number(e.detail.value)];
    if (city === undefined) return;
    this.setData({ cityIndex: Number(e.detail.value) }, () => {
      // 换城市必须绕过缓存，否则会先显示旧城市的天气。
      this.loadWeather(true);
    });
  },

  /* ---------------------------------------------------------------- *
   * 交互
   * ---------------------------------------------------------------- */

  onSliderChanging(e: WechatMiniprogram.SliderChange) {
    const scene = this.scene;
    if (scene === null) return;
    // 场景更新归一化进度，并将季节文案同步回 HUD。
    scene.setSeasonProgress(e.detail.value / 1000);
    if (this.data.playing) this.setData({ playing: false });
    // bindchanging（type=drag）只驱动动画；bindchange（type=change，拖动结束）才写云端。
    if (e.type === 'change') this.scheduleCloudSave();
  },

  onTogglePlay() {
    const scene = this.scene;
    if (scene === null) return;
    const playing = !scene.autoPlaying;
    scene.setAutoPlay(playing);
    // 按钮状态跟随场景的自动播放状态。
    this.setData({ playing });
  },

  onPresetChange(e: WechatMiniprogram.PickerChange) {
    const preset = TREE_PRESETS[Number(e.detail.value)];
    if (preset === undefined) return;
    try { this.scene?.setTreePreset(preset.id); }
    catch (error: unknown) {
      console.error('Tree preset initialization failed', error);
      this.toast('树种切换失败，请重试');
    }
  },

  onToggleControls() { this.setData({ controlsOpen: !this.data.controlsOpen }, () => this.measureScene()); },
  onGrowthChanging(e: WechatMiniprogram.SliderChange) { this.scene?.setGrowthProgress(e.detail.value / 1000); },
  onToggleGrowth() { this.scene?.setGrowthPlay(!this.data.growthPlaying); },
  onTimeChanging(e: WechatMiniprogram.SliderChange) { this.scene?.setTimeProgress(e.detail.value / 1440); },
  onToggleDay() { this.scene?.setDayPlay(!this.data.dayPlaying); },
  onWeatherChange(e: WechatMiniprogram.PickerChange) {
    const weather = WEATHER_MODES[Number(e.detail.value)];
    if (weather !== undefined) this.scene?.setWeather(weather);
  },
  onWeatherIntensity(e: WechatMiniprogram.SliderChange) { this.scene?.setWeatherIntensity(e.detail.value / 100); },
  onLightChanging(e: WechatMiniprogram.SliderChange) { this.scene?.setLightIntensity(e.detail.value / 100); },

  onCanvasTouchStart(e: WechatMiniprogram.TouchEvent) {
    const first = e.touches[0];
    if (first === undefined) return;
    this.touchCount = e.touches.length;
    this.touchX = first.clientX; this.touchY = first.clientY;
    const second = e.touches[1];
    this.pinchDistance = second === undefined ? 0 : Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  },

  onCanvasTouchMove(e: WechatMiniprogram.TouchEvent) {
    const first = e.touches[0];
    const scene = this.scene;
    if (scene === null || first === undefined) return;
    if (this.touchCount !== e.touches.length) { this.onCanvasTouchStart(e); return; }
    const second = e.touches[1];
    if (second !== undefined) {
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      if (this.pinchDistance > 0) scene.zoomView(distance / this.pinchDistance);
      this.pinchDistance = distance;
    } else if (this.touchCount > 0) {
      scene.rotateView(first.clientX - this.touchX, first.clientY - this.touchY);
    }
    this.touchX = first.clientX; this.touchY = first.clientY;
  },

  onCanvasTouchEnd(e: WechatMiniprogram.TouchEvent) {
    this.touchCount = 0; this.pinchDistance = 0;
    if (e.touches.length > 0) this.onCanvasTouchStart(e);
  },

  onShareAppMessage() {
    return {
      title: '四时木 · 一棵树走过四季',
      path: '/pages/season-tree/index',
    };
  },
});
