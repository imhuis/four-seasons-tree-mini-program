/**
 * 云请求诊断助手（workbuddy-cloud-diagnostics.js）的类型声明。
 *
 * 该 .js 文件是 cloud-service 技能随附的官方资产，原样复制、不做修改：
 * 把云客户端经过的每个请求的失败摘要（方法/URL/HTTP 状态/错误码）打进
 * 真机 vConsole，便于发布后定位域名、授权与网络问题。这里只补类型。
 */

/** 包装宿主 wx 对象，转发请求与存储调用，并对失败请求打日志。 */
export declare function createDiagnosticWx(originalWx: unknown): {
  request(options: Record<string, unknown>): unknown;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
};
