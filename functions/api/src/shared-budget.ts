/**
 * Phase 8.1：跨实例共享预算（全局每日 DeepSeek 额度 + 全局并发槽位）。
 *
 * 存储：当前 CloudBase 环境自带的文档型数据库（仅环境内已有能力；集合由服务端 SDK 幂等创建，
 *       客户端无任何凭据可访问——集合不配置任何浏览器/匿名规则，管理端 API Key 仅存在于
 *       云函数环境变量 CLOUDBASE_APIKEY）。
 *
 * 原子性：全部使用单文档条件更新（where 条件 + $inc），是数据库级原子操作：
 *   - 日额度：{ _id: "day:<北京时间日期>", kind:"day", calls, createdAt }；
 *     where(calls < limit).update({ calls: inc(1) }) —— 并行时恰好只有 limit 次成功；
 *   - 并发：{ _id:"conc", kind:"conc", slots }；
 *     where(slots < limit).update({ slots: inc(1) }) 先取号，
 *     随后写入带 until（租约到期时间）的唯一 lease 文档（_id:"lease:<leaseId>"）；
 *   - 回收：每次取号前 reconcile（清理过期租约并按清除数量条件回退 slots）；
 *     进程崩溃的租约在到期后由后续取号安全回收（remove 唯一 _id 决出唯一回收者）。
 *
 * 失败模式（安全红线）：存储不可用/鉴权失败 → 全部真实模型调用拒绝（不静默回退内存计数）。
 */
import { createHash, randomUUID } from "node:crypto";

export interface SharedBudgetConfig {
  /** 环境 ID（运行时优先取 TCB_ENV）。 */
  envId: string;
  /** CloudBase 服务端 API Key（CLOUDBASE_APIKEY，仅服务端环境变量；绝不记录日志/回显）。 */
  accessKey: string;
  /** 集合名。 */
  collection: string;
  /** 并发租约时长（毫秒；异常退出后到期即回收）。 */
  leaseMs: number;
}

export interface BudgetAcquireResult {
  ok: boolean;
  storeError: boolean;
}

export interface SharedBudgetStore {
  readonly configured: boolean;
  /** 幂等就绪：创建集合（如不存在）+ 连通性检查。 */
  ensureReady(): Promise<boolean>;
  /** 全环境日额度：原子条件自增；dayKey 为北京时间 YYYY-MM-DD。 */
  acquireDaily(dayKey: string, limit: number, now: number): Promise<BudgetAcquireResult>;
  /** 全环境并发槽位：原子取号 + 唯一租约。 */
  acquireConcurrency(leaseId: string, limit: number, now: number): Promise<BudgetAcquireResult>;
  /** 释放槽位（幂等）。 */
  releaseConcurrency(leaseId: string): Promise<void>;
  /** 回退一次日额度（并发失败/存储失败时避免空耗预算；幂等）。 */
  releaseDaily(dayKey: string): Promise<void>;
  /** 回收过期租约（取号前调用；也用于跨日清扫）。 */
  reconcile(now: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// 内存实现（仅测试/隔离验证；生产绝不静默使用）
// ---------------------------------------------------------------------------

export class MemoryBudgetStore implements SharedBudgetStore {
  readonly configured = true;
  private readonly daily = new Map<string, number>();
  private slots = 0;
  private readonly leases = new Map<string, number>(); // leaseId -> until

  async ensureReady(): Promise<boolean> {
    return true;
  }

  async acquireDaily(dayKey: string, limit: number, _now: number): Promise<BudgetAcquireResult> {
    const cur = this.daily.get(dayKey) ?? 0;
    if (cur >= limit) {
      return { ok: false, storeError: false };
    }
    this.daily.set(dayKey, cur + 1);
    return { ok: true, storeError: false };
  }

  async acquireConcurrency(leaseId: string, limit: number, now: number): Promise<BudgetAcquireResult> {
    await this.reconcile(now);
    if (this.slots >= limit) {
      return { ok: false, storeError: false };
    }
    this.slots += 1;
    this.leases.set(leaseId, now + 90_000);
    return { ok: true, storeError: false };
  }

  async releaseConcurrency(leaseId: string): Promise<void> {
    this.leases.delete(leaseId);
    if (this.slots > 0) {
      this.slots -= 1;
    }
  }

  async releaseDaily(dayKey: string): Promise<void> {
    const cur = this.daily.get(dayKey) ?? 0;
    if (cur > 0) {
      this.daily.set(dayKey, cur - 1);
    }
  }

  async reconcile(now: number): Promise<void> {
    for (const [id, until] of this.leases) {
      if (until < now) {
        this.leases.delete(id);
        if (this.slots > 0) {
          this.slots -= 1;
        }
      }
    }
  }

  /** 测试辅助。 */
  snapshot(): { daily: Map<string, number>; slots: number; leases: number } {
    return { daily: new Map(this.daily), slots: this.slots, leases: this.leases.size };
  }
}

// ---------------------------------------------------------------------------
// CloudBase 文档型数据库实现
// ---------------------------------------------------------------------------

export const DEFAULT_SHARED_BUDGET_COLLECTION = "laoyouju_shared_budget";

/** 解析共享预算配置（CLOUDBASE_APIKEY 缺省则 configured=false；Key 值绝不输出）。 */
export function resolveSharedBudgetConfig(
  env: NodeJS.ProcessEnv = process.env,
): SharedBudgetConfig & { configured: boolean } {
  const key = (env.CLOUDBASE_APIKEY ?? "").trim();
  return {
    envId: (env.TCB_ENV ?? "").trim() || "laoyouju-demo-d0g2c7d8sb319ddf3",
    accessKey: key,
    collection: DEFAULT_SHARED_BUDGET_COLLECTION,
    leaseMs: 90_000,
    configured: key !== "",
  };
}

type Db = {
  collection(name: string): {
    doc(id: string): { get(): Promise<{ data: unknown[] }>; update(d: unknown): Promise<unknown>; remove(): Promise<unknown> };
    where(q: unknown): {
      get(): Promise<{ data: Array<Record<string, unknown>> }>;
      update(d: unknown): Promise<{ stats?: { updated?: number }; updated?: number }>;
      remove(): Promise<unknown>;
      limit(n: number): { get(): Promise<{ data: Array<Record<string, unknown>> }> };
    };
    add(d: Record<string, unknown>): Promise<{ id: string }>;
  };
  createCollection(name: string): Promise<unknown>;
  command: {
    inc(n: number): unknown;
    lt(v: unknown): unknown;
    gte(v: unknown): unknown;
    gt(v: unknown): unknown;
  };
};

type CloudbaseApp = { database(): Db };

let tcbModule: { init(cfg: unknown): CloudbaseApp } | undefined;

/** 临时凭据（仅用于运维/隔离测试：TCB_TMP_SECRET_ID/KEY/TOKEN；绝不打日志）。 */
export interface TempCredentials {
  secretId: string;
  secretKey: string;
  token: string;
}

export function tempCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): TempCredentials | undefined {
  const secretId = (env.TCB_TMP_SECRET_ID ?? "").trim();
  const secretKey = (env.TCB_TMP_SECRET_KEY ?? "").trim();
  const token = (env.TCB_TMP_SECRET_TOKEN ?? "").trim();
  if (secretId === "" || secretKey === "" || token === "") {
    return undefined;
  }
  return { secretId, secretKey, token };
}

/** 惰性加载 @cloudbase/node-sdk（生产用 CLOUDBASE_APIKEY；运维/测试可用临时凭据走 context 通道）。 */
async function cloudbaseApp(config: SharedBudgetConfig): Promise<CloudbaseApp | undefined> {
  if (!config.envId) {
    return undefined;
  }
  if (tcbModule === undefined) {
    const m = (await import("@cloudbase/node-sdk")) as unknown as { default?: { init(cfg: unknown): CloudbaseApp }; init(cfg: unknown): CloudbaseApp };
    tcbModule = ((m.default ?? m) as { init(cfg: unknown): CloudbaseApp });
  }
  if (config.accessKey !== "") {
    return tcbModule.init({ env: config.envId, accessKey: config.accessKey });
  }
  const tmp = tempCredentialsFromEnv();
  if (tmp !== undefined) {
    // 临时凭据走函数上下文通道（与云函数 extendedContext.tmpSecret 同构）。
    return tcbModule.init({
      env: config.envId,
      context: { extendedContext: { tmpSecret: { secretId: tmp.secretId, secretKey: tmp.secretKey, token: tmp.token } } },
    } as never);
  }
  return undefined;
}

export class CloudbaseBudgetStore implements SharedBudgetStore {
  readonly configured: boolean;
  private readonly config: SharedBudgetConfig;
  private app: CloudbaseApp | undefined;
  private db: Db | undefined;
  private readyPromise: Promise<boolean> | undefined;
  /** 每个 leaseId 对应的本地租约到期时间（进程崩溃即丢失——由云端租约到期回收兜底）。 */
  private readonly localLeaseUntil = new Map<string, number>();

  constructor(config: SharedBudgetConfig) {
    this.config = config;
    this.configured = config.accessKey !== "" || tempCredentialsFromEnv() !== undefined;
  }

  async ensureReady(): Promise<boolean> {
    if (!this.configured) {
      return false;
    }
    if (this.readyPromise === undefined) {
      this.readyPromise = (async () => {
        try {
          this.app = await cloudbaseApp(this.config);
          if (this.app === undefined) {
            return false;
          }
          this.db = this.app.database();
          // 幂等创建集合（已存在则忽略）。
          try {
            await this.db.createCollection(this.config.collection);
          } catch (err) {
            // 已存在 / 集合名已占用 视为成功；其他错误向上抛。
            if (!isAlreadyExists(err)) {
              throw err;
            }
          }
          // 连通性检查：空查询必须成功。
          await this.db.collection(this.config.collection).where({ _id: "__ping__" }).limit(1).get();
          return true;
        } catch {
          this.readyPromise = undefined;
          return false;
        }
      })();
    }
    return this.readyPromise;
  }

  async acquireDaily(dayKey: string, limit: number, now: number): Promise<BudgetAcquireResult> {
    try {
      const ready = await this.ensureReady();
      if (!ready || this.db === undefined) {
        return { ok: false, storeError: true };
      }
      const col = this.db.collection(this.config.collection);
      if (Math.random() < 0.05) {
        void this.sweepOldDays(now).catch(() => undefined);
      }
      // 1) 原子条件自增（已存在文档）。
      const r = await col.where({ _id: "day:" + dayKey, calls: this.db.command.lt(limit) }).update({
        calls: this.db.command.inc(1),
      });
      if ((r.stats?.updated ?? r.updated ?? 0) > 0) {
        return { ok: true, storeError: false };
      }
      // 2) 文档不存在（当天首次）→ 插入；唯一 _id 冲突则再走条件自增。
      try {
        await col.add({ _id: "day:" + dayKey, kind: "day", day: dayKey, calls: 1, createdAt: now });
        return { ok: true, storeError: false };
      } catch (err) {
        if (!isDuplicateKey(err)) {
          return { ok: false, storeError: true };
        }
        const r2 = await col.where({ _id: "day:" + dayKey, calls: this.db.command.lt(limit) }).update({
          calls: this.db.command.inc(1),
        });
        if ((r2.stats?.updated ?? r2.updated ?? 0) > 0) {
          return { ok: true, storeError: false };
        }
        return { ok: false, storeError: false }; // 额度耗尽
      }
    } catch {
      return { ok: false, storeError: true };
    }
  }

  async acquireConcurrency(leaseId: string, limit: number, now: number): Promise<BudgetAcquireResult> {
    try {
      const ready = await this.ensureReady();
      if (!ready || this.db === undefined) {
        return { ok: false, storeError: true };
      }
      await this.reconcile(now);
      const col = this.db.collection(this.config.collection);
      let r = await col.where({ _id: "conc", slots: this.db.command.lt(limit) }).update({
        slots: this.db.command.inc(1),
      });
      if ((r.stats?.updated ?? r.updated ?? 0) === 0) {
        // 并发文档尚不存在（首次）→ 创建；已存在则重试一次条件自增。
        try {
          await col.add({ _id: "conc", kind: "conc", slots: 1, createdAt: now });
        } catch (err) {
          if (!isDuplicateKey(err)) {
            return { ok: false, storeError: true };
          }
          r = await col.where({ _id: "conc", slots: this.db.command.lt(limit) }).update({
            slots: this.db.command.inc(1),
          });
          if ((r.stats?.updated ?? r.updated ?? 0) === 0) {
            return { ok: false, storeError: false };
          }
        }
      }
      // 槽位已取到 → 写入唯一租约；失败则回退槽位并标记存储错误。
      try {
        await col.add({ _id: "lease:" + leaseId, kind: "lease", leaseId, until: now + this.config.leaseMs, createdAt: now });
        this.localLeaseUntil.set(leaseId, now + this.config.leaseMs);
        return { ok: true, storeError: false };
      } catch (err) {
        if (!isDuplicateKey(err)) {
          await this.refundOne();
        }
        return { ok: false, storeError: true };
      }
    } catch {
      return { ok: false, storeError: true };
    }
  }

  async releaseConcurrency(leaseId: string): Promise<void> {
    this.localLeaseUntil.delete(leaseId);
    try {
      const ready = await this.ensureReady();
      if (!ready || !this.db) {
        return;
      }
      await this.db.collection(this.config.collection).doc("lease:" + leaseId).remove();
      await this.refundOne();
    } catch {
      // 释放失败将靠租约到期回收兜底（不抛异常、不阻断主流程）。
    }
  }

  async releaseDaily(dayKey: string): Promise<void> {
    try {
      const ready = await this.ensureReady();
      if (!ready || !this.db) {
        return;
      }
      await this.db.collection(this.config.collection).where({ _id: "day:" + dayKey, calls: this.db.command.gt(0) }).update({
        calls: this.db.command.inc(-1),
      });
    } catch {
      // 回退失败无碍（额度按更保守方向结算）。
    }
  }

  async reconcile(now: number): Promise<void> {
    try {
      if (!this.db) {
        return;
      }
      const col = this.db.collection(this.config.collection);
      const stale = await col.where({ kind: "lease", until: this.db.command.lt(now) }).limit(50).get();
      if (stale.data.length === 0) {
        return;
      }
      let recovered = 0;
      for (const d of stale.data) {
        const id = String(d._id ?? "");
        if (id === "") {
          continue;
        }
        // remove 唯一 _id：并发回收时只有一方成功。
        try {
          await col.doc(id).remove();
          recovered += 1;
        } catch {
          // 已被他人回收
        }
      }
      if (recovered > 0) {
        await col.where({ _id: "conc", slots: this.db.command.gte(recovered) }).update({
          slots: this.db.command.inc(-recovered),
        });
      }
    } catch {
      // 回收失败不影响取号（槽位永续由条件上限兜底；最多浪费一个失败租约直到下轮回收）。
    }
  }

  private async refundOne(): Promise<void> {
    try {
      if (!this.db) {
        return;
      }
      await this.db.collection(this.config.collection).where({ _id: "conc", slots: this.db.command.gt(0) }).update({
        slots: this.db.command.inc(-1),
      });
    } catch {
      // 兜底：租约到期回收
    }
  }

  private async sweepOldDays(now: number): Promise<void> {
    try {
      if (!this.db) {
        return;
      }
      const threeDaysAgo = beijingKey(now - 3 * 86_400_000);
      await this.db.collection(this.config.collection).where({ kind: "day", day: this.db.command.lt(threeDaysAgo) }).remove();
    } catch {
      // 清扫失败无碍
    }
  }

  /** 仅用于独立测试集合：清空全部文档（生产集合不得调用）。 */
  async wipeForTest(): Promise<void> {
    const ready = await this.ensureReady();
    if (!ready || !this.db) {
      return;
    }
    const col = this.db.collection(this.config.collection);
    await col.where({ kind: "day" }).remove().catch(() => undefined);
    await col.where({ kind: "lease" }).remove().catch(() => undefined);
    await col.doc("conc").remove().catch(() => undefined);
  }

  /** 测试辅助：统计当前集合文档。 */
  async stats(): Promise<{ days: number; leases: number; slots: number }> {
    const ready = await this.ensureReady();
    if (!ready || !this.db) {
      return { days: -1, leases: -1, slots: -1 };
    }
    try {
      const days = await this.db.collection(this.config.collection).where({ kind: "day" }).limit(1000).get();
      const leases = await this.db.collection(this.config.collection).where({ kind: "lease" }).limit(1000).get();
      const conc = await this.db.collection(this.config.collection).doc("conc").get();
      const slots = Number((conc.data[0] as Record<string, unknown> | undefined)?.slots ?? 0);
      return { days: days.data.length, leases: leases.data.length, slots };
    } catch {
      return { days: -1, leases: -1, slots: -1 };
    }
  }
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 北京时间日期键（YYYY-MM-DD）。 */
export function beijingKey(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 新租约 ID（唯一标识 + 不可预测；仅存云端 _id，不承载敏感信息）。 */
export function newLeaseId(): string {
  return randomUUID();
}

export function isAlreadyExists(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err);
  return /already exist|exists|DUPLICATE|duplicate/i.test(s) || String((err as { code?: string })?.code ?? "").toLowerCase().includes("exist");
}

export function isDuplicateKey(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err);
  const code = String((err as { code?: string })?.code ?? "");
  return /duplicate|DUPLICATE/.test(s) || /already exist|already exists|exist/i.test(s) || code.includes("11000") || code.includes("DUPLICATE");
}

/** 仅测试用：把租约 ID 变成稳定哈希（便于断言长度/格式）。 */
export function leaseHash(leaseId: string): string {
  return createHash("sha256").update(leaseId).digest("hex").slice(0, 16);
}
