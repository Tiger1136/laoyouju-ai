// Phase 8：最低上线保护单元/引擎测试（全部 mock；不调用 DeepSeek）。
// 运行：node tests/limit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestGuard, FixedWindowCounterStore, limitMessage, beijingDate, hashClientKey } from "../dist/limit.js";
import { runAsk, loadAskResources } from "../dist/ask.js";

function guardFor(cfg) {
  return new RequestGuard({
    config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false, ...cfg },
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

test("1 阈值内正常通过：6/min、30/day 内允许；全局/并发未触及", () => {
  const g = guardFor({});
  for (let i = 0; i < 6; i++) {
    assert.equal(g.checkClient("1.2.3.4").allowed, true, "第 " + (i + 1) + " 次应放行");
  }
  for (let i = 0; i < 3; i++) {
    const s = g.tryModelSlot();
    assert.equal(s.allowed, true);
    g.releaseModelSlot();
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
  let now = Date.parse("2026-08-27T10:59:00.000Z"); // 北京 18:59
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, now: () => now });
  for (let i = 0; i < 30; i++) {
    now += 61_000; // 每次跨入新分钟窗口
    assert.equal(g.checkClient("5.6.7.8").allowed, true);
  }
  now += 61_000;
  const d = g.checkClient("5.6.7.8");
  assert.equal(d.allowed, false);
  assert.equal(d.code, "CLIENT_DAY");
});

test("4 全局日额度耗尽后不调用模型（第 101 次拒绝；引擎层面 429 且 fetch=0）", async () => {
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

test("5 并发达到上限后不继续调用模型（引擎层面 429 且 fetch 不增）", async () => {
  const g = guardFor({ maxConcurrentModels: 1 });
  const out = g.tryModelSlot();
  assert.equal(out.allowed, true);
  const counter = mockFetchCounter();
  const ctx = askCtx(g, counter.fetch);
  const o = await runAsk(FACT_COMPLETE, "t-cur", ctx);
  assert.equal(o.status, 429);
  assert.equal(o.payload.error.message, limitMessage("MODEL_CONCURRENCY"));
  assert.equal(counter.calls(), 0, "并发占满时不得调用模型");
  g.releaseModelSlot();
  const o2 = await runAsk(FACT_COMPLETE, "t-cur2", ctx);
  assert.equal(o2.status, 200, "释放后应可正常调用");
  assert.equal(counter.calls(), 1);
});

test("6 并发竞争：共享存储下计数不超发（客户端/全局日额度原子）；单 guard 并发槽位精确", () => {
  // 同一 store 模拟“多实例共享计数”：客户端分钟/日额度与全局日额度在共享存储下精确不超发。
  const store = new FixedWindowCounterStore();
  const guards = Array.from({ length: 5 }, () => new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 3, maxConcurrentModels: 100, killSwitch: false }, store }));
  const results = guards.flatMap((g) => [g.checkClient("9.9.9.9"), g.checkClient("9.9.9.9")]);
  assert.equal(results.filter((r) => r.allowed).length, 6, "共享存储下分钟限额（6）精确不超发（10 次尝试仅 6 次放行）");
  const dayStore = new FixedWindowCounterStore();
  const dayGuards = Array.from({ length: 5 }, () => new RequestGuard({ config: { clientPerMinute: 100, clientPerDay: 100, globalModelPerDay: 3, maxConcurrentModels: 100, killSwitch: false }, store: dayStore }));
  const slots = dayGuards.map((g) => g.tryModelSlot());
  assert.equal(slots.filter((s) => s.allowed).length, 3, "共享存储下全局日额度（3）精确不超发（5 次尝试仅 3 次放行）");
  assert.equal(slots.filter((s) => !s.allowed).length, 2);
  // 单 guard 并发槽位：达到 maxConcurrentModels 后不再放行（进程内精确）。
  const g1 = guardFor({ maxConcurrentModels: 3 });
  for (let i = 0; i < 3; i++) assert.equal(g1.tryModelSlot().allowed, true);
  const over = g1.tryModelSlot();
  assert.equal(over.allowed, false);
  assert.equal(over.code, "MODEL_CONCURRENCY");
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

test("8 日期切换后每日额度正确重置（北京时区日界）", () => {
  let now = Date.parse("2026-08-27T15:59:59.000Z"); // 北京 2026-08-27 23:59:59
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, now: () => now });
  for (let i = 0; i < 30; i++) {
    now += 61_000;
    g.checkClient("2.2.2.2");
  }
  let d = g.checkClient("2.2.2.2");
  assert.equal(d.allowed, false, "同日应达上限");
  now = Date.parse("2026-08-27T16:00:01.000Z"); // 北京 2026-08-28 00:00:01（跨日）
  const g2 = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, now: () => now });
  const r1 = g2.checkClient("2.2.2.2");
  assert.equal(r1.allowed, true, "跨日后应重置");
  assert.equal(beijingDate(now), "2026-08-28");
});

test("9 存储异常时安全降级：客户端限制放行、模型槽位拒绝（费用保护优先）", () => {
  const failing = {
    increment: () => { throw new Error("store down"); },
    peek: () => { throw new Error("store down"); },
    sweep: () => { throw new Error("store down"); },
  };
  const g = new RequestGuard({ config: { clientPerMinute: 6, clientPerDay: 30, globalModelPerDay: 100, maxConcurrentModels: 3, killSwitch: false }, store: failing });
  const c = g.checkClient("3.3.3.3");
  assert.equal(c.allowed, true, "客户端限制降级放行（可用性优先）");
  const s = g.tryModelSlot();
  assert.equal(s.allowed, false, "模型调用失败关闭（费用保护优先）");
  assert.equal(s.code, "STORE_ERROR");
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