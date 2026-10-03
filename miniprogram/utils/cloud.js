"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCloud = getCloud;
/**
 * 四时木 · 云客户端（全项目唯一的初始化点）。
 *
 * - 使用小程序专用工厂 createMiniProgramWorkBuddyCloud（内部按固定顺序装配
 *   polyfill / wx.request fetch / wx storage，这里不手动拼装任何一步）；
 * - endpoint 与 publishableKey 均来自 publicConfig（cloud-config.ts）；
 * - 传入诊断包装的 wx，让发布后的真机能看到云请求失败的具体原因。
 *
 * cloud.auth / cloud.database / cloud.storage / cloud.llm 共享这一个实例；
 * 登录后数据库请求会自动携带会话，无需任何手动 token 传递。
 */
const miniprogram_1 = require("@tencent-ai/workbuddy-cloud-sdk/miniprogram");
const cloud_config_1 = require("./cloud-config");
const workbuddy_cloud_diagnostics_1 = require("./workbuddy-cloud-diagnostics");
let client = null;
/**
 * 惰性获取云客户端。
 * 不能在模块顶层就求值 `wx`：Node 测试环境（VM 沙箱）没有全局 wx，
 * 模块加载会直接 ReferenceError。小程序真实运行时首次调用即完成初始化。
 */
function getCloud() {
    if (client === null) {
        client = (0, miniprogram_1.createMiniProgramWorkBuddyCloud)({
            endpoint: cloud_config_1.publicConfig.endpoint,
            publishableKey: cloud_config_1.publicConfig.publishableKey,
            // 诊断包装后的 wx 与 SDK 期望的结构"鸭子"兼容，做一次显式桥接：
            wx: (0, workbuddy_cloud_diagnostics_1.createDiagnosticWx)(wx),
        });
    }
    return client;
}
//# sourceMappingURL=cloud.js.map