const test = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');

const MODULE = resolve(__dirname, '../miniprogram/utils/weather.js');

/**
 * 在给定的 wx 桩下加载 weather 模块。
 * 模块内部惰性访问 wx，所以可以先设 global.wx 再 require。
 */
function loadWeather(wxStub) {
  if (wxStub === null) delete global.wx;
  else global.wx = wxStub;
  delete require.cache[MODULE];
  return require(MODULE);
}

test('WMO 天气码折算成已有的四种渲染模式', () => {
  const { resolveWeatherMode, describeWmo, CITIES, DEFAULT_CITY } = loadWeather(null);

  // 晴 / 多云 / 阴 → clear
  assert.equal(resolveWeatherMode(0), 'clear');
  assert.equal(resolveWeatherMode(2), 'clear');
  assert.equal(resolveWeatherMode(3), 'clear');
  // 雨：毛毛雨 / 雨 / 冻雨 / 阵雨 / 暴雨 / 雷阵雨
  assert.equal(resolveWeatherMode(53), 'rain');
  assert.equal(resolveWeatherMode(65), 'rain');
  assert.equal(resolveWeatherMode(66), 'rain');
  assert.equal(resolveWeatherMode(82), 'rain');
  assert.equal(resolveWeatherMode(95), 'rain');
  // 雪：降雪 / 雪粒 / 阵雪
  assert.equal(resolveWeatherMode(71), 'snow');
  assert.equal(resolveWeatherMode(75), 'snow');
  assert.equal(resolveWeatherMode(77), 'snow');
  assert.equal(resolveWeatherMode(86), 'snow');
  // 雾在渲染层没有对应表现，归 auto 走季节天气
  assert.equal(resolveWeatherMode(45), 'auto');
  assert.equal(resolveWeatherMode(48), 'auto');

  // 模式必须落在 EnvironmentController 已支持的取值内
  assert.ok(['auto', 'clear', 'rain', 'snow'].includes(resolveWeatherMode(0)));

  assert.equal(describeWmo(0), '晴');
  assert.equal(describeWmo(61), '小雨');
  assert.equal(describeWmo(75), '大雪');
  // 未收录的码不能返回 undefined
  assert.equal(typeof describeWmo(123), 'string');

  assert.ok(CITIES.length > 0);
  assert.ok(CITIES.includes(DEFAULT_CITY));
});

test('降水量折算强度：晴/随季节用默认值，雨雪随降水量单调递增并封顶', () => {
  const { resolveIntensity } = loadWeather(null);

  // 无降水天气不该被降水量影响
  assert.equal(resolveIntensity(50, 'clear'), 0.65);
  assert.equal(resolveIntensity(50, 'auto'), 0.65);

  // 微量降水保底
  assert.equal(resolveIntensity(0, 'rain'), 0.25);
  assert.equal(resolveIntensity(0.05, 'rain'), 0.25);

  // 单调递增且落在 0–1
  const light = resolveIntensity(0.5, 'rain');
  const heavy = resolveIntensity(8, 'rain');
  assert.ok(light > 0.25 && light < heavy, `${light} 应小于 ${heavy}`);
  assert.ok(heavy <= 1);

  // 暴雨封顶，不越界
  assert.equal(resolveIntensity(999, 'rain'), 1);
  // 非有限值不产生 NaN
  assert.equal(resolveIntensity(Number.NaN, 'rain'), 0.25);
});

test('风速折算蒲福风级文案', () => {
  const { describeWind } = loadWeather(null);
  assert.equal(describeWind(0), '无风');
  assert.equal(describeWind(0.4), '无风');
  assert.equal(describeWind(3), '微风');
  assert.equal(describeWind(8), '和风');
  assert.equal(describeWind(60), '大风');
  assert.equal(describeWind(Number.NaN), '无风');
});

test('解析接口响应：字段缺失时回落，结构不对时返回 null', () => {
  const { parseWeatherResponse, CITIES } = loadWeather(null);
  const city = CITIES[0];

  const full = parseWeatherResponse(city, {
    current: {
      temperature_2m: 12.4, apparent_temperature: 10.1, weather_code: 61,
      precipitation: 1.2, wind_speed_10m: 9,
    },
  }, 1000);
  assert.equal(full.temperature, 12.4);
  assert.equal(full.apparentTemperature, 10.1);
  assert.equal(full.conditionText, '小雨');
  assert.equal(full.mode, 'rain');
  assert.equal(full.windSpeed, 9);
  assert.equal(full.cityName, city.name);
  assert.equal(full.fetchedAt, 1000);

  // 缺 apparent_temperature 回落到气温
  const partial = parseWeatherResponse(city, { current: { temperature_2m: 5, weather_code: 0 } }, 1);
  assert.equal(partial.apparentTemperature, 5);
  // 缺风速回落到 0，不产生 NaN
  assert.equal(partial.windSpeed, 0);

  // 缺 temperature 无法显示，视为无效响应
  assert.equal(parseWeatherResponse(city, { current: { weather_code: 0 } }, 1), null);
  assert.equal(parseWeatherResponse(city, {}, 1), null);
  assert.equal(parseWeatherResponse(city, null, 1), null);
  assert.equal(parseWeatherResponse(city, 'not-an-object', 1), null);
});

test('取数成功后写入缓存，30 分钟内再次请求直接命中缓存', async () => {
  const store = new Map();
  let requestCount = 0;
  const wxStub = {
    getStorageSync: key => (store.has(key) ? store.get(key) : null),
    setStorageSync: (key, value) => { store.set(key, value); },
    request: options => {
      requestCount++;
      options.success({
        statusCode: 200,
        data: { current: { temperature_2m: 20, weather_code: 0, precipitation: 0, wind_speed_10m: 2 } },
      });
    },
  };
  const { fetchWeather, CITIES, DEFAULT_CITY } = loadWeather(wxStub);

  const first = await fetchWeather(DEFAULT_CITY);
  assert.ok(first !== null);
  assert.equal(requestCount, 1);

  // 缓存命中：不再发请求
  const second = await fetchWeather(DEFAULT_CITY);
  assert.ok(second !== null);
  assert.equal(second.temperature, 20);
  assert.equal(requestCount, 1, '命中缓存时不应再次请求');

  // force 绕过缓存
  const forced = await fetchWeather(DEFAULT_CITY, true);
  assert.ok(forced !== null);
  assert.equal(requestCount, 2);
});

test('缓存过期后重新取数', async () => {
  const store = new Map();
  let requestCount = 0;
  const wxStub = {
    getStorageSync: key => (store.has(key) ? store.get(key) : null),
    setStorageSync: (key, value) => { store.set(key, value); },
    request: options => {
      requestCount++;
      options.success({ statusCode: 200, data: { current: { temperature_2m: 18, weather_code: 3 } } });
    },
  };
  const { fetchWeather, DEFAULT_CITY } = loadWeather(wxStub);

  await fetchWeather(DEFAULT_CITY);
  assert.equal(requestCount, 1);

  // 把缓存的保存时间改成 31 分钟前（TTL 为 30 分钟）
  const key = `four-seasons-tree:weather:${DEFAULT_CITY.name}`;
  const entry = store.get(key);
  store.set(key, { report: entry.report, savedAt: Date.now() - 31 * 60 * 1000 });

  const refreshed = await fetchWeather(DEFAULT_CITY);
  assert.ok(refreshed !== null);
  assert.equal(requestCount, 2, '过期缓存应触发重新取数');
});

test('请求失败或状态码异常时返回 null，不用假数据顶替', async () => {
  // HTTP 500
  const failStatus = loadWeather({
    getStorageSync: () => null,
    setStorageSync: () => {},
    request: options => { options.success({ statusCode: 500, data: {} }); },
  });
  assert.equal(await failStatus.fetchWeather(failStatus.DEFAULT_CITY), null);

  // 网络层失败（域名未配白名单时就是这条路径）
  const failNetwork = loadWeather({
    getStorageSync: () => null,
    setStorageSync: () => {},
    request: options => { options.fail({ errMsg: 'request:fail url not in domain list' }); },
  });
  assert.equal(await failNetwork.fetchWeather(failNetwork.DEFAULT_CITY), null);

  // 200 但响应结构无法解析
  const failShape = loadWeather({
    getStorageSync: () => null,
    setStorageSync: () => {},
    request: options => { options.success({ statusCode: 200, data: { unexpected: true } }); },
  });
  assert.equal(await failShape.fetchWeather(failShape.DEFAULT_CITY), null);
});

test('缓存数据损坏时按未命中处理，不抛错', async () => {
  let requestCount = 0;
  const wxStub = {
    getStorageSync: () => 'garbage-not-an-object',
    setStorageSync: () => {},
    request: options => {
      requestCount++;
      options.success({ statusCode: 200, data: { current: { temperature_2m: 22, weather_code: 0 } } });
    },
  };
  const { fetchWeather, DEFAULT_CITY } = loadWeather(wxStub);
  const report = await fetchWeather(DEFAULT_CITY);
  assert.ok(report !== null);
  assert.equal(requestCount, 1, '损坏缓存应触发取数而不是抛错');
});

test('weather 行文案包含城市、天气、气温与风力', () => {
  const { formatWeatherText, parseWeatherResponse, CITIES } = loadWeather(null);
  const report = parseWeatherResponse(CITIES[0], {
    current: { temperature_2m: 7.6, weather_code: 71, precipitation: 0.5, wind_speed_10m: 4 },
  }, 1);
  const text = formatWeatherText(report);
  assert.ok(text.includes(CITIES[0].name));
  assert.ok(text.includes('小雪'));
  assert.ok(text.includes('8℃'), `实际: ${text}`);
  assert.ok(text.includes('微风'));
});

test('失败提示只在发生时置位，同一次失败不会重复提示', () => {
  const { shouldPromptWeatherFailure, acknowledgeWeatherFailure, isWeatherFailureAcknowledged } = loadWeather(null);

  // 首次失败：应提示，并且**在提示这一刻就**置位
  assert.equal(shouldPromptWeatherFailure(null), true);
  assert.equal(isWeatherFailureAcknowledged(), true);

  // 紧接着再判定（用户没察觉、页面重复 onLoad、反复重试）都不应再提示
  assert.equal(shouldPromptWeatherFailure(null), false);
  assert.equal(shouldPromptWeatherFailure(null), false);

  // 取到数据时永远不提示失败
  assert.equal(shouldPromptWeatherFailure({ cityName: '上海' }), false);

  // 显式出口同样有效
  acknowledgeWeatherFailure();
  assert.equal(isWeatherFailureAcknowledged(), true);
});

test('取数成功会解除"已知晓失败"，让下次真失败仍能提示', async () => {
  const wxStub = {
    getStorageSync: () => null,
    setStorageSync: () => {},
    request: options => {
      options.success({ statusCode: 200, data: { current: { temperature_2m: 20, weather_code: 0 } } });
    },
  };
  const { fetchWeather, shouldPromptWeatherFailure, isWeatherFailureAcknowledged, DEFAULT_CITY } = loadWeather(wxStub);

  // 先制造一次"已提示"的失败状态
  assert.equal(shouldPromptWeatherFailure(null), true);
  assert.equal(isWeatherFailureAcknowledged(), true);

  // 天气恢复：fetchWeather 内部复位
  const report = await fetchWeather(DEFAULT_CITY, true);
  assert.ok(report !== null);
  assert.equal(isWeatherFailureAcknowledged(), false, '成功一次应复位');
  assert.equal(shouldPromptWeatherFailure(null), true, '复位后下次真失败仍应能提示');
});

/* ------------------------------------------------------------------ *
 * 页面级：失败提示的完整闭环（wx 桩必须实现 setData 回调）
 * ------------------------------------------------------------------ */

function pageHarness(options = {}) {
  const store = new Map();
  const toasts = [];
  let shouldFail = options.fail !== false;
  const pagePath = resolve(__dirname, '../miniprogram/pages/season-tree/index.js');
  const weatherPath = resolve(__dirname, '../miniprogram/utils/weather.js');

  let definition;
  const wxStub = {
    getStorageSync: key => (store.has(key) ? store.get(key) : null),
    setStorageSync: (key, value) => { store.set(key, value); },
    getWindowInfo: () => ({ statusBarHeight: 20 }),
    createSelectorQuery: () => ({ select() { return this; }, fields() { return this; }, exec() {} }),
    nextTick: callback => callback(),
    login: () => ({ fail() {} }),
    getAccountInfoSync: () => ({ miniProgram: { appId: 'test' } }),
    showToast: ({ title }) => { toasts.push(title); },
    request: opts => {
      if (shouldFail) {
        opts.fail({ errMsg: 'request:fail url not in domain list' });
        return;
      }
      opts.success({
        statusCode: 200,
        data: { current: { temperature_2m: 19.7, weather_code: 3, precipitation: 0, wind_speed_10m: 7.3 } },
      });
    },
  };

  const previousWx = global.wx;
  const previousPage = global.Page;
  const previousConsoleError = console.error;
  global.wx = wxStub;
  global.Page = value => { definition = value; };
  console.error = () => {};

  delete require.cache[weatherPath];
  delete require.cache[pagePath];
  require(pagePath);

  // setData 的第二个参数是回调，真实运行时会调用；桩里必须实现，
  // 否则放在回调里的逻辑（如换城市后重拉）永远不会触发，会造出假 bug。
  const instance = {
    ...definition,
    data: { ...definition.data },
    setData(patch, callback) {
      Object.assign(this.data, patch);
      if (typeof callback === 'function') callback();
    },
  };

  return {
    instance,
    toasts,
    /** 模拟用户去后台配好了 request 合法域名。 */
    recover() { shouldFail = false; },
    restore() {
      global.wx = previousWx;
      global.Page = previousPage;
      console.error = previousConsoleError;
      delete require.cache[weatherPath];
      delete require.cache[pagePath];
    },
  };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('页面：取数失败时显示可点击的提示，而不是静默隐藏', async () => {
  const harness = pageHarness({ fail: true });
  try {
    const { instance, toasts } = harness;
    instance.loadWeather();
    await tick();

    // 提示可见，且明确告知可点击重试
    assert.equal(instance.data.weatherErrorText, '天气暂不可用 · 点此重试');
    // 天气本体仍为空——绝不用假数据顶替
    assert.equal(instance.data.weatherText, '');
    // 首次失败给一个 toast 提示
    assert.equal(toasts.length, 1);
  } finally {
    harness.restore();
  }
});

test('页面：点提示后重试，配好域名即自动恢复并清除提示', async () => {
  const harness = pageHarness({ fail: true });
  try {
    const { instance, toasts, recover } = harness;
    instance.loadWeather();
    await tick();
    assert.equal(instance.data.weatherErrorText, '天气暂不可用 · 点此重试');

    // 用户配好白名单后点重试
    recover();
    instance.onRetryWeather();
    await tick();

    assert.equal(instance.data.weatherErrorText, '', '成功后提示应自动清除');
    assert.ok(instance.data.weatherText.length > 0, '应显示真实天气');
    assert.ok(instance.data.weatherText.includes('上海'));
    // 知晓后再次失败不应重复 toast
    assert.equal(toasts.length, 1, '重试成功不应再弹 toast');
  } finally {
    harness.restore();
  }
});

test('页面：反复取数失败也不会反复弹 toast', async () => {
  const harness = pageHarness({ fail: true });
  try {
    const { instance, toasts } = harness;
    instance.loadWeather();
    await tick();
    assert.equal(toasts.length, 1);

    // 连续多次触发（模拟用户反复进页面 / 反复点重试）
    instance.loadWeather(true);
    await tick();
    instance.loadWeather(true);
    await tick();

    assert.equal(toasts.length, 1, '失败提示只应出现一次，避免变成噪音');
  } finally {
    harness.restore();
  }
});

