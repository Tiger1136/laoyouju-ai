// 多进程/多线程共享同一 SQLite 文件的竞争测试 worker（Phase 9）。
// 每个 worker 拥有独立连接；并发测试中 worker 成功取号后保持租约（不释放），
// 以此制造真实并发占用，验证多个实例/进程共享文件时槽位与日额度绝不超发。
import { parentPort, workerData } from "node:worker_threads";
import { SqliteBudgetStore } from "../dist/sqlite-budget.js";

const { filePath, kind, limit, count, tag } = workerData;
const store = new SqliteBudgetStore({ filePath, leaseMs: 90_000 });
let ok = 0;
let storeError = 0;
try {
  await store.ensureReady();
  for (let i = 0; i < count; i++) {
    const id = tag + "-" + i;
    if (kind === "concurrency") {
      const r = await store.acquireConcurrency(id, limit, Date.now());
      if (r.ok) ok += 1; // 保持租约：由测试主进程统一清理
      if (r.storeError) storeError += 1;
    } else {
      const r = await store.acquireDaily("worker-day", limit, Date.now());
      if (r.ok) ok += 1;
      if (r.storeError) storeError += 1;
    }
  }
} finally {
  await store.close();
}
parentPort.postMessage({ ok, storeError });
