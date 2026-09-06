/**
 * Phase 9：BudgetStore 选择器（唯一选择入口，服务端配置驱动）。
 *
 * 环境变量 BUDGET_STORE 显式选择：
 * - sqlite    → SqliteBudgetStore（普通 Linux/VPS 单机；需要绝对路径 BUDGET_SQLITE_PATH）；
 * - cloudbase → CloudbaseBudgetStore（旧 CloudBase 环境回退；由 CLOUDBASE_APIKEY 判定 configured）；
 * - 缺失/其他值（含 memory）→ 返回 undefined（安全失败：RequestGuard 将拒绝一切真实模型调用，
 *   绝不静默降级到内存预算）。
 */
import { isAbsolute } from "node:path";
import {
  CloudbaseBudgetStore,
  resolveSharedBudgetConfig,
  type SharedBudgetStore,
} from "./shared-budget.js";
import { SqliteBudgetStore } from "./sqlite-budget.js";

/** 并发租约时长（与 CloudBase 版一致的默认值）。 */
export const DEFAULT_BUDGET_LEASE_MS = 90_000;

export const BUDGET_STORE_ENV = "BUDGET_STORE";
export const BUDGET_SQLITE_PATH_ENV = "BUDGET_SQLITE_PATH";

let warnedInvalid = false;

function warnOnce(message: string): void {
  if (warnedInvalid) {
    return;
  }
  warnedInvalid = true;
  console.error("[laoyouju-api] " + message);
}

/**
 * 解析并构造 BudgetStore。
 * - BUDGET_STORE=sqlite：BUDGET_SQLITE_PATH 必须是非空绝对路径（否则返回 undefined → 安全失败）；
 * - BUDGET_STORE=cloudbase：使用 CloudbaseBudgetStore（未配置 CLOUDBASE_APIKEY 时 configured=false → 安全失败）；
 * - 其他/缺失：返回 undefined（安全失败）。
 */
export function resolveBudgetStore(env: NodeJS.ProcessEnv = process.env): SharedBudgetStore | undefined {
  const kind = (env.BUDGET_STORE ?? "").trim().toLowerCase();
  if (kind === "sqlite") {
    const filePath = (env.BUDGET_SQLITE_PATH ?? "").trim();
    if (filePath === "" || !isAbsolute(filePath)) {
      warnOnce(
        "BUDGET_STORE=sqlite 但 BUDGET_SQLITE_PATH 缺失或不是绝对路径：真实模型调用已安全关闭（STORE_ERROR）。",
      );
      return undefined;
    }
    return new SqliteBudgetStore({ filePath, leaseMs: DEFAULT_BUDGET_LEASE_MS });
  }
  if (kind === "cloudbase") {
    const config = resolveSharedBudgetConfig(env);
    if (!config.configured) {
      warnOnce("BUDGET_STORE=cloudbase 但 CLOUDBASE_APIKEY 未配置：真实模型调用将安全关闭（STORE_ERROR）。");
    }
    return new CloudbaseBudgetStore(config);
  }
  warnOnce(
    "BUDGET_STORE 未配置或值无效：真实模型调用已安全关闭（STORE_ERROR）。生产环境必须显式配置 BUDGET_STORE=sqlite 或 BUDGET_STORE=cloudbase。",
  );
  return undefined;
}
