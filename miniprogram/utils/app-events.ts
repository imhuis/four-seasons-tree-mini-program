/**
 * 四时木 · 运行时事件总线。
 *
 * 为什么单独一个模块：App 生命周期钩子（app.ts）与页面（index.ts）都要访问同一份
 * 状态，但页面无法 import app.ts 的实例——把状态放这里，两边都只依赖本模块，
 * 也就不会形成循环引用。本模块**不碰 wx**，因此可被 Node 测试直接引入。
 *
 * 目前只登记「内存告警」这一种事件：它需要跨边界传递（App 收到 → 页面消费），
 * 而错误与未处理拒绝只在 app.ts 内打日志就够了。
 */

/** 内存不足告警的级别沿用 wx 传入的原始值（不解释具体平台语义，只做透传）。 */
export type MemoryWarningLevel = number;

/** 内存告警的订阅者。返回值为取消订阅的函数。 */
export type MemoryWarningListener = (level: MemoryWarningLevel) => void;

const listeners: MemoryWarningListener[] = [];
/** 已收到的最高告警级别；0 表示尚未收到过。 */
let highestLevel = 0;

/**
 * 广播一次内存告警。
 *
 * 由 app.ts 在 wx.onMemoryWarning 里调用。所有订阅者都会被通知——
 * 内存紧张时不做"只通知第一个"的去重：漏掉一次可能意味着真机直接被系统回收。
 */
export function broadcastMemoryWarning(level: MemoryWarningLevel): void {
  if (Number.isFinite(level) && level > highestLevel) highestLevel = level;
  // 复制一份再遍历：订阅者可能在回调里退订，直接遍历会跳过后面的订阅者。
  for (const listener of listeners.slice()) {
    try {
      listener(level);
    } catch (error: unknown) {
      // 订阅者抛错绝不能反过来打断广播——内存告警下少通知一个人都很致命。
      console.error('[app-events] memory warning listener failed',
        error instanceof Error ? error.message : 'unknown');
    }
  }
}

/** 订阅内存告警。返回退订函数，页面须在 onUnload 调用以免泄漏。 */
export function onMemoryWarning(listener: MemoryWarningListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/** 历史最高告警级别（供页面在 onLoad 时补判：订阅前就发生的告警也会被计入）。 */
export function highestMemoryWarningLevel(): number {
  return highestLevel;
}

/** 仅供测试：清空订阅者与告警记录，避免用例之间互相污染。 */
export function resetMemoryWarningForTest(): void {
  listeners.length = 0;
  highestLevel = 0;
}
