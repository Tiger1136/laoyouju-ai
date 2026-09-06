// Phase 9B：以服务用户执行 BudgetStore（SQLite）实机就绪检查；不调用模型、不做任何网络请求。
// 用法（服务器，以 laoyouju 服务用户执行）：
//   BUDGET_SQLITE_PATH=/var/lib/laoyouju/budget/budget.sqlite3 node deploy/vps/scripts/check-budget-store.mjs
// 成功输出 READY 并退出 0；失败输出 NOT_READY 并退出 1（不写真实模型调用记录）。
import { SqliteBudgetStore } from "../../../functions/api/dist/sqlite-budget.js";

const path = (process.env.BUDGET_SQLITE_PATH ?? "/var/lib/laoyouju/budget/budget.sqlite3").trim();
const store = new SqliteBudgetStore({ filePath: path, leaseMs: 90_000 });
try {
  const ready = await store.ensureReady();
  if (!ready) { console.error("NOT_READY path=" + path); process.exit(1); }
  const stats = await store.stats();
  console.log("READY days=" + stats.days + " leases=" + stats.leases + " slots=" + stats.slots);
} finally {
  await store.close();
}