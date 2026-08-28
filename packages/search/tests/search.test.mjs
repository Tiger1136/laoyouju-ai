import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WSA_BASE_URL,
  DEFAULT_WSA_URI,
  MockSearchProvider,
  normalizeWsaCnt,
  normalizeWsaResponse,
  resolveWsaOptions,
  SearchError,
  TencentWSASearchProvider,
  validateSearchItems,
} from "../dist/index.js";

const OFFICIAL_URL = "https://www.gov.cn/zhengce/2022-08/31/content_5711334.htm";

// ---------- 官方协议：请求构造（POST https://api.wsa.cloud.tencent.com/SearchPro） ----------

test("官方协议：Bearer 鉴权、/SearchPro、Body 仅含 Query+Cnt（无旧字段）", async () => {
  let captured;
  const fetchFn = async (url, init) => {
    captured = { url, init };
    return new Response(
      JSON.stringify({
        Response: {
          Pages: [
            JSON.stringify({ title: "企业劳动争议协商调解规定", url: OFFICIAL_URL, passage: "标准摘要", date: "2022-08-31", site: "中国政府网" }),
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const p = new TencentWSASearchProvider({ apiKey: "wsa-test-key-123", fetchFn });
  const results = await p.search({ query: "企业劳动争议 协商调解", limit: 5 });

  assert.equal(captured.url, DEFAULT_WSA_BASE_URL + DEFAULT_WSA_URI);
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["Authorization"], "Bearer wsa-test-key-123");
  assert.equal(captured.init.headers["Content-Type"], "application/json; charset=UTF-8");
  const body = JSON.parse(captured.init.body);
  assert.deepEqual(Object.keys(body).sort(), ["Cnt", "Query"]);
  assert.equal(body.Query, "企业劳动争议 协商调解");
  assert.equal(body.Cnt, 10, "limit=5 应规格化为官方 Cnt 最小值 10");
  assert.equal(body.SearchType, undefined, "不得使用自造字段 SearchType");
  assert.equal(body.Limit, undefined, "不得使用自造字段 Limit");
  assert.equal(captured.init.headers["X-Wsa-Api-Key"], undefined, "不得使用非官方的 X-Wsa-Api-Key 头");

  // 官方映射：title→title、url→url、passage→snippet、date→publishedAt、site→siteName
  assert.equal(results.length, 1);
  assert.equal(results[0].url, OFFICIAL_URL);
  assert.equal(results[0].title, "企业劳动争议协商调解规定");
  assert.equal(results[0].snippet, "标准摘要");
  assert.equal(results[0].publishedAt, "2022-08-31");
  assert.equal(results[0].siteName, "中国政府网");
});

test("Cnt 规格化：仅允许官方值 10/20/30/40/50", () => {
  assert.equal(normalizeWsaCnt(3), 10);
  assert.equal(normalizeWsaCnt(5), 10);
  assert.equal(normalizeWsaCnt(10), 10);
  assert.equal(normalizeWsaCnt(15), 20);
  assert.equal(normalizeWsaCnt(25), 30);
  assert.equal(normalizeWsaCnt(47), 50);
  assert.equal(normalizeWsaCnt(55), 50);
  assert.equal(normalizeWsaCnt(0), 10);
});

// ---------- 官方协议：响应解析（Response.Pages，元素为 JSON 字符串） ----------

test("官方响应：content 字段同样映射为 snippet，topK 截断", () => {
  const rows = normalizeWsaResponse(
    {
      Response: {
        Pages: [
          JSON.stringify({ title: "A", url: "https://www.gov.cn/a", content: "动态摘要A", date: "2024-01-01", site: "siteA" }),
          JSON.stringify({ title: "B", url: "https://www.court.gov.cn/b", passage: "标准摘要B" }),
        ],
      },
    },
    1,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].snippet, "动态摘要A");
  assert.equal(rows[0].publishedAt, "2024-01-01");
  assert.equal(rows[0].siteName, "siteA");
});

test("官方响应：Pages 元素逐项安全解析（畸形元素跳过，好元素保留）", () => {
  const rows = normalizeWsaResponse(
    { Response: { Pages: ["not-json", JSON.stringify({ title: "好", url: "https://www.gov.cn/good", passage: "ok" }), "{\"url\":\"x\"}"] } },
    10,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "好");
});

test("非官方响应结构抛 malformed：无 Pages、空 Pages 全畸形、非对象", () => {
  assert.throws(() => normalizeWsaResponse({ foo: 1 }, 10), (e) => e instanceof SearchError && e.kind === "malformed");
  assert.throws(() => normalizeWsaResponse({ Response: { ResultItems: [] } }, 10), (e) => e instanceof SearchError && e.kind === "malformed");
  assert.throws(() => normalizeWsaResponse({ Response: { Pages: ["bad", "also-bad"] } }, 10), (e) => e instanceof SearchError && e.kind === "malformed");
  assert.throws(() => normalizeWsaResponse(null, 10), (e) => e instanceof SearchError && e.kind === "malformed");
});

test("响应含 Error.Code 视为上游错误（upstream_status）", () => {
  assert.throws(
    () => normalizeWsaResponse({ Response: { Error: { Code: "AuthFailure" }, Pages: [] } }, 10),
    (e) => e instanceof SearchError && e.kind === "upstream_status",
  );
});

// ---------- TencentWSASearchProvider：配置与错误类型化 ----------

test("未配置 apiKey 时 configured=false 且 search 抛 missing_config", async () => {
  const p = new TencentWSASearchProvider({ apiKey: "" });
  assert.equal(p.configured, false);
  await assert.rejects(() => p.search({ query: "工伤" }), (err) => {
    assert.ok(err instanceof SearchError);
    assert.equal(err.kind, "missing_config");
    return true;
  });
});

test("上游 429 → rate_limited；5xx → upstream_status", async () => {
  const rateP = new TencentWSASearchProvider({ apiKey: "k", fetchFn: async () => new Response("{}", { status: 429 }) });
  await assert.rejects(
    () => rateP.search({ query: "x" }),
    (err) => err instanceof SearchError && err.kind === "rate_limited" && err.status === 429,
  );
  const serverP = new TencentWSASearchProvider({ apiKey: "k", fetchFn: async () => new Response("{}", { status: 503 }) });
  await assert.rejects(
    () => serverP.search({ query: "x" }),
    (err) => err instanceof SearchError && err.kind === "upstream_status",
  );
});

test("网络错误 → network；非 JSON → malformed；无 Pages → malformed", async () => {
  const netP = new TencentWSASearchProvider({
    apiKey: "k",
    fetchFn: async () => { throw new TypeError("fetch failed"); },
  });
  await assert.rejects(
    () => netP.search({ query: "x" }),
    (err) => err instanceof SearchError && err.kind === "network",
  );
  const badJsonP = new TencentWSASearchProvider({ apiKey: "k", fetchFn: async () => new Response("not json", { status: 200 }) });
  await assert.rejects(
    () => badJsonP.search({ query: "x" }),
    (err) => err instanceof SearchError && err.kind === "malformed",
  );
  const badShapeP = new TencentWSASearchProvider({ apiKey: "k", fetchFn: async () => new Response(JSON.stringify({ foo: 1 }), { status: 200 }) });
  await assert.rejects(
    () => badShapeP.search({ query: "x" }),
    (err) => err instanceof SearchError && err.kind === "malformed",
  );
});

test("resolveWsaOptions：Key 仅来自 WSA_API_KEY；默认地址为官方 api.wsa.cloud.tencent.com", () => {
  const env = { WSA_API_KEY: "env-key-abc", WSA_TIMEOUT_MS: "1234", WSA_MAX_RESULTS: "3" };
  const o = resolveWsaOptions(env);
  assert.equal(o.apiKey, "env-key-abc");
  assert.equal(o.timeoutMs, 1234);
  assert.equal(o.maxResults, 3);
  const defaults = resolveWsaOptions({});
  assert.equal(defaults.apiKey, "");
  assert.equal(defaults.baseUrl, DEFAULT_WSA_BASE_URL);
});

// ---------- validateSearchItems：URL/等级/时间/文本校验 ----------

test("官方 HTTPS 结果通过并标记 official", () => {
  const { accepted, rejected } = validateSearchItems([
    { url: OFFICIAL_URL, title: "a", snippet: "b" },
  ], { now: "2026-08-27" });
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].official, true);
  assert.equal(rejected.length, 0);
});

test("非 HTTPS / 非官方域名 / 黑名单域名全部拒绝", () => {
  const { accepted, rejected } = validateSearchItems([
    { url: "http://www.gov.cn/x", title: "a", snippet: "b" },
    { url: "https://evil-gov.cn/x", title: "a", snippet: "b" },
    { url: "https://mp.weixin.qq.com/s/abc", title: "公众号文章", snippet: "全文…" },
    { url: "https://www.baidu.com/s?wd=x", title: "搜索页", snippet: "…" },
  ], {
    now: "2026-08-27",
    deniedDomains: ["mp.weixin.qq.com", "baidu.com"],
  });
  assert.equal(accepted.length, 0);
  assert.deepEqual(rejected.map((r) => r.reason), ["NOT_HTTPS", "NOT_OFFICIAL_DOMAIN", "NOT_OFFICIAL_DOMAIN", "NOT_OFFICIAL_DOMAIN"]);
});

test("extraOfficialDomains 允许地方官方域（如北京法院网）", () => {
  const { accepted } = validateSearchItems([
    { url: "https://www.bjcourt.gov.cn/x", title: "a", snippet: "b" },
  ], { now: "2026-08-27", extraOfficialDomains: ["bjcourt.gov.cn"] });
  assert.equal(accepted.length, 1);
});

test("未来发布时间 / 空文本 / 超长摘要拒绝", () => {
  const { rejected } = validateSearchItems([
    { url: OFFICIAL_URL, title: "t", snippet: "s", publishedAt: "2030-01-01" },
    { url: OFFICIAL_URL, title: "", snippet: "s" },
    { url: OFFICIAL_URL, title: "t", snippet: "x".repeat(700) },
  ], { now: "2026-08-27", maxSnippetChars: 600 });
  assert.deepEqual(rejected.map((r) => r.reason), ["FUTURE_PUBLISHED_AT", "MISSING_TEXT", "OVERSIZED_TEXT"]);
});

// ---------- MockSearchProvider ----------

test("MockSearchProvider：固定结果 / 关键字路由 / 类型化错误 / 调用记录", async () => {
  const fixed = new MockSearchProvider({ kind: "results", results: [{ url: OFFICIAL_URL, title: "t", snippet: "s" }] });
  assert.equal((await fixed.search({ query: "q", limit: 1 })).length, 1);
  assert.equal(fixed.calls.length, 1);

  const kw = new MockSearchProvider({
    kind: "keyword",
    byKeyword: { 工伤: [{ url: OFFICIAL_URL, title: "工伤案例", snippet: "摘要" }] },
  });
  assert.equal((await kw.search({ query: "上海 工伤 官方" })).length, 1);
  assert.equal((await kw.search({ query: "完全无关" })).length, 0);

  const errP = new MockSearchProvider({ kind: "error", error: "timeout" });
  await assert.rejects(
    () => errP.search({ query: "q" }),
    (err) => err instanceof SearchError && err.kind === "timeout",
  );
});

test("搜索摘要进入证据集前必须经过校验（编排层只允许作为C级线索引用）", () => {
  const { rejected } = validateSearchItems([
    { url: "https://www.court.gov.cn/zixun/xiangqing/319151.html", title: "t", snippet: "s" },
  ], { now: "2026-08-27" });
  assert.equal(rejected.length, 0, "正常摘要应通过校验；但编排层只允许作为C级线索引用，不得当作完整法条");
});
