# 四时木 · 项目长期记忆

## 应用绑定（最重要，勿破坏）

- 小程序应用「四时木」`wbapp_LLs54JswnNo56ygNvAS3O2` 绑定在 `D:\Workspace\four-seasons-tree-mini-program` 这个**精确路径**上。
- 绑定三件套：根目录 `.wbapp_<appId>.genie`（含 `localDir`）、`.workbuddy/applications.yaml`（面板列表读这里）、`miniprogram/.wbapp_<appId>.privacy.json`（隐私清单）。
- **严禁再改项目目录名**：`.genie` 的 `localDir` 与云绑定依赖路径，改名后新会话将找不到应用（无法点「分享」发布）。若用户坚持改名，必须同步改 `.genie` 的 `localDir`，并确认 applications.yaml 仍在。
- 换会话/换目录找不到应用时：先回到该路径打开工作区；全局兜底入口在「设置 → 数据管理 → 发布的应用」。

## 发布约定

- 发布流程：`npm run build` → 五项校验 → sites 工具（返回 `sites_miniprogram_app_created`，复用应用，无链接）→ 用户在小程序应用预览面板右上角「分享」完成绑定/上传/审核/上线。
- 小程序不走网址，没有分享链接；不要试图用 web 方式发布，也不要写 H5 版本顶替。
- 五项发布前校验（详见当日日志）：type-check 0 错误 / `vendor/three.js` / `miniprogram_npm` 云 SDK（build 不会重建它，曾整目录丢失）/ `.privacy.json` / 相对 require 全可解析。

## 工程约定

- 源码 `miniprogram/`，TS 就地编译为同名 `.js`（微信 TS 插件正常形态）；改 `.ts` 后必须 `npm run build` 才能发布，`type-check` 不产生产物。
- **测试不编译 TS**：`npm test` 全绿不代表类型没问题（重复函数定义等只有 `npm run build` 才暴露）。type-check 与测试必须分开跑。
- `.gitignore` 不得重新加入 `miniprogram/**/*.js`（发布通道按 gitignore 过滤，会导致产物被剔除）。
- 改应用名要同步 4 处：applications.yaml、.genie、app.json 的 navigationBarTitleText、project.config.json 描述。

## 模拟器兼容性（已踩坑两次，必须遵守）

**WorkBuddy 小程序预览面板的模拟器只实现了部分 wx API，缺方法是常态。**
凡是直接调 `wx.*` 的地方，必须先 `typeof` 检查并提供回退，否则抛错会中断页面生命周期（场景起不来，比功能缺失更难排查）。

已封装三个包装方法，新增 wx 调用一律走包装或自带守卫：

- `selectorQuery()` — 实例方法优先，回退 `wx.createSelectorQuery()`，都无则返回 null（走 error 路径）
- `nextTick(cb)` — 回退 `setTimeout(cb, 0)`
- `toast(title)` — 缺 `wx.showToast` 时静默跳过

`season-sync.ts` 的 `wx.login` / `wx.getAccountInfoSync` 同样有守卫：缺失时进「本地模式」返回。
**这条尤其重要——它在 `onLoad` 里，抛错会导致后面的天气取数与场景初始化全部跑不到。**

## 外部数据服务

- 天气：Open-Meteo `api.open-meteo.com`（免 key）。**`utils/weather.ts` 内所有 wx 访问都是惰性的**（模块顶层求值 wx 会让 Node 测试 ReferenceError），沿用 `cloud.ts` 的 `getCloud()` 模式。
- **部署前提**：`api.open-meteo.com` 需在小程序后台配为 request 合法域名，未配时真机静默失败（显示「天气暂不可用 · 点此重试」）。这是代码改不了的，只能由用户在后台配。
- 城市用内置列表 + 手动选择，**不要用 `wx.getLocation`**：属隐私接口，改隐私清单会触发重新提审。
