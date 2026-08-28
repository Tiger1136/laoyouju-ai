// 静态导出验证测试（Node 内置 test runner，无第三方测试框架）。
// 假设构建时未设置 NEXT_PUBLIC_SITE_URL，sitemap/robots 使用默认值 https://example.com。
// 运行前提：先执行 next build（生成 apps/web/out）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "out");

const PUBLIC_ROUTES = [
  "/",
  "/topics",
  "/laws",
  "/cases",
  "/about/methodology",
  "/about/sources",
  "/privacy",
  "/terms",
  "/ai-notice",
];

function outFile(route) {
  return route === "/"
    ? join(out, "index.html")
    : join(out, `${route.slice(1)}/index.html`);
}

test("out/ 目录存在且首页 index.html 已生成", () => {
  assert.ok(existsSync(join(out, "index.html")), "out/index.html 缺失");
});

for (const route of PUBLIC_ROUTES) {
  test(`公开路由已静态导出: ${route}`, () => {
    const file = outFile(route);
    assert.ok(existsSync(file), `缺少 ${file}`);
    const html = readFileSync(file, "utf8");
    assert.ok(html.includes("<html"), `${route} 不是 HTML`);
  });
}

test("sitemap.xml 存在、包含全部公开路由且不含 /ask", () => {
  const file = join(out, "sitemap.xml");
  assert.ok(existsSync(file), "out/sitemap.xml 缺失");
  const xml = readFileSync(file, "utf8");
  assert.ok(xml.includes("<urlset"), "sitemap.xml 内容异常");
  assert.ok(!xml.includes("/ask"), "sitemap 不得包含 /ask");
  // 域名基地址从 sitemap 实际内容提取（构建时由 NEXT_PUBLIC_SITE_URL 决定；可以是默认占位或真实测试域，不应硬编码）。
  const locMatch = /<loc>(https:\/\/[^/]+)\//.exec(xml);
  assert.ok(locMatch, "sitemap 应包含 loc 地址");
  const base = locMatch[1];
  for (const route of PUBLIC_ROUTES) {
    const expected =
      route === "/"
        ? `<loc>${base}/</loc>`
        : `<loc>${base}${route}/</loc>`;
    assert.ok(xml.includes(expected), `sitemap 缺少 ${route}`);
  }
});

test("robots.txt 存在、禁止 /ask 且声明 sitemap", () => {
  const file = join(out, "robots.txt");
  assert.ok(existsSync(file), "out/robots.txt 缺失");
  const text = readFileSync(file, "utf8");
  assert.ok(/Disallow:\s*\/ask/.test(text), "robots.txt 未禁止 /ask");
  assert.ok(text.includes("Sitemap:"), "robots.txt 缺少 Sitemap 声明");
});

test("/ask 静态 HTML 包含 noindex", () => {
  const file = join(out, "ask", "index.html");
  assert.ok(existsSync(file), "out/ask/index.html 缺失");
  const html = readFileSync(file, "utf8");
  assert.ok(/noindex/.test(html), "/ask 缺少 noindex");
});

test("/ask 静态 HTML 包含 AI 生成标识与合规提示，且不包含模拟回答", () => {
  const file = join(out, "ask", "index.html");
  const html = readFileSync(file, "utf8");
  assert.ok(html.includes("AI 生成"), "/ask 缺少 AI 生成标识");
  assert.ok(html.includes("仅供参考") && html.includes("不构成法律意见"), "/ask 缺少合规提示");
  assert.ok(html.includes("请勿输入姓名、身份证号、手机号"), "/ask 缺少隐私提醒");
  // 禁止把静态假数据冒充真实 API 输出：不应出现“胜诉率”等承诺性表述。
  assert.ok(!html.includes("胜诉率"), "/ask 不应出现模拟结果承诺");
});

test("构建产物不出现敏感字符串", () => {
  // sk- 密钥模式：要求前缀非字母数字，且后接至少 8 位字母数字，避免误伤 task- 等普通单词。
  const sensitive = [
    "DEEPSEEK_API_KEY",
    /(^|[^A-Za-z0-9])sk-[A-Za-z0-9]{8,}/,
    "虚假准确率",
    "胜诉率预测",
  ];
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  })(out);

  const problems = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of sensitive) {
      if (typeof pattern === "string") {
        if (content.includes(pattern)) {
          problems.push(`${file} 包含 ${pattern}`);
        }
      } else if (pattern.test(content)) {
        problems.push(`${file} 匹配密钥模式 sk-*`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("首页包含主标语「劳动问题，回答有依据」", () => {
  const html = readFileSync(join(out, "index.html"), "utf8");
  assert.ok(html.includes("劳动问题，回答有依据"), "首页缺少主标语");
});

// ---------- Phase 7A：公开目录页使用当前数据规模 ----------

test("/laws 使用当前数据规模（34 部规范，含新收录规范）", () => {
  const html = readFileSync(join(out, "laws", "index.html"), "utf8");
  const count = (html.match(/文件类型：/g) ?? []).length;
  assert.ok(count >= 34, `laws 页应展示 34 部规范，实际 ${count}`);
  assert.ok(html.includes("企业劳动争议协商调解规定"), "laws 页应包含 Phase 7A 新收录规范（证明非旧 9 部数据）");
  assert.ok(!html.includes("已通过专业复核"), "laws 页不得把 source_verified 显示成专业复核通过");
  assert.ok(html.includes("已核对官方来源，尚待专业复核"), "laws 页应如实显示 source_verified 状态");
});

test("/cases 使用当前数据规模（53 个官方案例，来源与发布时间可见）", () => {
  const html = readFileSync(join(out, "cases", "index.html"), "utf8");
  const count = (html.match(/发布机关：/g) ?? []).length;
  assert.ok(count >= 53, `cases 页应展示 53 个案例，实际 ${count}`);
  assert.ok(/发布机关：<\/strong>[\s\S]{0,40}?20\d{2}-\d{2}-\d{2}/.test(html) || (html.includes("发布日期：") && /\d{4}-\d{2}-\d{2}/.test(html)), "cases 页应展示发布日期");
  assert.ok(html.includes("某器材公司破产清算转重整案"), "cases 页应包含新批次案例（证明非旧 9 案例数据）");
});

test("/topics 使用当前数据规模（19 个主题）", async () => {
  const html = readFileSync(join(out, "topics", "index.html"), "utf8");
  const count = (html.match(/已收录有效条文：/g) ?? []).length;
  assert.ok(count >= 19, `topics 页应至少展示 19 个主题（静态+RSC 双份渲染，实际 ${count}）`);
  // 19 个主题标签全部出现在页面中（与 @laoyouju/shared 单一来源一致）。
  const { TOPIC_IDS, TOPIC_LABELS } = await import("@laoyouju/shared");
  for (const id of TOPIC_IDS) {
    assert.ok(html.includes(TOPIC_LABELS[id]), `topics 页缺少主题：${TOPIC_LABELS[id]}`);
  }
});

// ---------- Phase 7A：构建产物不得出现旧 insufficient / 资料不足文案 ----------

test("Web 构建产物（out/）不含旧 insufficient 与“资料不足/当前资料未覆盖”文案", () => {
  const banned = ["insufficient", "资料不足", "当前资料未覆盖", "当前资料不足，无法可靠判断"];
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  })(out);
  const problems = [];
  for (const file of files) {
    if (!/\.(html|js|css|json|txt)$/.test(file)) {
      continue;
    }
    const content = readFileSync(file, "utf8");
    for (const phrase of banned) {
      if (content.includes(phrase)) {
        problems.push(`${file} 包含「${phrase}」`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
