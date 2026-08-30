/**
 * Phase 8/8.1：最低上线保护（服务端防滥用与费用保护）。
 *
 * 结构：
 * - RequestGuard：入口预检（客户端分钟/日限额，进程内计数）与模型调用槽位
 *   （全局日额度 + 并发上限 + kill switch —— 通过 SharedBudgetStore 跨实例共享计数）。
 * - SharedBudgetStore 见 shared-budget.ts：生产使用 CloudBase 文档型数据库（原子条件更新）；
 *   未配置/鉴权失败 → 真实模型调用安全关闭（失败关闭，绝不静默回退内存计数）。
 * - 客户端限频为进程内固定窗口；客户端标识 = X-Forwarded-For 首址 SHA-256 哈希。
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beijingKey as beijingDateFn, newLeaseId, type SharedBudgetStore } from "./shared-budget.js";
export const beijingDate = beijingDateFn;
// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
export interface LimitConfig {
  clientPerMinute: number;
  clientPerDay: number;
  globalModelPerDay: number;
  maxConcurrentModels: number;
  killSwitch: boolean;
}
export const DEFAULT_LIMITS: Readonly<LimitConfig> = Object.freeze({
  clientPerMinute: 6,
  clientPerDay: 30,
  globalModelPerDay: 100,
  maxConcurrentModels: 3,
  killSwitch: false,
});
export function resolveLimitConfig(env: NodeJS.ProcessEnv = process.env): LimitConfig {
  const num = (v: string | undefined, fallback: number): number => {
    if (v === undefined || v.trim() === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  };
  const killEnv = (env.LIMIT_KILL_SWITCH ?? "").trim().toLowerCase();
  return {
    clientPerMinute: num(env.LIMIT_CLIENT_PER_MINUTE, DEFAULT_LIMITS.clientPerMinute),
    clientPerDay: num(env.LIMIT_CLIENT_PER_DAY, DEFAULT_LIMITS.clientPerDay),
    globalModelPerDay: num(env.LIMIT_GLOBAL_MODEL_PER_DAY, DEFAULT_LIMITS.globalModelPerDay),
    maxConcurrentModels: num(env.LIMIT_MAX_CONCURRENT_MODELS, DEFAULT_LIMITS.maxConcurrentModels),
    killSwitch: readDeployKillSwitch() || killEnv === "1" || killEnv === "true" || killEnv === "on",
  };
}
export function readDeployKillSwitch(): boolean {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "runtime-config.json"), "utf8");
    const obj = JSON.parse(raw) as { killSwitch?: unknown };
    return obj.killSwitch === true;
  } catch {
    return false;
  }
}
// ---------------------------------------------------------------------------
// 进程级固定窗口（仅客户端限频）
// ---------------------------------------------------------------------------
export interface WindowCounter { count: number; windowEnd: number }
export interface CounterStore {
  increment(key: string, windowEnd: number): { count: number; windowEnd: number };
  peek(key: string): WindowCounter | undefined;
  sweep(now: number): void;
}
export class FixedWindowCounterStore implements CounterStore {
  private readonly map = new Map<string, WindowCounter>();
  private lastSweep = 0;
  increment(key: string, windowEnd: number): { count: number; windowEnd: number } {
    const cur = this.map.get(key);
    if (cur !== undefined && cur.windowEnd === windowEnd) { cur.count += 1; return { count: cur.count, windowEnd: cur.windowEnd }; }
    if (cur !== undefined && cur.windowEnd < windowEnd) { cur.count = 1; cur.windowEnd = windowEnd; return { count: cur.count, windowEnd: cur.windowEnd }; }
    const fresh: WindowCounter = { count: 1, windowEnd };
    this.map.set(key, fresh);
    return { count: fresh.count, windowEnd: fresh.windowEnd };
  }
  peek(key: string): WindowCounter | undefined { return this.map.get(key); }
  sweep(now: number): void {
    if (now - this.lastSweep < 5 * 60_000) return;
    this.lastSweep = now;
    for (const [key, c] of this.map) { if (c.windowEnd < now) this.map.delete(key); }
  }
}
// ---------------------------------------------------------------------------
// 判定与文案
// ---------------------------------------------------------------------------
export type LimitCode = "CLIENT_MINUTE" | "CLIENT_DAY" | "GLOBAL_MODEL_DAY" | "MODEL_CONCURRENCY" | "KILL_SWITCH" | "STORE_ERROR";
export interface LimitDecision {
  allowed: boolean;
  code: LimitCode;
  retryAfterSeconds: number;
  leaseId?: string | undefined;
}
export function limitMessage(code: LimitCode): string {
  switch (code) {
    case "CLIENT_MINUTE": return "请求过于频繁，请稍后再试（约 1 分钟）。";
    case "CLIENT_DAY": return "今日咨询次数已达上限，请明天再来。";
    case "GLOBAL_MODEL_DAY": return "今日咨询人数较多，服务暂时不可用，请明天再来。";
    case "MODEL_CONCURRENCY": return "服务繁忙，请稍后再试。";
    case "KILL_SWITCH": return "服务暂时繁忙，请稍后再试。";
    case "STORE_ERROR": return "服务繁忙，请稍后再试。";
    default: return "请求过于频繁，请稍后再试。";
  }
}
export function retryAfterSeconds(windowEnd: number, now: number): number {
  return Math.max(1, Math.ceil((windowEnd - now) / 1000));
}
// ---------------------------------------------------------------------------
// 窗口键
// ---------------------------------------------------------------------------
export function hashClientKey(rawIp: string | undefined): string {
  if (rawIp === undefined || rawIp.trim() === "") return "anonymous";
  return createHash("sha256").update(rawIp.trim()).digest("hex").slice(0, 32);
}
// ---------------------------------------------------------------------------
// RequestGuard
// ---------------------------------------------------------------------------
export interface GuardInput {
  config?: Readonly<LimitConfig>;
  store?: CounterStore;
  now?: () => number;
  sharedBudget?: SharedBudgetStore | undefined;
}
export class RequestGuard {
  private readonly config: Readonly<LimitConfig>;
  private readonly store: CounterStore;
  private readonly now: () => number;
  private readonly shared: SharedBudgetStore | undefined;
  private readonly localConcurrent = new Set<string>();
  constructor(input: GuardInput = {}) {
    this.config = input.config ?? DEFAULT_LIMITS;
    this.store = input.store ?? new FixedWindowCounterStore();
    this.now = input.now ?? (() => Date.now());
    this.shared = input.sharedBudget;
  }
  getConfig(): Readonly<LimitConfig> { return this.config; }
  hasSharedBudget(): boolean { return this.shared !== undefined; }
  /** 客户端分钟/日限额（入口预检；存储异常时放行——可用性优先）。 */
  checkClient(rawIp: string | undefined): LimitDecision {
    const now = this.now();
    const key = "c:" + hashClientKey(rawIp);
    try {
      const minuteEnd = now - (now % 60_000) + 60_000;
      const minRes = this.store.increment(key + ":m" + Math.floor(now / 60_000), minuteEnd);
      if (minRes.count > this.config.clientPerMinute) {
        return { allowed: false, code: "CLIENT_MINUTE", retryAfterSeconds: retryAfterSeconds(minuteEnd, now) };
      }
      const dayKey = beijingDate(now);
      const dayEnd = Date.parse(dayKey + "T16:00:00.000Z");
      const dayRes = this.store.increment(key + ":d" + dayKey, dayEnd);
      if (dayRes.count > this.config.clientPerDay) {
        return { allowed: false, code: "CLIENT_DAY", retryAfterSeconds: retryAfterSeconds(dayEnd, now) };
      }
      this.store.sweep(now);
      return { allowed: true, code: "CLIENT_MINUTE", retryAfterSeconds: 0 };
    } catch {
      return { allowed: true, code: "STORE_ERROR", retryAfterSeconds: 0 };
    }
  }
  /**
   * 模型调用前的共享预算检查并占用槽位（kill switch → 日额度 → 并发；跨实例原子）。
   * 成功时返回 leaseId；释放用 releaseModelSlot(leaseId)。
   * 存储异常/未配置 → STORE_ERROR（失败关闭，绝不静默回退内存计数）。
   */
  async tryModelSlot(): Promise<LimitDecision> {
    if (this.config.killSwitch) {
      return { allowed: false, code: "KILL_SWITCH", retryAfterSeconds: 600 };
    }
    if (this.shared === undefined || !this.shared.configured) {
      return { allowed: false, code: "STORE_ERROR", retryAfterSeconds: 60 };
    }
    const now = this.now();
    const dayKey = beijingDate(now);
    const dayEnd = Date.parse(dayKey + "T16:00:00.000Z");
    try {
      const day = await this.shared.acquireDaily(dayKey, this.config.globalModelPerDay, now);
      if (day.storeError) return { allowed: false, code: "STORE_ERROR", retryAfterSeconds: 60 };
      if (!day.ok) return { allowed: false, code: "GLOBAL_MODEL_DAY", retryAfterSeconds: retryAfterSeconds(dayEnd, now) };
      const leaseId = newLeaseId();
      const slot = await this.shared.acquireConcurrency(leaseId, this.config.maxConcurrentModels, now);
      if (slot.storeError) {
        await this.shared.releaseDaily(dayKey).catch(() => undefined);
        return { allowed: false, code: "STORE_ERROR", retryAfterSeconds: 60 };
      }
      if (!slot.ok) {
        await this.shared.releaseDaily(dayKey).catch(() => undefined);
        return { allowed: false, code: "MODEL_CONCURRENCY", retryAfterSeconds: 15 };
      }
      this.localConcurrent.add(leaseId);
      return { allowed: true, code: "CLIENT_MINUTE", retryAfterSeconds: 0, leaseId };
    } catch {
      // 存储异常（含抛错形态）：失败关闭，绝不回退内存计数。
      return { allowed: false, code: "STORE_ERROR", retryAfterSeconds: 60 };
    }
  }
  async releaseModelSlot(leaseId: string | undefined): Promise<void> {
    if (leaseId === undefined) return;
    this.localConcurrent.delete(leaseId);
    try { await this.shared?.releaseConcurrency(leaseId); } catch { /* 租约到期回收兜底 */ }
  }
  currentLocalConcurrent(): number { return this.localConcurrent.size; }
}
