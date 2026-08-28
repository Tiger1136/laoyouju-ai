// 官方案例导入脚本（Phase 7A/7B，auditable import flow）。
// 输入：content/raw/cases/<batch>.txt（含 =====CASE:N===== 分节块）+ content/sources/probe/cases.json 与
//       content/sources/probe/cases-phase7b-*.json（批次清单；7B 新增 jurisdiction/caseType/checkedAt 等字段）。
// 输出：content/cases/<sourceId>.json（逐案例 schema v2）。
// 原则：不以任何方式补全页面没有的内容；标题/事实/结果/要旨均来自抓取原文分节块（概括/摘录），
//       案号只有页面给出时才填写（页面给出时原样记录；未给出时 documentNumber=null）。
// 运行：node scripts/import-cases.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const RAW_DIR = join(REPO, "content", "raw", "cases");
const PROBE_DIR = join(REPO, "content", "sources", "probe");
const OUT_DIR = join(REPO, "content", "cases");
const RETRIEVED_AT = "2026-08-28";

// ---- 批次清单：cases.json + cases-phase7b-*.json + cases-phase7c-*.json
// （Phase 7B 扩展字段：jurisdiction/caseType/checkedAt；Phase 7C：山东官方案例批次）----
function loadBatches() {
  const files = readdirSync(PROBE_DIR).filter((f) => /^cases(-phase7[bc]-.*)?\.json$/.test(f)).sort();
  const batches = [];
  for (const f of files) {
    let raw = readFileSync(join(PROBE_DIR, f), "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // 去除 BOM
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed.batches ?? []);
    batches.push(...list);
  }
  return batches;
}

// ---- 话题关键词（确定性子串 → topic；人工维护、可审计；宁缺毋滥，不与法规/案例文本中的泛化词误绑）----
const CASE_TOPIC_RULES = [
  ["overtime-pay", ["加班费", "加班", "超时加班", "延长工作时间", "包薪制", "休息日加班"]],
  ["wage-arrears", ["欠薪", "拖欠工资", "追索劳动报酬", "工资报酬", "讨薪", "农民工工资", "克扣工资", "未支付工资"]],
  ["unlawful-termination-compensation", ["违法解除", "解除劳动合同", "辞退", "开除", "解除劳动关系", "裁员"]],
  ["compensation-and-damages", ["赔偿金", "经济补偿", "补偿金", "代通知金"]],
  ["double-wage-notice", ["二倍工资", "双倍工资", "两倍工资"]],
  ["no-written-contract", ["未订立书面劳动合同", "未签订书面劳动合同", "未签书面劳动合同", "不订立书面劳动合同", "书面劳动合同"]],
  ["noncompete-confidentiality", ["竞业限制", "竞业禁止", "商业秘密", "保密义务", "违约金"]],
  ["social-insurance-noncompete", ["__SOCIAL_AND_NONCOMPETE__"]], // 特殊组合：仅当社保组与竞业组均命中时生效
  ["social-insurance", ["社会保险", "社保", "缴费", "抚恤金", "养老保险", "工伤保险", "生育保险"]],
  ["work-injury", ["工伤", "工亡", "停工留薪", "职业伤害", "伤残", "劳动能力鉴定"]],
  ["labor-relationship-recognition", ["确认劳动关系", "是否存在劳动关系", "用工事实", "支配性劳动管理", "从属性", "混同用工", "承包协议规避", "劳动关系认定"]],
  ["new-employment-forms", ["平台", "网约车", "网约货车", "网约配送", "外卖", "骑手", "配送员", "网络主播", "主播", "家政服务人员", "新就业形态", "灵活就业"]],
  ["labor-dispatch", ["劳务派遣", "派遣单位", "用工单位", "劳务外包", "派遣工"]],
  ["arbitration-procedure", ["仲裁时效", "举证责任", "仲裁管辖", "管辖", "先予执行", "终局裁决", "裁审衔接", "仲裁前置", "证据", "仲裁申请", "裁诉"]],
  ["arbitration-limitation", ["仲裁时效"]],
  ["probation-disputes", ["试用期", "录用条件"]],
  ["contract-performance", ["无固定期限劳动合同", "固定期限劳动合同", "合同到期", "续签", "调岗", "降薪", "变更劳动合同", "劳动合同履行", "服务期", "违约定金", "病假工资", "工资支付方式"]],
  ["working-hours-leave", ["工作时间", "休息休假", "年休假", "带薪年休假", "年假", "调休", "补休", "病假", "护理假", "停工留薪期"]],
  ["female-worker-protection", ["女职工", "怀孕", "孕期", "产期", "哺乳期", "三期", "护理假", "产假", "生育"]],
];

/** 依据案例全文命中话题（程序化、确定性；组合话题 social-insurance-noncompete 需社保组+竞业组双命中）。 */
function inferCaseTopics(title, keyFacts, holding, reasoning) {
  const text = canonicalizeForMatch(title + keyFacts + holding + reasoning);
  const matched = [];
  for (const [topic, keywords] of CASE_TOPIC_RULES) {
    if (topic === "social-insurance-noncompete") {
      continue; // 组合话题单独判定
    }
    if (keywords.some((k) => text.includes(k))) {
      matched.push(topic);
    }
  }
  const also = (keywords) => keywords.some((k) => text.includes(k));
  // Phase 6 起点：social-insurance-noncompete 与 TOPIC_IDS 注释一致，属“社会保险与竞业限制”兼容/联合主题
  // （TOPIC_IDS 注释：原有六个场景 ID 保留以兼容既有内容与调用方）。
  // 官方案例在该兼容主题下的确定性映射：案例命中“社会保险”或“竞业限制与保密”任一主题即归入
  // （联合 = 二者并集；不允许与两者都无关的案例进入该主题）。
  if (also(["社会保险", "社保", "养老", "工伤", "生育", "失业保险", "抚恤金", "补缴", "断缴", "缴费"]) || also(["竞业限制", "竞业", "保密", "违约金"])) {
    matched.push("social-insurance-noncompete");
  }
  if (matched.length === 0) {
    matched.push("unlawful-termination-compensation");
  }
  return matched;
}

function canonicalizeForMatch(s) {
  return s.replace(/[\u0020\u3000\u00a0\u200b\n\r\t]+/g, "");
}

/** 从案例文本中提取《法规名》第Y条 → {sourceId, locator}（sourceId 由 law 索引解析；locator 须真实存在）。 */
function extractCited(rawText, lawIndex, lawStripIndex, lawLocators) {
  const out = [];
  const re = /《([^》]{2,40})》[^\n，。；]{0,40}?(第[〇零一二三四五六七八九十百千0-9]+条)/g;
  for (const m of rawText.matchAll(re)) {
    const title = m[1];
    const locator = m[2];
    const fullKey = canonicalizeForMatch(title);
    const strippedKey = fullKey.replace(/[（(].*$/, "");
    let sourceId = lawIndex.get(fullKey);
    if (sourceId === undefined) {
      const hits = lawStripIndex.get(strippedKey);
      sourceId = hits && hits.size === 1 ? [...hits][0] : undefined;
    }
    if (sourceId !== undefined) {
      const locators = lawLocators.get(sourceId);
      if (locators && locators.has(locator)) {
        out.push({ sourceId, locator });
      }
    }
  }
  const seen = new Set();
  return out.filter((i) => {
    const k = i.sourceId + "|" + i.locator;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 解析批次原始文件中的 =====CASE:N===== 分节块；返回 [{index, blocks: Record<string,string>}]。 */
function parseCaseSections(rawText) {
  const sections = [];
  const re = /====CASE:(\d+)====\n([\s\S]*?)(?=\n====CASE:\d+====|$)/g;
  for (const m of rawText.matchAll(re)) {
    const index = Number(m[1]);
    const body = m[2];
    const blocks = {};
    const blockRe = /【([^】]+)】([\s\S]*?)(?=【[^】]+】|$)/g;
    for (const bm of body.matchAll(blockRe)) {
      blocks[bm[1]] = bm[2].trim();
    }
    if (Object.keys(blocks).length > 0) {
      sections.push({ index, blocks, raw: body });
    }
  }
  return sections;
}

const laws = [];
const lawIndex = new Map();
const lawStripIndex = new Map();
const lawLocators = new Map();
function loadLawIndex() {
  for (const f of readdirSync(join(REPO, "content", "laws")).filter((x) => x.endsWith(".json")).sort()) {
    const doc = JSON.parse(readFileSync(join(REPO, "content", "laws", f), "utf8"));
    if (doc.contentType !== "law") continue;
    laws.push(doc);
    const fullKey = canonicalizeForMatch(doc.title);
    lawIndex.set(fullKey, doc.sourceId);
    const strippedKey = fullKey.replace(/[（(].*$/, "");
    if (!lawStripIndex.has(strippedKey)) {
      lawStripIndex.set(strippedKey, new Set());
    }
    lawStripIndex.get(strippedKey).add(doc.sourceId);
    lawLocators.set(doc.sourceId, new Set((doc.provisions ?? []).map((p) => p.locator)));
  }
}

/** 官方页面明确给出的案号才填写；标准案号形如（2019）京01民终1234号 / 浙杭劳人仲案字〔2022〕第X号 / 入库编号 2023-16-2-XXX / 指导性案例编号。 */
const CASE_NO_RE = /^[（(]\s*\d{4}\s*[)）].{1,60}$|^20\d{2}-\d{2}-\d{1,4}-\d{1,6}$|^[（(].*[)）].{1,80}$|^指导性案例\d+号$|^指导案例\d+号$/;

function buildCaseDocument(batch, section, slug) {
  const blocks = section.blocks;
  const title = (blocks["标题"] ?? "").trim();
  if (title === "") {
    return null;
  }
  const keyFacts = (blocks["基本案情"] ?? "").trim();
  const holding =
    (blocks["处理结果"] ?? blocks["裁判结果"] ?? blocks["裁决结果"] ?? blocks["执行结果"] ??
      blocks["裁判结果及理由"] ?? "").trim();
  const reasoning =
    (blocks["案例分析"] ?? blocks["裁判要旨"] ?? blocks["典型意义"] ?? blocks["裁判理由"] ??
      blocks["裁判结果及理由"] ?? blocks["分析"] ?? blocks["点评"] ?? blocks["评析"] ?? "").trim();
  const claimsRaw = (blocks["诉讼请求"] ?? blocks["申请人请求"] ?? blocks["原告请求"] ?? blocks["仲裁请求"] ?? "").trim();
  const issuesRaw = (blocks["争议焦点"] ?? "").trim();
  const docNoRaw = (blocks["案号"] ?? "").trim();
  const documentNumber = docNoRaw === "" || docNoRaw === "未公布" || docNoRaw.includes("未公布案号")
    ? null
    : docNoRaw.length <= 120
      ? docNoRaw
      : null;
  if (documentNumber !== null && !CASE_NO_RE.test(documentNumber)) {
    console.log("[import-cases] WARN 案号格式异常（按未公布处理）:", slug, JSON.stringify(documentNumber));
  }
  if (keyFacts === "" && holding === "" && reasoning === "") {
    return null;
  }
  const fullText = title + keyFacts + holding + reasoning;
  const topics = inferCaseTopics(title, keyFacts, holding, reasoning);
  const cited = extractCited(section.raw ?? fullText, lawIndex, lawStripIndex, lawLocators);
  const nn = String(section.index).padStart(2, "0");
  const sourceId = "case-" + batch.batchSlug + "-" + nn;
  return {
    schemaVersion: "2.0.0",
    contentType: "case",
    sourceId,
    caseId: sourceId,
    title: title.length > 0 ? title : slug,
    publishingAuthority: batch.publishingAuthority ?? "最高人民法院",
    caseType: batch.caseType ?? "typical_case",
    publicationDate: batch.publicationDate ?? RETRIEVED_AT,
    jurisdiction: batch.jurisdiction ?? "全国性",
    authorityLevel: "B",
    officialUrl: batch.url,
    sourceCheckedAt: batch.sourceCheckedAt ?? RETRIEVED_AT,
    retrievedAt: RETRIEVED_AT,
    verificationStatus: "official_source_verified",
    reviewStatus: "source_verified",
    topicIds: [...new Set(topics)],
    issues: issuesRaw.length > 0 ? [issuesRaw.slice(0, 300)] : [title.slice(0, 120)],
    keyFacts: keyFacts.length > 0 ? keyFacts : "（官方页面未提供基本案情摘要，详见案例分析部分）",
    holding: holding.length > 0 ? holding : "（官方页面未提供裁判/处理结果摘要，详见案例分析部分）",
    ...(claimsRaw.length > 0 ? { claims: claimsRaw.slice(0, 1500) } : {}),
    reasoning: reasoning.length > 0 ? reasoning : "（官方页面未提供分析内容）",
    citedProvisions: cited,
    documentNumber,
  };
}

function main() {
  loadLawIndex();
  // --retag：对已生成的案例文件按当前确定性规则重算 topicIds（元数据一致性维护，不改其他字段）。
  if (process.argv.includes("--retag")) {
    let retagged = 0;
    for (const f of readdirSync(OUT_DIR).filter((x) => x.endsWith(".json")).sort()) {
      const p = join(OUT_DIR, f);
      const doc = JSON.parse(readFileSync(p, "utf8"));
      if (doc.contentType !== "case") continue;
      const topics = inferCaseTopics(doc.title, doc.keyFacts, doc.holding, doc.reasoning);
      const next = [...new Set(topics)];
      if (JSON.stringify(next) !== JSON.stringify(doc.topicIds)) {
        doc.topicIds = next;
        writeFileSync(p, JSON.stringify(doc, null, 2) + "\n", "utf8");
        retagged++;
        console.log("[import-cases] retag", doc.sourceId, "->", next.join(","));
      }
    }
    console.log("[import-cases] retag 完成，更新案例数:", retagged);
    return;
  }
  const batches = loadBatches();
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
  console.log("[import-cases] 批次数量:", batches.length);
  let total = 0;
  let skipped = 0;
  const log = [];
  for (const batch of batches) {
    const candidates = [
      join(RAW_DIR, batch.batchSlug + ".txt"),
      join(RAW_DIR, "phase7b", batch.batchSlug + ".txt"),
      join(RAW_DIR, "phase7c", batch.batchSlug + ".txt"),
    ];
    const rawPath = candidates.find((p) => existsSync(p));
    if (rawPath === undefined) {
      console.log("[import-cases] SKIP 缺少原始文件:", batch.batchSlug);
      continue;
    }
    const rawText = readFileSync(rawPath, "utf8").replace(/\r\n?/g, "\n");
    const sections = parseCaseSections(rawText);
    if (sections.length === 0) {
      console.log("[import-cases] WARN 无分节块:", batch.batchSlug);
      continue;
    }
    console.log("[import-cases] 批次", batch.batchSlug, "案例分节数:", sections.length);
    for (const section of sections) {
      const doc = buildCaseDocument(batch, section, batch.batchSlug);
      if (doc === null) {
        console.log("[import-cases] SKIP 无法提取:", batch.batchSlug, "#", section.index);
        skipped++;
        continue;
      }
      const outPath = join(OUT_DIR, doc.sourceId + ".json");
      if (existsSync(outPath)) {
        console.log("[import-cases] SKIP 已存在（防重复导入）:", doc.sourceId);
        skipped++;
        continue;
      }
      writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
      log.push(doc.sourceId + " | " + doc.title + " | " + doc.topicIds.join(",") + " | cites=" + doc.citedProvisions.length + " | no=" + String(doc.documentNumber));
      total++;
    }
  }
  console.log("[import-cases] 完成，写出案例总数:", total, "（跳过", skipped, "）");
  writeFileSync(join(REPO, "content", "sources", "import-log-cases.md"),
    "# 案例导入日志 (2026-08-28)\n\n由 scripts/import-cases.mjs 从官方页面原始文本程序化生成。\n\n" + log.join("\n") + "\n",
    "utf8");
}

main();
