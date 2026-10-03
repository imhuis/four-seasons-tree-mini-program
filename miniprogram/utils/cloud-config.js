"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicConfig = void 0;
/**
 * 四时木 · 云服务公开配置。
 *
 * 这两个值来自 workbuddy_cloud_service 激活结果里的 publicConfig，是平台
 * 明确允许放进前端代码的公开值：publishableKey 只标识"哪个应用"、本身
 * 不携带任何权限，服务端按应用的请求来源精确匹配。
 *
 * ⚠️ endpoint 是小程序共用的固定网关（mp-api.app.workbuddy.host），由后端
 * 下发、随微信请求域名白名单一起注册。不要改成任何其他域名（包括应用
 * 自己的分享域名）——那只会让所有云请求被拒绝。
 */
exports.publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_LLs54JswnNo56ygNvAS3O2_hq6RwhmizJITEqrkW3RpRVauScg7e9TZ',
};
//# sourceMappingURL=cloud-config.js.map