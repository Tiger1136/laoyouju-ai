/**
 * Phase 9：SQLite 本地持久化 BudgetStore（普通 Linux 单机部署用）。
 *
 * 设计要点：
 * - 持久化：数据写入独立 SQLite 文件（WAL 日志模式 + synchronous=FULL），
 *   重启后每日用量、并发槽位与租约仍在；文件位置由 BUDGET_SQLITE_PATH 显式给定
 *   （绝对路径、独立持久化数据目录，不得放在发布目录/前端产物内）。
 * - 原子性：全部更新为单条条件 UPDATE（WHERE 上限判断）或在事务内完成
 *   （better-sqlite3 事务 + SQLite 写锁 → 跨进程/多实例不超发）。
 * - 并发租约：唯一 lease_id + 到期时间；每次取号前先回收过期租约
 *   （进程崩溃后由到期回收兜底恢复槽位）。
 * - 释放幂等：仅当“本调用真正删除租约行”时才回退槽位；重复释放/已过期租约
 *   不会重复扣减。
 * - 日期边界：沿用项目语义（北京时间 YYYY-MM-DD 键），见 shared-budget.ts 的 beijingKey。
 * - 失败关闭（安全红线）：打开失败/文件损坏/写入异常 → storeError=true；
 *   绝不静默回退内存预算；未配置或非法选择时由 RequestGuard 拒绝模型调用。
 *
 * CloudBase 部署（旧环境回退）仍使用 CloudbaseBudgetStore（shared-budget.ts），
 * 选择逻辑见 budget.ts（BUDGET_STORE 环境变量）。
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type Database from "better-sqlite3";
import { beijingKey, type BudgetAcquireResult, type SharedBudgetStore } from "./shared-budget.js";

export interface SqliteBudgetConfig {
  /** 数据库文件绝对路径（持久化数据目录内，绝对路径由 budget.ts 校验）。 */
  filePath: string;
  /** 并发租约时长（毫秒；异常退出后到期即回收）。 */
  leaseMs: number;
}

type Db = Database.Database;

type SqliteModule = typeof Database;

let sqliteModule: SqliteModule | undefined;

/** 惰性加载 better-sqlite3（esbuild 打包时 external；仅在 BUDGET_STORE=sqlite 时才真正加载）。 */
async function loadSqliteModule(): Promise<SqliteModule | undefined> {
  if (sqliteModule !== undefined) {
    return sqliteModule;
  }
  try {
    const m = (await import("better-sqlite3")) as unknown;
    const maybe = m as { default?: SqliteModule };
    sqliteModule = maybe.default ?? (m as SqliteModule);
    return sqliteModule;
  } catch {
    return undefined;
  }
}

/**
 * quick_check 结果判定（Phase 9A）：必须逐行确认结果均为 "ok"，否则视为完整性失败。
 * better-sqlite3 的 pragma() 返回行数组（对象形式 { quick_check: "ok" } / 旧版本字符串数组）。
 */
export function isQuickCheckOk(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }
  return rows.every((r) => {
    if (typeof r === "string") {
      return r.trim() === "ok";
    }
    if (r !== null && typeof r === "object") {
      const v = Object.values(r as Record<string, unknown>)[0];
      return v === "ok";
    }
    return false;
  });
}

export class SqliteBudgetStore implements SharedBudgetStore {
  readonly configured: boolean;
  private readonly config: SqliteBudgetConfig;
  private db: Db | undefined;
  private readyPromise: Promise<boolean> | undefined;

  constructor(config: SqliteBudgetConfig) {
    this.config = config;
    this.configured = config.filePath.trim() !== "";
  }

  /**
   * 幂等就绪：打开数据库 + 安全性 PRAGMA + 建表；任何失败返回 false
   * （后续所有申请都返回 storeError，模型调用安全关闭）。
   */
  async ensureReady(): Promise<boolean> {
    if (!this.configured) {
      return false;
    }
    if (this.readyPromise === undefined) {
      this.readyPromise = (async () => {
        try {
          const Sqlite = await loadSqliteModule();
          if (Sqlite === undefined) {
            return false;
          }
          mkdirSync(dirname(this.config.filePath), { recursive: true });
          const db = new Sqlite(this.config.filePath, { timeout: 5_000 });
          try {
            // 日志模式与持久化设置（见类注释）；busy_timeout 让跨进程写竞争等待而非立刻失败。
            db.pragma("journal_mode = WAL");
            db.pragma("synchronous = FULL");
            db.pragma("busy_timeout = 5000");
            db.pragma("foreign_keys = ON");
            // 完整性检查：必须确认 quick_check 返回结果确为 ok（损坏文件在此失败关闭）。
            if (!isQuickCheckOk(db.pragma("quick_check"))) {
              throw new Error("SQLite quick_check 未通过");
            }
            db.exec(`
              CREATE TABLE IF NOT EXISTS daily_usage (
                day_key TEXT PRIMARY KEY,
                calls   INTEGER NOT NULL DEFAULT 0
              );
              CREATE TABLE IF NOT EXISTS leases (
                lease_id      TEXT PRIMARY KEY,
                until_ms      INTEGER NOT NULL,
                created_at_ms INTEGER NOT NULL
              );
              CREATE TABLE IF NOT EXISTS counters (
                key   TEXT PRIMARY KEY,
                value INTEGER NOT NULL DEFAULT 0
              ) WITHOUT ROWID;
              INSERT OR IGNORE INTO counters (key, value) VALUES ('slots', 0);
            `);
            this.setUpStatements(db);
          } catch (err) {
            // 初始化中途失败：关闭连接，避免遗留无主数据库句柄（WAL 文件也随关闭落盘）。
            try {
              db.close();
            } catch {
              // ignore
            }
            throw err;
          }
          this.db = db;
          return true;
        } catch {
          this.readyPromise = undefined;
          return false;
        }
      })();
    }
    return this.readyPromise;
  }

  /** 每日全局额度：原子条件自增（calls < limit 才 +1），行不存在则先占位（0 值）再自增。 */
  async acquireDaily(dayKey: string, limit: number, now: number): Promise<BudgetAcquireResult> {
    try {
      if (!(await this.ensureReady()) || this.db === undefined) {
        return { ok: false, storeError: true };
      }
      if (Math.random() < 0.05) {
        void this.sweepOldDays(now).catch(() => undefined);
      }
      return this.acquireDailyTx(dayKey, limit);
    } catch {
      return { ok: false, storeError: true };
    }
  }

  /** 并发槽位：事务内（先回收过期租约 → 条件取号 → 写唯一租约）；失败整体回滚。 */
  async acquireConcurrency(leaseId: string, limit: number, now: number): Promise<BudgetAcquireResult> {
    try {
      if (!(await this.ensureReady()) || this.db === undefined) {
        return { ok: false, storeError: true };
      }
      return this.acquireConcurrencyTx(leaseId, limit, now);
    } catch {
      return { ok: false, storeError: true };
    }
  }

  /** 释放槽位（幂等：仅删除成功的租约才回退槽位）。 */
  async releaseConcurrency(leaseId: string): Promise<void> {
    try {
      if (!(await this.ensureReady()) || this.db === undefined) {
        return;
      }
      this.releaseConcurrencyTx(leaseId);
    } catch {
      // 释放失败由租约到期回收兜底；不阻断主流程。
    }
  }

  /**
   * 回退一次日额度（calls > 0 才减）。
   * 语义边界（如实记录，不做过度重构）：本实现是“有下限保护的递减”，不追踪“哪个申请占用哪次额度”；
   * 调用路径（RequestGuard.tryModelSlot）保证只在 acquireDaily 成功且随后并发取号失败/存储异常时恰好补偿一次，
   * 因此实际行为是在该调用契约下幂等；若未来出现重复调用，最多把计数减到 0（偏向保守、绝不超发）。
   */
  async releaseDaily(dayKey: string): Promise<void> {
    try {
      if (!(await this.ensureReady()) || this.db === undefined) {
        return;
      }
      this.releaseDailyStmt(dayKey);
    } catch {
      // 回退失败无碍（额度按更保守方向结算）。
    }
  }

  /** 回收过期租约（取号前调用；也用于跨日/故障清扫）。 */
  async reconcile(now: number): Promise<void> {
    try {
      if (!(await this.ensureReady()) || this.db === undefined) {
        return;
      }
      this.reconcileTx(now);
    } catch {
      // 回收失败不影响取号（槽位上限由条件更新兜底；最多浪费一个到期租约直到下轮回收）。
    }
  }

  /** 关闭数据库连接（测试/进程退出用）。 */
  async close(): Promise<void> {
    try {
      this.db?.close();
    } catch {
      // ignore
    }
    this.db = undefined;
    this.readyPromise = undefined;
  }

  /** 仅测试用：清空全部业务数据（生产不得调用）。 */
  async wipeForTest(): Promise<void> {
    const ready = await this.ensureReady();
    if (!ready || this.db === undefined) {
      return;
    }
    this.wipeTx();
  }

  /** 测试辅助：统计当前状态。 */
  async stats(): Promise<{ days: number; leases: number; slots: number }> {
    const ready = await this.ensureReady();
    if (!ready || this.db === undefined) {
      return { days: -1, leases: -1, slots: -1 };
    }
    try {
      const days = this.stmtCountDaily.get() as { c: number };
      const leases = this.stmtCountLeases.get() as { c: number };
      const slots = this.stmtGetSlots.get() as { value: number } | undefined;
      return { days: Number(days?.c ?? 0), leases: Number(leases?.c ?? 0), slots: Number(slots?.value ?? 0) };
    } catch {
      return { days: -1, leases: -1, slots: -1 };
    }
  }

  // -------------------------------------------------------------------------
  // 事务与语句（ensureReady 后创建；事务在异常时自动回滚）
  // -------------------------------------------------------------------------

  /** 以下语句/事务字段仅在 ensureReady() 成功（返回 true）后可用；调用前必须 await ensureReady() 且检查结果。 */
  private acquireDailyTx!: (dayKey: string, limit: number) => BudgetAcquireResult;
  private acquireConcurrencyTx!: (leaseId: string, limit: number, now: number) => BudgetAcquireResult;
  private releaseConcurrencyTx!: (leaseId: string) => void;
  private reconcileTx!: (now: number) => void;
  private wipeTx!: () => void;
  private releaseDailyStmt!: (dayKey: string) => unknown;
  private stmtCountDaily!: { get(): unknown };
  private stmtCountLeases!: { get(): unknown };
  private stmtGetSlots!: { get(): unknown };

  private setUpStatements(db: Db): void {
    const dailyInsert = db.prepare("INSERT INTO daily_usage (day_key, calls) VALUES (?, 0) ON CONFLICT(day_key) DO NOTHING");
    const dailyInc = db.prepare("UPDATE daily_usage SET calls = calls + 1 WHERE day_key = ? AND calls < ?");
    const dailyDec = db.prepare("UPDATE daily_usage SET calls = calls - 1 WHERE day_key = ? AND calls > 0");
    const slotInc = db.prepare("UPDATE counters SET value = value + 1 WHERE key = 'slots' AND value < ?");
    const slotDec = db.prepare("UPDATE counters SET value = value - 1 WHERE key = 'slots' AND value > 0");
    const slotRecover = db.prepare(
      "UPDATE counters SET value = CASE WHEN value >= ? THEN value - ? ELSE 0 END WHERE key = 'slots'",
    );
    const leaseInsert = db.prepare("INSERT INTO leases (lease_id, until_ms, created_at_ms) VALUES (?, ?, ?)");
    const leaseDelete = db.prepare("DELETE FROM leases WHERE lease_id = ?");
    const leaseDeleteStale = db.prepare("DELETE FROM leases WHERE until_ms < ?");
    const wipeDaily = db.prepare("DELETE FROM daily_usage");
    const wipeLeases = db.prepare("DELETE FROM leases");
    const setSlots = db.prepare("UPDATE counters SET value = 0 WHERE key = 'slots'");

    this.acquireDailyTx = db.transaction((dayKey: string, limit: number): BudgetAcquireResult => {
      dailyInsert.run(dayKey);
      const r = dailyInc.run(dayKey, limit);
      return r.changes === 1 ? { ok: true, storeError: false } : { ok: false, storeError: false };
    });

    this.acquireConcurrencyTx = db.transaction((leaseId: string, limit: number, now: number): BudgetAcquireResult => {
      // 1) 回收过期租约（在同一事务内：先释放再取号，防止槽位被过期租约长期占用）。
      const stale = leaseDeleteStale.run(now);
      if (stale.changes > 0) {
        slotRecover.run(stale.changes, stale.changes);
      }
      // 2) 条件取号。
      const r = slotInc.run(limit);
      if (r.changes === 0) {
        return { ok: false, storeError: false };
      }
      // 3) 写入唯一租约；失败（含租约 ID 重复）→ 抛错回滚已取槽位。
      leaseInsert.run(leaseId, now + this.config.leaseMs, now);
      return { ok: true, storeError: false };
    });

    this.releaseConcurrencyTx = db.transaction((leaseId: string): void => {
      const r = leaseDelete.run(leaseId);
      if (r.changes > 0) {
        slotDec.run();
      }
    });

    this.reconcileTx = db.transaction((now: number): void => {
      const stale = leaseDeleteStale.run(now);
      if (stale.changes > 0) {
        slotRecover.run(stale.changes, stale.changes);
      }
    });

    this.wipeTx = db.transaction((): void => {
      wipeDaily.run();
      wipeLeases.run();
      setSlots.run();
    });

    this.releaseDailyStmt = (dayKey: string): unknown => dailyDec.run(dayKey);
    this.stmtCountDaily = db.prepare("SELECT COUNT(*) AS c FROM daily_usage");
    this.stmtCountLeases = db.prepare("SELECT COUNT(*) AS c FROM leases");
    this.stmtGetSlots = db.prepare("SELECT value FROM counters WHERE key = 'slots'");
  }

  private async sweepOldDays(now: number): Promise<void> {
    try {
      if (!(await this.ensureReady()) || this.db === undefined) {
        return;
      }
      const threeDaysAgo = beijingKey(now - 3 * 86_400_000);
      this.db.prepare("DELETE FROM daily_usage WHERE day_key < ?").run(threeDaysAgo);
    } catch {
      // 清扫失败无碍
    }
  }
}
