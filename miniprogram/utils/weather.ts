/**
 * 四时木 · 实时天气。
 *
 * 职责（与渲染层解耦，只做低频取数与展示，不碰动画状态）：
 * 1. 向 Open-Meteo 请求指定城市的实时天气（免 key、免注册，CC BY 4.0）；
 * 2. 把 WMO 天气码折算成渲染层已有的四种天气模式（clear / rain / snow / auto），
 *    因此本模块不新增任何渲染能力，EnvironmentController 一行都不用改；
 * 3. 结果按城市缓存 30 分钟，避免每次冷启动都发请求；
 * 4. 任何失败都静默降级为 null，由页面决定是否隐藏天气行——绝不用假数据冒充真实天气。
 *
 * ⚠️ 部署前提：api.open-meteo.com 必须在小程序管理后台配置为
 * request 合法域名，否则开发者工具能跑、真机直接失败。这项在后台配置，不在本仓库。
 */
import type { WeatherMode } from '../render/EnvironmentController';

/** 缓存有效期：30 分钟。天气更新不频繁，过期后重新取即可。 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_PREFIX = 'four-seasons-tree:weather:';
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** 可选城市。刻意内置少量城市而非取定位：wx.getLocation 属隐私接口，
 *  会改动隐私清单并触发小程序重新提审，收益远小于成本。 */
export interface City {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

export const CITIES: readonly City[] = [
  { name: '北京', latitude: 39.9042, longitude: 116.4074 },
  { name: '上海', latitude: 31.2304, longitude: 121.4737 },
  { name: '广州', latitude: 23.1291, longitude: 113.2644 },
  { name: '成都', latitude: 30.5728, longitude: 104.0668 },
  { name: '杭州', latitude: 30.2741, longitude: 120.1551 },
  { name: '西安', latitude: 34.3416, longitude: 108.9398 },
];

/** 默认城市（上海）。可在页面上改，改动只存本地，不上云。 */
export const DEFAULT_CITY = CITIES[1];

/** 一次成功取数后，页面用来渲染天气行的全部信息。 */
export interface WeatherReport {
  readonly cityName: string;
  /** 气温（℃）。 */
  readonly temperature: number;
  /** 体感温度（℃），Open-Meteo 未返回时回落到气温。 */
  readonly apparentTemperature: number;
  /** 天气现象中文名，如「小雨」。 */
  readonly conditionText: string;
  /** 风速（km/h）。 */
  readonly windSpeed: number;
  /** 折算出的渲染层天气模式。 */
  readonly mode: WeatherMode;
  /** 建议的雨雪强度 0–1，供页面作为手动天气模式的初值参考。 */
  readonly intensity: number;
  /** 数据获取时刻（毫秒时间戳），用于展示"更新于"。 */
  readonly fetchedAt: number;
}

/* ------------------------------------------------------------------ *
 * 纯函数：WMO 码 → 中文文案 / 渲染模式
 * 这部分不依赖 wx，独立可测。
 * ------------------------------------------------------------------ */

/** WMO 4677 天气现象码的中文文案。表驱动，未收录的码归到「多云」。 */
const WMO_TEXT: Readonly<Record<number, string>> = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
  45: '雾', 48: '雾凇',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
  56: '冻毛毛雨', 57: '强冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '强阵雨', 82: '暴雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷阵雨伴冰雹',
};

export function describeWmo(code: number): string {
  return WMO_TEXT[code] ?? '多云';
}

/** 雪类天气码。 */
function isSnowCode(code: number): boolean {
  return code >= 71 && code <= 77 || code === 85 || code === 86;
}

/**
 * 把 WMO 码折算成渲染层已有的四种模式。
 * 雾（45/48）渲染层没有对应表现，归为 auto 走季节天气，不硬塞成阴天。
 */
export function resolveWeatherMode(code: number): WeatherMode {
  if (isSnowCode(code)) return 'snow';
  // 毛毛雨(51-57)、雨(61-67)、阵雨/暴雨(80-82)、雷阵雨(95-99) 都是有降水
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 95) return 'rain';
  if (code === 45 || code === 48) return 'auto';
  return 'clear';
}

/**
 * 由降水量（mm/h）折算雨雪强度 0–1。
 * 0.1mm 以下视作无降水；10mm 以上封顶。取对数曲线是因为降水量分布长尾，
 * 线性映射会让小雨和暴雨都落在中段，视觉上分辨不出差别。
 */
export function resolveIntensity(precipitationMm: number, mode: WeatherMode): number {
  if (mode === 'auto' || mode === 'clear') return 0.65;
  if (!Number.isFinite(precipitationMm) || precipitationMm <= 0.1) return 0.25;
  return Math.min(1, Math.log10(precipitationMm / 0.1 + 1) / 2);
}

/** 风速（km/h）折算成蒲福风级描述，用于展示。 */
export function describeWind(kmh: number): string {
  if (!Number.isFinite(kmh) || kmh < 1) return '无风';
  if (kmh < 6) return '微风';
  if (kmh < 12) return '和风';
  if (kmh < 20) return '清劲风';
  if (kmh < 29) return '强风';
  if (kmh < 39) return '疾风';
  return '大风';
}

/** 把 Open-Meteo 的 current 响应折算成 WeatherReport。字段缺失一律回落到安全值。 */
export function parseWeatherResponse(city: City, payload: unknown, now: number): WeatherReport | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const current = (payload as { current?: unknown }).current;
  if (typeof current !== 'object' || current === null) return null;

  const raw = current as Record<string, unknown>;
  const code = typeof raw.weather_code === 'number' ? raw.weather_code : 0;
  const temperature = typeof raw.temperature_2m === 'number' ? raw.temperature_2m : null;
  if (temperature === null) return null;

  const apparent = typeof raw.apparent_temperature === 'number' ? raw.apparent_temperature : temperature;
  const precipitation = typeof raw.precipitation === 'number' ? raw.precipitation : 0;
  const wind = typeof raw.wind_speed_10m === 'number' ? raw.wind_speed_10m : 0;
  const mode = resolveWeatherMode(code);

  return {
    cityName: city.name,
    temperature,
    apparentTemperature: apparent,
    conditionText: describeWmo(code),
    windSpeed: wind,
    mode,
    intensity: resolveIntensity(precipitation, mode),
    fetchedAt: now,
  };
}

/** 天气行文案，例如「上海 · 小雨 12℃ · 微风」。 */
export function formatWeatherText(report: WeatherReport): string {
  const temp = Math.round(report.temperature);
  return `${report.cityName} · ${report.conditionText} ${temp}℃ · ${describeWind(report.windSpeed)}`;
}

/* ------------------------------------------------------------------ *
 * 缓存读写：wx 只在这里惰性访问（模块顶层求值 wx 会让 Node 测试 ReferenceError）
 * ------------------------------------------------------------------ */

interface CacheEntry {
  readonly report: WeatherReport;
  readonly savedAt: number;
}

/** wx storage 的最小结构（WechatMiniprogram 命名空间未导出 Storage 类型，
 *  这里只声明实际用到的两个方法，避免为两个函数引入整个命名空间类型）。 */
interface StorageLike {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
}

function storage(): StorageLike | null {
  if (typeof wx === 'undefined') return null;
  return typeof wx.getStorageSync === 'function' ? (wx as unknown as StorageLike) : null;
}

function cacheKey(city: City): string {
  return `${STORAGE_PREFIX}${city.name}`;
}

function readCache(city: City, now: number): WeatherReport | null {
  const store = storage();
  if (store === null) return null;
  try {
    const raw = store.getStorageSync(cacheKey(city)) as CacheEntry | null;
    if (raw === null || typeof raw !== 'object' || typeof raw.savedAt !== 'number') return null;
    if (now - raw.savedAt > CACHE_TTL_MS) return null;
    const report = raw.report;
    if (typeof report !== 'object' || report === null) return null;
    return report;
  } catch (error: unknown) {
    // storage 被禁用或数据损坏都走这里，缓存读不到不是错误。
    console.error('[weather] cache read failed', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

function writeCache(city: City, report: WeatherReport): void {
  const store = storage();
  if (store === null) return;
  try {
    store.setStorageSync(cacheKey(city), { report, savedAt: report.fetchedAt } satisfies CacheEntry);
  } catch (error: unknown) {
    console.error('[weather] cache write failed', error instanceof Error ? error.message : 'unknown');
  }
}

/** 请求是否已在飞行中，避免用户连点城市 picker 时重复发请求。 */
let inflight: Promise<WeatherReport | null> | null = null;

/**
 * 本次会话内用户是否已知晓"天气取不到"。
 * 用来保证失败提示只出现一次，不变成每次刷新都在念叨的噪音。
 */
let failureAcknowledged = false;

function request(city: City): Promise<WeatherReport | null> {
  const query = `latitude=${city.latitude}&longitude=${city.longitude}`
    + '&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m'
    + '&timezone=auto';

  return new Promise<WeatherReport | null>(resolve => {
    if (typeof wx === 'undefined' || typeof wx.request !== 'function') {
      resolve(null);
      return;
    }
    wx.request({
      url: `${ENDPOINT}?${query}`,
      method: 'GET',
      // 天气是锦上添花，8 秒拿不到就直接放弃，不让用户干等。
      timeout: 8000,
      success: (res: WechatMiniprogram.RequestSuccessCallbackResult) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.error('[weather] request failed', JSON.stringify({ status: res.statusCode }));
          resolve(null);
          return;
        }
        resolve(parseWeatherResponse(city, res.data, Date.now()));
      },
      fail: (error: { errMsg: string }) => {
        // 域名未配白名单时也会走到这里，属于可预期失败，静默降级。
        console.error('[weather] request error', JSON.stringify({ message: error.errMsg }));
        resolve(null);
      },
    });
  });
}

/**
 * 取某城市的实时天气。命中 30 分钟内缓存则不发请求。
 * 任何失败都返回 null（不是假数据），由页面决定如何提示。
 */
export function fetchWeather(city: City, force = false): Promise<WeatherReport | null> {
  const now = Date.now();
  if (!force) {
    const cached = readCache(city, now);
    if (cached !== null) return Promise.resolve(cached);
  }
  if (inflight !== null) return inflight;

  inflight = request(city).then(report => {
    inflight = null;
    if (report !== null) {
      writeCache(city, report);
      // 天气回来了：解除"已知晓失败"，让下次真出问题时仍能提示。
      failureAcknowledged = false;
    }
    return report;
  });
  return inflight;
}

/**
 * 清掉"取数失败"的记忆。
 *
 * 用户主动点了失败提示（表示"我知道取不到，帮我重试"）时调用。
 * 正常情况下 shouldPromptWeatherFailure 在提示时就已置位，这里是显式出口。
 */
export function acknowledgeWeatherFailure(): void {
  failureAcknowledged = true;
}

/**
 * 判定本次失败是否需要提示用户，并在**提示的同时**标记为已知晓。
 *
 * 关键点：标记发生在提示的那一刻，而不是等用户去点"知道了"。
 * 否则同一次失败（用户没察觉、反复重试、或页面多次 onLoad）会重复弹 toast，
 * 把"锦上添花"变成骚扰。取数成功时由 fetchWeather 复位，下次真失败仍会提示。
 */
export function shouldPromptWeatherFailure(report: WeatherReport | null): boolean {
  if (report !== null || failureAcknowledged) return false;
  failureAcknowledged = true;
  return true;
}

/** 用户是否已经知道天气取不到（供测试与调试用）。 */
export function isWeatherFailureAcknowledged(): boolean {
  return failureAcknowledged;
}
