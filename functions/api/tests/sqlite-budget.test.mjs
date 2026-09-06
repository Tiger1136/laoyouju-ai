// Phase 9：SQLite 本地持久化 BudgetStore 测试（全部本地，不调用 DeepSeek；不访问 CloudBase）。
// 运行：node tests/sqlite-budget.test.mjs（依赖 dist 先构建）
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { SqliteBudgetStore, isQuickCheckOk } from "../dist/sqlite-budget.js";
import { resolveBudgetStore } from "../dist/budget.js";
import { CloudbaseBudgetStore } from "../dist/shared-budget.js";
import { RequestGuard, limitMessage } from "../dist/limit.js";
import { runAsk, loadAskResources } from "../dist/ask.js";

const tmpRoots = [];
function tmpDir() {
  const d = mkdtempSync(join(tmpdir(), "laoyouju-budget-"));
  tmpRoots.push(d);
  return d;
}
after(() => {
  for (const d of tmpRoots) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function newStore(filePath, leaseMs = 90_000) {
  return new SqliteBudgetStore({ filePath, leaseMs });
}

function mockFetchCounter() {
  let calls = 0;
  return {
    calls: () => calls,
    fetch: async () => {
      calls += 1;
      const content = JSON.stringify({
        answer: {
          issueIdentification: "（测试）问题识别。",
          preliminaryConclusion: "（测试）初步结论。",
          applicableLaw: ["（测试）A级依据。"],
          similarCases: ["暂未找到可核验的高度相似官方案例。"],
          nextSteps: ["（测试）行动。"],
          evidenceChecklist: ["（测试）证据。"],
          factsToConfirm: ["（测试）事实。"],
          boundaries: ["（测试）不是律师意见；请核验官方来源。"],
        },
      });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
}

const { index, sourceMeta } = loadAskResources();
const FACT_COMPLETE = "公司书面通知违法解除我，工作3年，解除前月工资8000元，未与我协商，我可以主张哪些补偿或赔偿？";
function askCtx(guard, fetchFn) {
  return {
    config: { apiKey: "test-key", baseUrl: "https://api.deepseek.com", model: "test" },
    fetchFn: fetchFn ?? mockFetchCounter().fetch,
    index,
    sourceMeta,
    now: "2026-08-27",
    timeoutMs: 5000,
    guard,
  };
}

// ---------- 1. 额度正常申请 ----------
test("1 每日额度正常申请：limit 内经条件自增成功且计数精确", async () => {
  const dir = tmpDir();
  const store = newStore(join(dir, "budget.sqlite3"));
  assert.equal(store.configured, true);
  for (let i = 0; i < 3; i++) {
    const r = await store.acquireDaily("2026-08-27", 3, 1_000 + i);
    assert.equal(r.ok, true);
    assert.equal(r.storeError, false);
  }
  const s = await store.stats();
  assert.equal(s.days, 1);
  const r4 = await store.acquireDaily("2026-08-27", 3, 1_004);
  assert.equal(r4.ok, false);
  assert.equal(r4.storeError, false, "额度耗尽不是存储错误");
  await store.close();
});

// ---------- 2. 达到每日上限后拒绝 ----------
test("2 达到每日上限后拒绝：第 limit+1 次申请 {ok:false,storeError:false}", async () => {
  const dir = tmpDir();
  const store = newStore(join(dir, "budget.sqlite3"));
  for (let i = 0; i < 5; i++) {
    const r = await store.acquireDaily("2026-08-28", 5, 1_000 + i);
    assert.equal(r.ok, true);
  }
  const over = await store.acquireDaily("2026-08-28", 5, 1_006);
  assert.equal(over.ok, false);
  assert.equal(over.storeError, false);
  // 跨日键独立（日期边界沿用 beijingKey 语义）
  const next = await store.acquireDaily("2026-08-29", 5, 1_010);
  assert.equal(next.ok, true);
  await store.close();
});

// ---------- 3. 并发上限竞争 ----------
test("3 并发上限：limit 内取号成功，超限拒绝；释放后恢复", async () => {
  const dir = tmpDir();
  const store = newStore(join(dir, "budget.sqlite3"));
  for (const id of ["a", "b", "c"]) {
    const r = await store.acquireConcurrency(id, 3, 1_000);
    assert.equal(r.ok, true);
  }
  const over = await store.acquireConcurrency("d", 3, 1_000);
  assert.equal(over.ok, false);
  assert.equal(over.storeError, false, "并发占满不是存储错误");
  await store.releaseConcurrency("a");
  const again = await store.acquireConcurrency("d", 3, 1_000);
  assert.equal(again.ok, true, "释放后应恢复槽位");
  await store.releaseConcurrency("d");
  await store.close();
});

// ---------- 4. 租约过期回收 ----------
test("4 租约过期回收：过期租约被回收后槽位恢复（进程崩溃恢复路径）", async () => {
  const dir = tmpDir();
  const store = newStore(join(dir, "budget.sqlite3"), 50);
  await store.acquireConcurrency("lease-1", 2, 1_000);
  const s1 = await store.stats();
  assert.equal(s1.leases, 1);
  assert.equal(s1.slots, 1);
  // 租约到期后：reconcile 应回收
  await store.reconcile(1_000 + 51);
  const s2 = await store.stats();
  assert.equal(s2.leases, 0);
  assert.equal(s2.slots, 0, "过期租约应回收槽位");
  const r = await store.acquireConcurrency("lease-2", 2, 2_000);
  assert.equal(r.ok, true, "回收后应能重新取号");
  await store.releaseConcurrency("lease-2");
  await store.close();
});

// ---------- 5. 重复释放 ----------
test("5 释放幂等：重复释放/释放未知租约不重复扣减槽位", async () => {
  const dir = tmpDir();
  const store = newStore(join(dir, "budget.sqlite3"));
  await store.acquireConcurrency("x", 2, 1_000);
  await store.releaseConcurrency("x");
  await store.releaseConcurrency("x");
  await store.releaseConcurrency("never-existed");
  const s = await store.stats();
  assert.equal(s.slots, 0, "双重释放不得把槽位扣成负数或重复扣减");
  // 再取号应正常（槽位计数器未被破坏）
  const r = await store.acquireConcurrency("y", 2, 1_000);
  assert.equal(r.ok, true);
  await store.releaseConcurrency("y");
  // releaseDaily 幂等
  await store.acquireDaily("2026-08-30", 10, 1_000);
  await store.releaseDaily("2026-08-30");
  await store.releaseDaily("2026-08-30");
  assert.equal((await store.stats()).days, 1);
  await store.close();
});

// ---------- 6. 重启后状态保持 ----------
test("6 重启后状态保持：关闭并重开同一文件，每日用量与租约仍在", async () => {
  const dir = tmpDir();
  const file = join(dir, "budget.sqlite3");
  const storeA = newStore(file);
  for (let i = 0; i < 3; i++) {
    const r = await storeA.acquireDaily("2026-08-31", 3, 1_000 + i);
    assert.equal(r.ok, true, "第一次会话每日额度应可正常申请");
  }
  await storeA.acquireConcurrency("persist-lease", 5, 1_000);
  await storeA.close(); // 模拟进程重启

  const storeB = newStore(file);
  const over = await storeB.acquireDaily("2026-08-31", 3, 2_000);
  assert.equal(over.ok, false, "重启后每日用量仍存在（已用 3/3）");
  const s = await storeB.stats();
  assert.equal(s.leases, 1, "重启后租约记录仍在");
  assert.equal(s.slots, 1);
  // 租约过期后由新会话回收
  await storeB.reconcile(1_000 + 91_000 + 1);
  const s2 = await storeB.stats();
  assert.equal(s2.slots, 0);
  await storeB.close();
});

// ---------- 7. 多个 Store 实例竞争时不超额 ----------
test("7 多实例竞争：两个 Store 实例（独立连接）共享同一文件不超发（日额度/并发精确）", async () => {
  const dir = tmpDir();
  const file = join(dir, "budget.sqlite3");
  const a = newStore(file);
  const b = newStore(file);
  // 并发：limit 3，8 次尝试（交替实例）→ 恰 3 次成功
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const s = i % 2 === 0 ? a : b;
    slots.push(await s.acquireConcurrency("inst-" + i, 3, 1_000));
  }
  assert.equal(slots.filter((r) => r.ok).length, 3, "多实例竞争并发槽位不得超发（3/3）");
  const st = await a.stats();
  assert.equal(st.slots, 3);
  assert.equal(st.leases, 3);
  for (let i = 0; i < 9; i++) {
    if (slots[i].ok) {
      await a.releaseConcurrency("inst-" + i);
    }
  }
  const st2 = await a.stats();
  assert.equal(st2.slots, 0);
  // 日额度：limit 4，8 次尝试（交替实例）→ 恰 4 次成功
  const daily = [];
  for (let i = 0; i < 8; i++) {
    const s = i % 2 === 0 ? a : b;
    daily.push(await s.acquireDaily("2026-09-01", 4, 2_000 + i));
  }
  assert.equal(daily.filter((r) => r.ok).length, 4, "多实例竞争每日额度不得超发（4/4）");
  await a.close();
  await b.close();
});

// ---------- 8. 数据库不可用/损坏/写入失败 → 禁止模型调用 ----------
test("8a 数据库损坏：ensureReady 失败；申请返回 storeError；真实模型调用被拒绝（0 次 fetch）", async () => {
  const dir = tmpDir();
  const file = join(dir, "corrupt.sqlite3");
  writeFileSync(file, "NOT A SQLITE DATABASE - garbage bytes for corruption test");
  const store = newStore(file);
  assert.equal(await store.ensureReady(), false);
  const r = await store.acquireDaily("2026-09-02", 3, 1_000);
  assert.equal(r.storeError, true);
  assert.equal(r.ok, false);
  const c = await store.acquireConcurrency("z", 3, 1_000);
  assert.equal(c.storeError, true);
  // RequestGuard 集成：存储不可用 → STORE_ERROR（失败关闭，绝不回退内存计数）
  const counter = mockFetchCounter();
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, sharedBudget: store });
  const slot = await g.tryModelSlot();
  assert.equal(slot.allowed, false);
  assert.equal(slot.code, "STORE_ERROR");
  const ctx = askCtx(g, counter.fetch);
  const o = await runAsk(FACT_COMPLETE, "t-corrupt", ctx);
  assert.equal(o.status, 429);
  assert.equal(o.payload.error.message, limitMessage("STORE_ERROR"));
  assert.equal(counter.calls(), 0, "数据库损坏时不得调用真实模型");
  await store.close();
});

test("8b 数据库不可用（路径是目录）：ensureReady false → 申请 storeError", async () => {
  const dir = tmpDir();
  const store = newStore(dir); // 路径直接指向目录 → 打开失败
  assert.equal(await store.ensureReady(), false);
  const r = await store.acquireDaily("2026-09-03", 3, 1_000);
  assert.equal(r.storeError, true);
  await store.close();
});

test("8c 写入失败（只读目录）→ storeError；不静默降级", async () => {
  const dir = tmpDir();
  const file = join(dir, "readonly", "budget.sqlite3");
  // 让父目录不存在且被一个同名文件占位：mkdirSync 会失败 → ensureReady false（无法建目录即不可用）
  writeFileSync(join(dir, "readonly"), "file-blocks-dir");
  const store = newStore(file);
  assert.equal(await store.ensureReady(), false);
  const r = await store.acquireDaily("2026-09-04", 3, 1_000);
  assert.equal(r.storeError, true);
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, sharedBudget: store });
  assert.equal((await g.tryModelSlot()).code, "STORE_ERROR");
  await store.close();
});

// ---------- 9. 环境变量选择错误时安全失败 ----------
test("9 环境变量选择：非法/缺失/相对路径/memory 一律安全失败；sqlite/cloudbase 合法", async () => {
  const dir = tmpDir();
  const abs = join(dir, "sel.sqlite3");
  assert.equal(resolveBudgetStore({}), undefined, "缺失 BUDGET_STORE → undefined");
  assert.equal(resolveBudgetStore({ BUDGET_STORE: "bogus" }), undefined);
  assert.equal(resolveBudgetStore({ BUDGET_STORE: "memory" }), undefined, "内存选择不得可配置（防静默降级）");
  assert.equal(resolveBudgetStore({ BUDGET_STORE: "sqlite" }), undefined, "sqlite 无路径 → undefined");
  assert.equal(resolveBudgetStore({ BUDGET_STORE: "sqlite", BUDGET_SQLITE_PATH: "relative/x.db" }), undefined, "相对路径 → undefined");
  const sqliteStore = resolveBudgetStore({ BUDGET_STORE: "sqlite", BUDGET_SQLITE_PATH: abs });
  assert.ok(sqliteStore instanceof SqliteBudgetStore);
  assert.equal(sqliteStore.configured, true);
  const cbStore = resolveBudgetStore({ BUDGET_STORE: "cloudbase" });
  assert.ok(cbStore instanceof CloudbaseBudgetStore);
  assert.equal(cbStore.configured, false, "无 CLOUDBASE_APIKEY 时 cloudbase 存储 configured=false → 安全失败");
  await sqliteStore?.close?.();
});

// ---------- 10. 引擎级：SQLite 预算下额度耗尽 → 429 且不再调用模型 ----------
test("10 SQLite 共享预算端到端：全局日额度 2 → 2 次回答后第 3 次 429（0 次额外 fetch）", async () => {
  const dir = tmpDir();
  const file = join(dir, "e2e.sqlite3");
  const store = newStore(file);
  const counter = mockFetchCounter();
  const g = new RequestGuard({ config: { clientPerMinute: 100, clientPerDay: 100, globalModelPerDay: 2, maxConcurrentModels: 3, killSwitch: false }, sharedBudget: store });
  const ctx = askCtx(g, counter.fetch);
  const o1 = await runAsk(FACT_COMPLETE, "t-e2e-1", ctx);
  assert.equal(o1.status, 200);
  const o2 = await runAsk(FACT_COMPLETE, "t-e2e-2", ctx);
  assert.equal(o2.status, 200);
  assert.equal(counter.calls(), 2);
  const o3 = await runAsk(FACT_COMPLETE, "t-e2e-3", ctx);
  assert.equal(o3.status, 429);
  assert.equal(o3.payload.error.message, limitMessage("GLOBAL_MODEL_DAY"));
  assert.equal(counter.calls(), 2, "额度耗尽后不得再调用模型");
  // 持久化证明：重新打开同一文件仍为耗尽状态
  await store.close();
  const store2 = newStore(file);
  const g2 = new RequestGuard({ config: { clientPerMinute: 100, clientPerDay: 100, globalModelPerDay: 2, maxConcurrentModels: 3, killSwitch: false }, sharedBudget: store2 });
  const o4 = await runAsk(FACT_COMPLETE, "t-e2e-4", askCtx(g2));
  assert.equal(o4.status, 429, "重启后每日用量仍在（2/2 已用）");
  assert.equal((await store2.stats()).days, 1);
  await store2.close();
});

// ---------- 11. 语义保持：日期键沿用项目 beijingKey（+8h 日界） ----------
test("11 日期边界：beijingKey 语义不变（UTC 16:00 = 北京次日）", async () => {
  const { beijingDate } = await import("../dist/limit.js");
  assert.equal(beijingDate(Date.parse("2026-08-27T15:59:59.000Z")), "2026-08-27");
  assert.equal(beijingDate(Date.parse("2026-08-27T16:00:01.000Z")), "2026-08-28");
});

// ---------- 12. 清理随从：文件确实存在且属于 SQLite（WAL 模式） ----------
test("12 SQLite 文件持久化于独立路径（非内存）", async () => {
  const dir = tmpDir();
  const file = join(dir, "persist.sqlite3");
  const store = newStore(file);
  await store.acquireDaily("2026-09-05", 10, 1_000);
  await store.close();
  assert.equal(existsSync(file), true, "SQLite 文件必须真实落盘");
  assert.ok(isAbsolute(file));
});
// ---------- 9A. quick_check 结果必须为 ok ----------
test("9A quick_check 结果判定：仅全部行等于 ok 才通过", () => {
  assert.equal(isQuickCheckOk([{ quick_check: "ok" }]), true);
  assert.equal(isQuickCheckOk(["ok"]), true);
  assert.equal(isQuickCheckOk([{ quick_check: "1 errors (out of 1000)" }]), false);
  assert.equal(isQuickCheckOk(["severely corrupted"]), false);
  assert.equal(isQuickCheckOk([]), false);
  assert.equal(isQuickCheckOk(null), false);
  assert.equal(isQuickCheckOk("ok"), false);
});
