// 案例覆盖审计脚本（Phase 7B）：生成 docs/CASE_COVERAGE_AUDIT.md 并输出摘要。
// 运行：node scripts/audit-case-coverage.mjs [--write]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, isAllowedOfficialHost } from "../packages/retrieval/dist/index.js";
import { TOPIC_IDS, TOPIC_LABELS } from "../packages/shared/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const CONTENT_ROOT = join(REPO, "content");
const loaded = loadContent(CONTENT_ROOT);
const cases = loaded.cases;

const today = "2026-08-28";

function norm(s) {
  return s.replace(/\s+/g, "").replace(/[《》【】,，。；：！？!?]/g, "");
}

const byUrl = new Map();
for (const c of cases) {
  if (!byUrl.has(c.officialUrl)) byUrl.set(c.officialUrl, []);
  byUrl.get(c.officialUrl).push(c);
}

// 批次清单（probe）
const probeFiles = [];
for (const f of readdirSync(join(CONTENT_ROOT, "sources", "probe"))) {
  if (/^cases(-phase7b-.*)?\.json$/.test(f)) probeFiles.push(f);
}
const batches = [];
for (const f of probeFiles) {
  let raw = readFileSync(join(CONTENT_ROOT, "sources", "probe", f), "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const parsed = JSON.parse(raw);
  batches.push(...(Array.isArray(parsed) ? parsed : parsed.batches ?? []));
}
const batchBySlug = new Map(batches.map((b) => [b.batchSlug, b]));
const caseCountByBatch = new Map();
for (const c of cases) {
  const slug = c.sourceId.replace(/^case-/, "").replace(/-\d{2}$/, "");
  caseCountByBatch.set(slug, (caseCountByBatch.get(slug) ?? 0) + 1);
}

// ---- 19 主题覆盖 ----
const topicCoverage = Object.fromEntries(TOPIC_IDS.map((t) => [t, 0]));
for (const c of cases) {
  for (const t of c.topicIds) {
    if (topicCoverage[t] === undefined) topicCoverage[t] = 0;
    topicCoverage[t]++;
  }
}

// ---- 重复检测 ----
const dupGroups = [];
const byNormTitle = new Map();
for (const c of cases) {
  const k = norm(c.title);
  if (!byNormTitle.has(k)) byNormTitle.set(k, []);
  byNormTitle.get(k).push(c.sourceId);
}
for (const [k, v] of byNormTitle) if (v.length > 1) dupGroups.push({ type: "title", key: k, ids: v });
for (const [url, list] of byUrl) {
  if (list.length < 2) continue;
  for (const t of list) {
    for (const t2 of list) {
      if (t.sourceId >= t2.sourceId) continue;
      const a = norm(t.title + t.keyFacts.slice(0, 200));
      const b = norm(t2.title + t2.keyFacts.slice(0, 200));
      if (a === b) dupGroups.push({ type: "title+facts", ids: [t.sourceId, t2.sourceId] });
    }
  }
}

// ---- 元数据完整性 ----
const missingMeta = cases.filter((c) => !c.officialUrl || !c.publishingAuthority || !c.publicationDate || !c.jurisdiction || c.reviewStatus !== "source_verified");
const badHost = cases.filter((c) => {
  try { return !isAllowedOfficialHost(new URL(c.officialUrl).hostname); } catch { return true; }
});
const bannedTokens = ["example.com", "TODO", "FIXME", "待补充", "待完善", "占位", "lorem", "XXX判"];
const placeholderHits = cases.filter((c) => bannedTokens.some((t) => JSON.stringify(c).includes(t)));
const withoutDocNo = cases.filter((c) => c.documentNumber === null).length;

// ---- 地区覆盖（"四川省、重庆市" 等联合地区按拆分计数） ----
const byJurisdiction = new Map();
for (const c of cases) {
  byJurisdiction.set(c.jurisdiction, (byJurisdiction.get(c.jurisdiction) ?? 0) + 1);
}
const provinceList = new Set();
for (const j of byJurisdiction.keys()) {
  if (j === "全国性") continue;
  for (const p of j.split("、")) provinceList.add(p.trim());
}

// ---- 批次清单行 ----
const batchRows = [...caseCountByBatch.keys()].sort().map((slug) => {
  const b = batchBySlug.get(slug);
  return {
    slug,
    url: b?.url ?? "?",
    authority: b?.publishingAuthority ?? "?",
    date: b?.publicationDate ?? "?",
    jurisdiction: b?.jurisdiction ?? "?",
    checkedAt: b?.sourceCheckedAt ?? b?.fetchedAt ?? "?",
    count: caseCountByBatch.get(slug),
  };
});

function targetFor(t) {
  const m = {
    "unlawful-termination-compensation": "≥20（与补偿赔偿合计口径）",
    "compensation-and-damages": "≥20（与违法解除合计口径）",
    "wage-arrears": "≥15",
    "overtime-pay": "≥15（与工时休假合计口径）",
    "working-hours-leave": "≥15（与加班费合计口径）",
    "labor-relationship-recognition": "≥20（与新就业形态合计口径）",
    "new-employment-forms": "≥20（与劳动关系认定合计口径）",
    "no-written-contract": "≥12（与二倍工资合计口径）",
    "double-wage-notice": "≥12（与未签合同合计口径）",
    "work-injury": "≥15",
    "social-insurance": "≥10",
    "noncompete-confidentiality": "≥10",
    "arbitration-procedure": "≥15（与仲裁时效合计口径）",
    "arbitration-limitation": "≥15（与裁诉衔接合计口径）",
  };
  return m[t] ?? "≥5";
}

const md = `# CASE_COVERAGE_AUDIT —— 官方案例覆盖审计（${today}）

> 由 \`node scripts/audit-case-coverage.mjs --write\` 生成；数据源为 content/cases（schema v2，official_source_verified）。
> 口径说明：social-insurance-noncompete 为 Phase 6 兼容/联合主题（TOPIC_IDS 注释“原有六个场景 ID 保留以兼容既有内容与调用方”），
> 官方披露语义为“社会保险 OR 竞业限制”联合主题；官方案例的确定性映射 = 命中 social-insurance 或 noncompete-confidentiality 任一主题即归入，
> 与两者都无关的案例不会被标记为该项目（见 scripts/import-cases.mjs inferCaseTopics 注释）。

## 规模

- 案例总数：**${cases.length}**（唯一案例；sourceId 全局唯一）
- 来源批次数：${batchRows.length}
- 覆盖省级地区数：${provinceList.size}（非"全国性"地区数；联合地区按拆分计数：${[...provinceList].join("、")}）
- 官方 URL 全部通过 host 白名单：${badHost.length === 0 ? "是 ✅" : "否 ❌ " + badHost.length}
- 元数据完整（URL/机关/日期/地区/审核状态）：${missingMeta.length === 0 ? "是 ✅" : "否 ❌ " + missingMeta.length}
- 疑似重复（标题或标题+案情前 200 字相同）：${dupGroups.length === 0 ? "无 ✅" : JSON.stringify(dupGroups)}
- 占位/待补充内容：${placeholderHits.length === 0 ? "无 ✅" : JSON.stringify(placeholderHits.map((c) => c.sourceId))}
- 官方未公布案号（documentNumber=null）：${withoutDocNo} / ${cases.length}

## 19 主题案例覆盖

| TopicId | 标签 | 案例数 | 7B 目标 |
|---|---|---|---|
${TOPIC_IDS.map((t) => `| ${t} | ${TOPIC_LABELS[t]} | ${topicCoverage[t]} | ${targetFor(t)} |`).join("\n")}

## 高频主题目标达成

- 违法解除/经济补偿与赔偿金（unlawful-termination-compensation + compensation-and-damages）：${topicCoverage["unlawful-termination-compensation"]} + ${topicCoverage["compensation-and-damages"]}（目标 ≥20）
- 工资/欠薪/提成奖金（wage-arrears）：${topicCoverage["wage-arrears"]}（目标 ≥15）
- 加班费与工时休假（overtime-pay + working-hours-leave）：${topicCoverage["overtime-pay"]} + ${topicCoverage["working-hours-leave"]}（目标 ≥15）
- 劳动关系认定及新就业形态（labor-relationship-recognition + new-employment-forms）：${topicCoverage["labor-relationship-recognition"]} + ${topicCoverage["new-employment-forms"]}（目标 ≥20）
- 未签合同与二倍工资（no-written-contract + double-wage-notice）：${topicCoverage["no-written-contract"]} + ${topicCoverage["double-wage-notice"]}（目标 ≥12）
- 工伤（work-injury）：${topicCoverage["work-injury"]}（目标 ≥15）
- 社会保险（social-insurance）：${topicCoverage["social-insurance"]}（目标 ≥10）
- 竞业限制与保密（noncompete-confidentiality）：${topicCoverage["noncompete-confidentiality"]}（目标 ≥10）
- 仲裁时效/证据/管辖/裁诉衔接（arbitration-limitation + arbitration-procedure）：${topicCoverage["arbitration-limitation"]} + ${topicCoverage["arbitration-procedure"]}（目标 ≥15）

## 来源批次（按批次计数）

${batchRows.map((r) => `- ${r.slug}｜${r.count} 案｜${r.authority}｜${r.date}｜${r.jurisdiction}｜核验 ${r.checkedAt}｜${r.url}`).join("\n")}

## 地区分布

${[...byJurisdiction.entries()].sort((a, b) => b[1] - a[1]).map(([j, n]) => `- ${j}：${n}`).join("\n")}

## 内容空白（如实记录）

- 案例仅经官方来源核验（source_verified），**未经过律师/法律专业人士复核（legal_reviewed=0）**；
- 地方规则、内部口径与个案差异未覆盖；官方未公布案号/未公开裁判文书的案例按原文如实标注；
- 综合争议、集体诉讼与程序细节的覆盖面受官方发布内容限制；部分官方页面仅有案情+意义段，处理结果如实标注“未单独公布”；
- 本阶段未启用 WSA、未调用 DeepSeek、未部署。
`;

if (process.argv.includes("--write")) {
  writeFileSync(join(REPO, "docs", "CASE_COVERAGE_AUDIT.md"), md, "utf8");
  console.log("[audit] 已写入 docs/CASE_COVERAGE_AUDIT.md");
} else {
  console.log(md);
}
console.log("[audit] cases=" + cases.length, "batches=" + batchRows.length, "provinces=" + provinceList.size);
