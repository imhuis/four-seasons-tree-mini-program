/**
 * 四时木 · 浏览进度的云同步。
 *
 * 职责（与页面渲染完全解耦，全部是低频请求，不碰动画状态）：
 * 1. 页面加载时静默微信登录（wx.login 不弹任何授权窗）；
 * 2. 登录成功后：登记一次独立访客（bump_tree_visit，每用户只计一次）
 *    并恢复该用户上次浏览的季节进度（tree_progress，行级安全仅本人可读写）；
 * 3. 拖动时间轴结束后把最新进度 upsert 回云端。
 *
 * 失败语义：登录或保存失败时进入「本地模式」并在 UI 明示——不做任何
 * localStorage 兜底存储，云同步不可用就是不同步，不假装成功。
 */
import { getCloud } from './cloud';

/** 云同步在 UI 上的三种状态。 */
export type CloudSyncStatus = 'connecting' | 'synced' | 'local';

export interface CloudSyncHandlers {
  /** 连接状态变化。 */
  onStatus(status: CloudSyncStatus): void;
  /** 独立访客总数（每用户只计一次，成功后回调一次）。 */
  onVisitCount(count: number): void;
  /** 云端保存的浏览进度（仅在存在且 > 0 时回调一次）。 */
  onRestoredProgress(progress: number): void;
}

/** 是否已建立 WorkBuddy 会话（决定保存请求是否发出）。 */
let sessionReady = false;
/** initCloudSync 只允许被调用一次（页面可能因异常重入 onLoad）。 */
let initStarted = false;

export function isCloudSessionReady(): boolean {
  return sessionReady;
}

/**
 * 页面加载时调用一次。整个流程不阻塞渲染：Canvas 动画照常启动，
 * 云端进度回来后再平滑设置到场景上。
 */
export function initCloudSync(handlers: CloudSyncHandlers): void {
  if (initStarted) return;
  initStarted = true;
  handlers.onStatus('connecting');

  wx.login({
    success: async ({ code }: { code: string }) => {
      try {
        // appid 必须取当前运行时的小程序（试用版/正式版是两个不同小程序）。
        const appid = wx.getAccountInfoSync().miniProgram.appId;
        const { data: session, error } = await getCloud().auth.signInWithWechat(code, appid);
        if (error !== null || session === null) {
          // 登录失败（未绑定小程序/开关未开/网络问题）：明确降级为本地模式。
          console.error(
            '[season-tree] cloud login failed',
            JSON.stringify({ stage: 'signin', kind: error !== null ? error.kind : 'empty-session' })
          );
          handlers.onStatus('local');
          return;
        }
        sessionReady = true;
        handlers.onStatus('synced');
        void loadVisitCount(handlers);
        void restoreProgress(handlers);
      } catch (error: unknown) {
        console.error(
          '[season-tree] cloud login failed',
          JSON.stringify({
            stage: 'wechat-login-handler',
            message: error instanceof Error ? error.message : '微信登录失败',
          })
        );
        handlers.onStatus('local');
      }
    },
    fail: (error: { errMsg: string }) => {
      console.error(
        '[season-tree] cloud login failed',
        JSON.stringify({ stage: 'wx.login', message: error.errMsg })
      );
      handlers.onStatus('local');
    },
  });
}

/** 登记独立访客并取回总数。失败只影响"第 N 位访客"文案，不打扰主流程。 */
async function loadVisitCount(handlers: CloudSyncHandlers): Promise<void> {
  const { data, error } = await getCloud().database.rpc('bump_tree_visit');
  if (error !== null) {
    console.error(
      '[season-tree] visit count failed',
      JSON.stringify({ code: error.code ?? '', message: error.message })
    );
    return;
  }
  if (typeof data === 'number' && data > 0) handlers.onVisitCount(data);
}

/** 恢复上次浏览的季节进度（行级安全保证只能读到本人那一行）。 */
async function restoreProgress(handlers: CloudSyncHandlers): Promise<void> {
  const { data, error } = await getCloud().database
    .from('tree_progress')
    .select('season_progress')
    .maybeSingle();
  if (error !== null) {
    console.error(
      '[season-tree] restore progress failed',
      JSON.stringify({ code: error.code ?? '', message: error.message })
    );
    return;
  }
  const value = (data as { season_progress?: number } | null)?.season_progress;
  if (typeof value === 'number' && value > 0) handlers.onRestoredProgress(value);
}

/**
 * 保存浏览进度。owner_id 由数据库 DEFAULT auth.uid() 服务端填充，
 * 这里绝不手传；冲突时按 owner_id 更新本人那一行。
 */
export async function saveSeasonProgress(progress: number): Promise<boolean> {
  if (!sessionReady) return false;
  const { error } = await getCloud().database
    .from('tree_progress')
    .upsert({ season_progress: progress }, { onConflict: 'owner_id' });
  if (error !== null) {
    // 网络失败 / 未登录 / 权限不足都要"响"，不能静默吞掉。
    console.error(
      '[season-tree] save progress failed',
      JSON.stringify({ code: error.code ?? '', message: error.message })
    );
    return false;
  }
  return true;
}
