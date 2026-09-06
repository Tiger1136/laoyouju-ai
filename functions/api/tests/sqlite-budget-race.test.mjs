// 多进程/多线程竞争测试（Phase 9）：4 个 worker（独立连接）共享同一 SQLite 文件，并发取号/日额度不超发。
import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqliteBudgetStore } from "../dist/sqlite-budget.js";

const WORKER = fileURLToPath(new URL("./sqlite-budget-worker.mjs", import.meta.url));

function runWorker(filePath, kind, limit, count, tag) {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER, { workerData: { filePath, kind, limit, count, tag } });
    w.once("message", resolve);
    w.once("error", reject);
  });
}

test("多线程竞争（4 worker 独立连接）：并发槽位 limit=2 恰 2 次成功；日额度 limit=3 恰 3 次成功", async () => {
  const dir = mkdtempSync(join(tmpdir(), "laoyouju-race-"));
  const file = join(dir, "race.sqlite3");
  try {
    // 并发：4 个 worker × 4 次 = 16 次尝试（全部保持租约），limit=2
    const results = await Promise.all([
      runWorker(file, "concurrency", 2, 4, "w1"),
      runWorker(file, "concurrency", 2, 4, "w2"),
      runWorker(file, "concurrency", 2, 4, "w3"),
      runWorker(file, "concurrency", 2, 4, "w4"),
    ]);
    const totalOk = results.reduce((a, r) => a + r.ok, 0);
    assert.equal(totalOk, 2, "多线程并发取号不得超过 limit（2）");
    assert.equal(results.reduce((a, r) => a + r.storeError, 0), 0, "竞争期间不应有存储错误");
    // 清理：重新打开并清空
    let cleaner = new SqliteBudgetStore({ filePath: file, leaseMs: 90_000 });
    await cleaner.ensureReady();
    await cleaner.wipeForTest();
    await cleaner.close();
    // 日额度：4 个 worker × 4 次 = 16 次尝试，limit=3
    const daily = await Promise.all([
      runWorker(file, "daily", 3, 4, "d1"),
      runWorker(file, "daily", 3, 4, "d2"),
      runWorker(file, "daily", 3, 4, "d3"),
      runWorker(file, "daily", 3, 4, "d4"),
    ]);
    const dailyOk = daily.reduce((a, r) => a + r.ok, 0);
    assert.equal(dailyOk, 3, "多线程日额度不得超过 limit（3）");
    assert.equal(daily.reduce((a, r) => a + r.storeError, 0), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
