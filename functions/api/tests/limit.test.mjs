// Phase 8/8.1：最低上线保护单元/引擎测试（全部 mock；不调用 DeepSeek）。
// 运行：node tests/limit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestGuard, FixedWindowCounterStore, limitMessage, hashClientKey, beijingDate } from "../dist/limit.js";
import { MemoryBudgetStore, newLeaseId } from "../dist/shared-budget.js";
import { runAsk, loadAskResources } from "../dist/ask.js";

function guardFor(cfg, store) {
  return new RequestGuard({
    config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false, ...cfg },
    sharedBudget: store ?? new MemoryBudgetStore(),
  });
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
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
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

test("1 阈值内正常通过：6/min、30/day 内允许；共享存储全局/并发未触及", async () => {
  const g = guardFor({});
  for (let i = 0; i < 6; i++) {
    assert.equal(g.checkClient("1.2.3.4").allowed, true);
  }
  for (let i = 0; i < 3; i++) {
    const s = await g.tryModelSlot();
    assert.equal(s.allowed, true);
    assert.ok(s.leaseId, "共享槽位应返回 leaseId");
    await g.releaseModelSlot(s.leaseId);
  }
});

test("2 每分钟超限返回 CLIENT_MINUTE（第 7 次拒绝）", () => {
  const g = guardFor({});
  for (let i = 0; i < 6; i++) g.checkClient("1.2.3.4");
  const d = g.checkClient("1.2.3.4");
  assert.equal(d.allowed, false);
  assert.equal(d.code, "CLIENT_MINUTE");
  assert.ok(d.retryAfterSeconds >= 1 && d.retryAfterSeconds <= 60);
});

test("3 每日客户端超限返回 CLIENT_DAY（新分钟窗口但同日第 31 次拒绝）", () => {
  let now = Date.parse("2026-08-27T10:59:00.000Z");
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, now: () => now, sharedBudget: new MemoryBudgetStore() });
  for (let i = 0; i < 30; i++) {
    now += 61_000;
    assert.equal(g.checkClient("5.6.7.8").allowed, true);
  }
  now += 61_000;
  const d = g.checkClient("5.6.7.8");
  assert.equal(d.allowed, false);
  assert.equal(d.code, "CLIENT_DAY");
});

test("4 全局日额度耗尽后不调用模型（共享存储第 limit+1 次拒绝；引擎层面 429 且 fetch=0）", async () => {
  const g = guardFor({ globalModelPerDay: 2 });
  const counter = mockFetchCounter();
  const ctx = askCtx(g, counter.fetch);
  const o1 = await runAsk(FACT_COMPLETE, "t1", ctx);
  assert.equal(o1.status, 200);
  assert.equal(counter.calls(), 1);
  const o2 = await runAsk(FACT_COMPLETE, "t2", ctx);
  assert.equal(o2.status, 200);
  assert.equal(counter.calls(), 2);
  const o3 = await runAsk(FACT_COMPLETE, "t3", ctx);
  assert.equal(o3.status, 429);
  assert.equal(o3.errorCode, "RATE_LIMITED");
  assert.equal(o3.payload.error.message, limitMessage("GLOBAL_MODEL_DAY"));
  assert.equal(counter.calls(), 2, "额度耗尽后不得再调用模型");
});

test("5 并发达到上限后不继续调用模型（槽位占用时 429 且 fetch 不增；释放后恢复）", async () => {
  const g = guardFor({ maxConcurrentModels: 1 });
  const held = await g.tryModelSlot();
  assert.equal(held.allowed, true);
  const counter = mockFetchCounter();
  const ctx = askCtx(g, counter.fetch);
  const o = await runAsk(FACT_COMPLETE, "t-cur", ctx);
  assert.equal(o.status, 429);
  assert.equal(o.payload.error.message, limitMessage("MODEL_CONCURRENCY"));
  assert.equal(counter.calls(), 0, "并发占满时不得调用模型");
  await g.releaseModelSlot(held.leaseId);
  const o2 = await runAsk(FACT_COMPLETE, "t-cur2", ctx);
  assert.equal(o2.status, 200, "释放后应可正常调用");
  assert.equal(counter.calls(), 1);
});

test("6 并发竞争：共享存储下计数不超发（日额度/并发槽位精确）", async () => {
  const shared = new MemoryBudgetStore();
  const sharedCounter = new FixedWindowCounterStore();
  const guards = Array.from({ length: 5 }, () => new RequestGuard({
    config: { clientPerMinute: 6, clientPerDay: 100, globalModelPerDay: 3, maxConcurrentModels: 3, killSwitch: false },
    store: sharedCounter,
    sharedBudget: shared,
  }));
  const results = guards.flatMap((g) => [g.checkClient("9.9.9.9"), g.checkClient("9.9.9.9")]);
  assert.equal(results.filter((r) => r.allowed).length, 6, "共享存储下客户端分钟限额（6）精确不超发（10 次尝试仅 6 次放行）");
  const slots = [];
  for (const g of guards) slots.push(await g.tryModelSlot());
  assert.equal(slots.filter((s) => s.allowed).length, 3, "共享存储下全局日额度（3）精确不超发（5 次尝试仅 3 次放行）");
  for (const s of slots) { if (s.allowed) await guards[0].releaseModelSlot(s.leaseId); }
  const shared2 = new MemoryBudgetStore();
  const g2 = Array.from({ length: 5 }, () => new RequestGuard({ config: { clientPerMinute: 100, clientPerDay: 100, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, sharedBudget: shared2 }));
  const got = [];
  for (const gg of g2) { const s = await gg.tryModelSlot(); got.push(s); }
  assert.equal(got.filter((s) => s.allowed).length, 3);
  assert.equal(got.filter((s) => s.code === "MODEL_CONCURRENCY").length, 2, "超出的并发申请应明确返回 MODEL_CONCURRENCY");
  for (const s of got) { if (s.allowed) await g2[0].releaseModelSlot(s.leaseId); }
  const last = await g2[0].tryModelSlot();
  assert.equal(last.allowed, true, "释放后应能重新取得槽位");
  await g2[0].releaseModelSlot(last.leaseId);
});

test("7 kill switch 开启时模型调用次数为 0（友好 429 文案）", async () => {
  const g = guardFor({ killSwitch: true });
  const counter = mockFetchCounter();
  const ctx = askCtx(g, counter.fetch);
  const o = await runAsk(FACT_COMPLETE, "t-ks", ctx);
  assert.equal(o.status, 429);
  assert.equal(o.payload.error.message, limitMessage("KILL_SWITCH"));
  assert.equal(counter.calls(), 0, "kill switch 开启时不得调用模型");
});

test("8 日期切换后每日额度正确重置（北京时间日界；共享存储按 dayKey 隔离）", async () => {
  let now = Date.parse("2026-08-27T15:59:59.000Z");
  const shared = new MemoryBudgetStore();
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 3, maxConcurrentModels: 3, killSwitch: false }, now: () => now, sharedBudget: shared });
  for (let i = 0; i < 3; i++) {
    const s = await g.tryModelSlot();
    assert.equal(s.allowed, true);
    await g.releaseModelSlot(s.leaseId);
  }
  const d = await g.tryModelSlot();
  assert.equal(d.allowed, false);
  assert.equal(d.code, "GLOBAL_MODEL_DAY");
  now = Date.parse("2026-08-27T16:00:01.000Z");
  const d2 = await g.tryModelSlot();
  assert.equal(d2.allowed, true, "跨日后共享日额度应重置");
  await g.releaseModelSlot(d2.leaseId);
  assert.equal(beijingDate(now), "2026-08-28");
});

test("9 存储异常时安全降级：客户端限制放行、模型槽位拒绝（费用保护优先，不静默回退内存）", async () => {
  const failingCounter = { increment: () => { throw new Error("down"); }, peek: () => { throw new Error("down"); }, sweep: () => { throw new Error("down"); } };
  const failingShared = {
    configured: true,
    ensureReady: async () => { throw new Error("auth failed"); },
    acquireDaily: async () => { throw new Error("auth failed"); },
    acquireConcurrency: async () => { throw new Error("auth failed"); },
    releaseDaily: async () => { throw new Error("auth failed"); },
    releaseConcurrency: async () => { throw new Error("auth failed"); },
    reconcile: async () => { throw new Error("auth failed"); },
  };
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, store: failingCounter, sharedBudget: failingShared });
  const c = g.checkClient("3.3.3.3");
  assert.equal(c.allowed, true, "客户端限制降级放行（可用性优先）");
  const s = await g.tryModelSlot();
  assert.equal(s.allowed, false, "共享存储异常时模型调用失败关闭（费用保护优先）");
  assert.equal(s.code, "STORE_ERROR");
  const g2 = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false } });
  assert.equal((await g2.tryModelSlot()).code, "STORE_ERROR", "未注入共享存储（生产未配置 CLOUDBASE_APIKEY 形态）同样失败关闭");
});

test("10 前端文案契约：所有限流码均有稳定中文文案", () => {
  for (const code of ["CLIENT_MINUTE", "CLIENT_DAY", "GLOBAL_MODEL_DAY", "MODEL_CONCURRENCY", "KILL_SWITCH", "STORE_ERROR"]) {
    const msg = limitMessage(code);
    assert.ok(msg.length >= 6 && !msg.includes("undefined") && !msg.includes("err") && !msg.includes("node_modules"), msg);
  }
  assert.ok(limitMessage("KILL_SWITCH").includes("服务暂时繁忙"));
});

test("客户端键不可逆哈希：相同 IP 相同键、不同 IP 不同键、空值匿名", () => {
  const a = hashClientKey("203.0.113.5");
  assert.equal(a, hashClientKey("203.0.113.5"));
  assert.notEqual(a, hashClientKey("203.0.113.6"));
  assert.equal(hashClientKey(undefined), "anonymous");
  assert.equal(a.length, 32);
});

test("租约 ID 唯一且为 UUID 格式", () => {
  const a = newLeaseId();
  const b = newLeaseId();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});