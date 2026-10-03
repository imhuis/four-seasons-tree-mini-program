"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 小程序入口 · 全局兜底。
 *
 * 本 Demo 的全部动画状态都保存在页面实例的内存对象里（见 pages/season-tree/index.ts），
 * 不做全局状态共享或持久化，因此 App 层不持有业务状态。
 *
 * 但 App 层不是空实现：这个页面整屏是 WebGL 画布，**没有任何 DOM 兜底**——
 * 一旦脚本抛错，用户看到的就是一块永久静止的画面，开发者还拿不到堆栈。
 * 所以这里补三件事：
 * 1. onError / onUnhandledRejection：把错误统一落到 console，附带场景上下文；
 * 2. 内存告警：转发给页面，让页面有机会主动停动画交还显存（见 utils/app-events.ts）；
 * 3. 主题切换：仅记录。本项目是刻意固定的浅色纸感风格，跟随系统深色反而会破坏它。
 *
 * 所有 wx.* 调用都先 typeof 检查：预览面板等模拟器不一定实现这些 API，
 * 缺方法时静默跳过，不能让兜底代码自己成为抛错源。
 */
const app_events_1 = require("./utils/app-events");
/** 把任意被拒绝的值压成一行可读文本，避免把整个对象塞进日志。 */
function describe(reason) {
    var _a;
    if (reason instanceof Error)
        return `${reason.name}: ${reason.message}`;
    if (typeof reason === 'string')
        return reason;
    try {
        return (_a = JSON.stringify(reason)) !== null && _a !== void 0 ? _a : typeof reason;
    }
    catch (_b) {
        // 循环引用等无法序列化的值。返回类型提示即可，不为写日志再抛一次。
        return typeof reason;
    }
}
App({
    onError(error) {
        // 这条日志是 WebGL 页面唯一的错误出口，不能吞。
        console.error('[app] uncaught error', error);
    },
    onUnhandledRejection(result) {
        // 云同步与天气取数都是 fire-and-forget 的 Promise，拒绝若无人接住会静默丢失。
        console.error('[app] unhandled rejection', describe(result === null || result === void 0 ? void 0 : result.reason));
    },
    onLaunch() {
        // onMemoryWarning 不是 App 钩子，只能用 wx.onMemoryWarning 注册（需基础库 2.0.2+）。
        // 缺失时静默跳过：拿不到告警只是少一条优化线索，不该影响小程序启动。
        if (typeof wx === 'undefined' || typeof wx.onMemoryWarning !== 'function')
            return;
        wx.onMemoryWarning((result) => {
            // iOS 只会给出 5/10/15 三档，Android 给 TRIM_MEMORY_*。这里只透传，不解释语义。
            (0, app_events_1.broadcastMemoryWarning)(typeof (result === null || result === void 0 ? void 0 : result.level) === 'number' ? result.level : 0);
        });
    },
    onThemeChange(result) {
        var _a;
        // 记录但不跟随：配色是设计的一部分，不该被系统深色模式覆盖。
        console.log('[app] system theme changed', (_a = result === null || result === void 0 ? void 0 : result.theme) !== null && _a !== void 0 ? _a : 'unknown');
    },
});
//# sourceMappingURL=app.js.map