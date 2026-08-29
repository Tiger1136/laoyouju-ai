/**
 * Phase 8：最低上线保护（服务端防滥用与费用保护）。
 *
 * 结构：
 * - RequestGuard：入口预检（客户端分钟/日限额）与模型调用槽位（全局日额度 + 并发上限 + kill switch）；
 * - 计数存储：FixedWindowCounterStore（进程级，固定窗口，自动清扫）；
 *   跨实例说明：客户端分钟/日限制同时受 CloudBase 网关 qpsPerClient（ClientIP，按实例无关、网关层）
 *   兜底；全局日额度与并发上限当前按【实例】生效——跨实例精确共享计数需要 CloudBase 数据库
 *   服务端 API Key（CLOUDBASE_APIKEY），属 PM 决策项，报告如实说明（不做单进程冒充）。
 * - 所有阈值可通过环境变量覆盖（LIMIT_*），默认值见 DEFAULT_LIMITS；kill switch 支持
 *   运行时环境变量（LIMIT_KILL_SWITCH）与部署包 runtime-config.json（构建期注入，默认关）。
 * - 失败模式：存储异常时，客户端限制降级放行（可用性优先），模型调用失败关闭（费用保护优先）。
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

export interface LimitConfig {
  /** 单客户端每分钟请求上限（默认 6）。 */
  clientPerMinute: number;
  /** 单客户端每天请求上限（默认 30）。 */
  clientPerDay: number;
  /** 全局每天真实 DeepSeek 调用上限（默认 100；按实例计数，见模块头说明）。 */
  globalModelPerDay: number;
  /** 全局并发模型调用上限（默认 3；按实例计数，见模块头说明）。 */
  maxConcurrentModels: number;
  /** kill switch：true 时不调用 DeepSeek。默认 false（服务可用）。 */
  killSwitch: boolean;
}

export const DEFAULT_LIMITS: Readonly<LimitConfig> = Object.freeze({
  clientPerMinute: 6,
  clientPerDay: 30,
  globalModelPerDay: 100,
  maxConcurrentModels: 3,
  killSwitch: false,
});

/** 从环境变量读取限流配置（仅在存在且为合法数字时覆盖默认值；不读取任何密钥）。 */
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
    // kill switch：部署包 runtime-config.json（构建期注入，默认关闭）或运行时环境变量。
    killSwitch: readDeployKillSwitch() || killEnv === "1" || killEnv === "true" || killEnv === "on",
  };
}

/** 部署包内 runtime-config.json（构建期由 build-deploy 写入；默认不存在 -> 关闭）。 */
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
// 存储（进程级固定窗口；可注入失败以测试安全降级）
// ---------------------------------------------------------------------------

export interface WindowCounter {
  count: number;
  windowEnd: number; // 毫秒时间戳（本窗口的截止时间，用于 retryAfter）
}

export interface CounterStore {
  /** 原子性“检查并 +1”：返回新计数与窗口截止（增量更新计数）。 */
  increment(key: string, windowEnd: number): { count: number; windowEnd: number };
  /** 读取当前计数（不修改）。 */
  peek(key: string): WindowCounter | undefined;
  /** 清扫过期窗口（≤ 每 5 分钟触发一次）。 */
  sweep(now: number): void;
}

export class FixedWindowCounterStore implements CounterStore {
  private readonly map = new Map<string, WindowCounter>();
  private lastSweep = 0;

  increment(key: string, windowEnd: number): { count: number; windowEnd: number } {
    const cur = this.map.get(key);
    if (cur !== undefined && cur.windowEnd === windowEnd) {
      cur.count += 1;
      return { count: cur.count, windowEnd: cur.windowEnd };
    }
    if (cur !== undefined && cur.windowEnd < windowEnd) {
      // 已进入新窗口：直接覆盖（旧窗口自然过期）。
      cur.count = 1;
      cur.windowEnd = windowEnd;
      return { count: cur.count, windowEnd: cur.windowEnd };
    }
    const fresh: WindowCounter = { count: 1, windowEnd };
    this.map.set(key, fresh);
    return { count: fresh.count, windowEnd: fresh.windowEnd };
  }

  peek(key: string): WindowCounter | undefined {
    return this.map.get(key);
  }

  sweep(now: number): void {
    if (now - this.lastSweep < 5 * 60_000) {
      return;
    }
    this.lastSweep = now;
    for (const [key, c] of this.map) {
      if (c.windowEnd < now) {
        this.map.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 判定与文案
// ---------------------------------------------------------------------------

export type LimitCode =
  | "CLIENT_MINUTE"
  | "CLIENT_DAY"
  | "GLOBAL_MODEL_DAY"
  | "MODEL_CONCURRENCY"
  | "KILL_SWITCH"
  | "STORE_ERROR";

export interface LimitDecision {
  allowed: boolean;
  code: LimitCode;
  /** 秒（建议 Retry-After）。 */
  retryAfterSeconds: number;
}

/** 面向用户的稳定中文文案（不含内部实现细节；前端可据此映射/显示）。 */
export function limitMessage(code: LimitCode): string {
  switch (code) {
    case "CLIENT_MINUTE":
      return "请求过于频繁，请稍后再试（约 1 分钟）。";
    case "CLIENT_DAY":
      return "今日咨询次数已达上限，请明天再来。";
    case "GLOBAL_MODEL_DAY":
      return "今日咨询人数较多，服务暂时不可用，请明天再来。";
    case "MODEL_CONCURRENCY":
      return "服务繁忙，请稍后再试。";
    case "KILL_SWITCH":
      return "服务暂时繁忙，请稍后再试。";
    case "STORE_ERROR":
      return "服务繁忙，请稍后再试。";
    default:
      return "请求过于频繁，请稍后再试。";
  }
}

/** 返回秒级 retryAfter（ceil 到秒；至少 1 秒）。 */
export function retryAfterSeconds(windowEnd: number, now: number): number {
  return Math.max(1, Math.ceil((windowEnd - now) / 1000));
}

// ---------------------------------------------------------------------------
// 窗口键（客户端标识：不可逆哈希；日窗口按北京时间）
// ---------------------------------------------------------------------------

/** 北京时间日期（YYYY-MM-DD）——日志/限流的“天”按北京时间切换。 */
export function beijingDate(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 客户端键：对原始 IP 做 SHA-256 不可逆哈希（不存明文 IP；见隐私说明）。 */
export function hashClientKey(rawIp: string | undefined): string {
  if (rawIp === undefined || rawIp.trim() === "") {
    return "anonymous";
  }
  return createHash("sha256").update(rawIp.trim()).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// RequestGuard
// ---------------------------------------------------------------------------

export interface GuardInput {
  config?: Readonly<LimitConfig>;
  store?: CounterStore;
  now?: () => number;
}

export class RequestGuard {
  private readonly config: Readonly<LimitConfig>;
  private readonly store: CounterStore;
  private readonly now: () => number;
  private concurrent = 0;

  constructor(input: GuardInput = {}) {
    this.config = input.config ?? DEFAULT_LIMITS;
    this.store = input.store ?? new FixedWindowCounterStore();
    this.now = input.now ?? (() => Date.now());
  }

  getConfig(): Readonly<LimitConfig> {
    return this.config;
  }

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
      const dayEnd = Date.parse(dayKey + "T16:00:00.000Z"); // 北京时间次日 00:00
      const dayRes = this.store.increment(key + ":d" + dayKey, dayEnd);
      if (dayRes.count > this.config.clientPerDay) {
        return { allowed: false, code: "CLIENT_DAY", retryAfterSeconds: retryAfterSeconds(dayEnd, now) };
      }
      this.store.sweep(now);
      return { allowed: true, code: "CLIENT_MINUTE", retryAfterSeconds: 0 };
    } catch {
      // 存储异常：客户端限制降级放行（避免存储问题导致服务整体不可用）。
      return { allowed: true, code: "STORE_ERROR", retryAfterSeconds: 0 };
    }
  }

  /**
   * 模型调用前的全局额度/并发/kill switch 检查并占用槽位（失败关闭：任何异常都不调用模型）。
   * 返回 allowed=false 时不得调用 DeepSeek；成功后必须调用 releaseModelSlot()。
   */
  tryModelSlot(): LimitDecision {
    const now = this.now();
    try {
      if (this.config.killSwitch) {
        return { allowed: false, code: "KILL_SWITCH", retryAfterSeconds: 600 };
      }
      const dayKey = beijingDate(now);
      const dayEnd = Date.parse(dayKey + "T16:00:00.000Z");
      const g = this.store.increment("g:deepseek:" + dayKey, dayEnd);
      if (g.count > this.config.globalModelPerDay) {
        return { allowed: false, code: "GLOBAL_MODEL_DAY", retryAfterSeconds: retryAfterSeconds(dayEnd, now) };
      }
      if (this.concurrent >= this.config.maxConcurrentModels) {
        return { allowed: false, code: "MODEL_CONCURRENCY", retryAfterSeconds: 15 };
      }
      this.concurrent += 1;
      return { allowed: true, code: "CLIENT_MINUTE", retryAfterSeconds: 0 };
    } catch {
      // 存储异常：模型调用失败关闭（费用保护优先，避免无限额放行）。
      return { allowed: false, code: "STORE_ERROR", retryAfterSeconds: 60 };
    }
  }

  /** 释放模型槽位（与 tryModelSlot 成对出现；重复释放安全）。 */
  releaseModelSlot(): void {
    if (this.concurrent > 0) {
      this.concurrent -= 1;
    }
  }

  /** 供测试：当前并发占用。 */
  currentConcurrent(): number {
    return this.concurrent;
  }
}
