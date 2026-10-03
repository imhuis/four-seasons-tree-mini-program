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
import { createMiniProgramWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk/miniprogram';

import { publicConfig } from './cloud-config';
import { createDiagnosticWx } from './workbuddy-cloud-diagnostics';

/**
 * 本应用用到的表与函数的最小类型描述（supabase Database 形状）。
 * 只声明实际触碰的字段；owner_id 由数据库 DEFAULT auth.uid() 填充，
 * 因此 Insert/Update 都不含它。
 */
export interface SeasonTreeDatabase {
  public: {
    Tables: {
      tree_progress: {
        Row: { id: number; owner_id: string; season_progress: number; updated_at: string };
        Insert: { season_progress: number };
        Update: { season_progress: number };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      bump_tree_visit: { Args: Record<string, never>; Returns: number };
    };
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
  };
}

type CloudClient = ReturnType<typeof createMiniProgramWorkBuddyCloud<SeasonTreeDatabase>>;

let client: CloudClient | null = null;

/**
 * 惰性获取云客户端。
 * 不能在模块顶层就求值 `wx`：Node 测试环境（VM 沙箱）没有全局 wx，
 * 模块加载会直接 ReferenceError。小程序真实运行时首次调用即完成初始化。
 */
export function getCloud(): CloudClient {
  if (client === null) {
    client = createMiniProgramWorkBuddyCloud<SeasonTreeDatabase>({
      endpoint: publicConfig.endpoint,
      publishableKey: publicConfig.publishableKey,
      // 诊断包装后的 wx 与 SDK 期望的结构"鸭子"兼容，做一次显式桥接：
      wx: createDiagnosticWx(wx) as unknown as Parameters<
        typeof createMiniProgramWorkBuddyCloud
      >[0]['wx'],
    });
  }
  return client;
}
