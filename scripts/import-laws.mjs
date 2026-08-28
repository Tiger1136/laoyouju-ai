// 法律法规导入脚本（Phase 7A，auditable import flow）。
// 输入：content/raw/laws/<slug>.txt（官方页面正文）+ content/sources/probe/laws.json（来源元数据，由研究任务核实）。
// 输出：content/laws/<sourceId>.json（完整条文拆分 schema v2）。
// 原则：条文文本只来自抓取的官方页面正文；元数据只来自核实清单；不做任何补全。
// 运行：node scripts/import-laws.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const RAW_DIR = join(REPO, "content", "raw", "laws");
const PROBE_FILE = join(REPO, "content", "sources", "probe", "laws.json");
const OUT_DIR = join(REPO, "content", "laws");
const RETRIEVED_AT = "2026-08-27";

const probeRaw = JSON.parse(readFileSync(PROBE_FILE, "utf8"));
const records = Array.isArray(probeRaw) ? probeRaw : (probeRaw.records ?? probeRaw.laws ?? []);

/** 规范化文本用于哈希（与 packages/retrieval 的 canonicalize 保持一致）。 */
function canonicalize(text) {
  const nfkc = text.normalize("NFKC");
  const lowered = nfkc.toLowerCase();
  const noWs = lowered.replace(/[\s\u3000\u200b\u00a0]+/gu, "");
  return noWs.replace(/[^\p{L}\p{N}]/gu, "");
}

function sha256(text) {
  return createHash("sha256").update(canonicalize(text), "utf8").digest("hex");
}

/** 计算规范 contentHash：provisions 的 sourceText 依序以 \n 连接后（规范后）取 SHA-256。 */
function contentHashOf(provisions) {
  return sha256(provisions.map((p) => p.sourceText).join("\n"));
}

// ---- 条文拆分：按行首“第X条”切分 ----
const ARTICLE_LINE_RE = /^第[〇零一二三四五六七八九十百千0-9]+条/;
const CHAPTER_RE = /^第[〇零一二三四五六七八九十百千0-9]+[章节]/;
// 仅行首“第X”（数字后无“条”）即下一页拆行。
const NUM_ONLY_RE = /^第[〇零一二三四五六七八九十百千0-9]+$/;

/**
 * 行级预处理：gov.cn 等页面会把“第五”与“条”拆成两行（span 渲染），
 * 合并为“第五条”以便正确识别条文起点。
 */
function preprocessLines(rawText) {
  const lines = rawText.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (NUM_ONLY_RE.test(t) && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (/^条/.test(next)) {
        out.push(t + next[0] + next.slice(1));
        i++;
        continue;
      }
    }
    out.push(lines[i]);
  }
  return out;
}

/** 页面噪音标记（页脚/版权/打印等，条文文本中出现即截断）。 */
const NOISE_MARKERS = [
  "网站标识码",
  "京ICP备",
  "京公网安备",
  "版权所有",
  "Copyright",
  "E-mail推荐",
  "【E-mail",
  "打印本页",
  "字号：",
  "分享到",
  "扫一扫",
  "相关阅读",
  "责任编辑",
  "中国法院网负责",
  "最高人民法院网",
  "本网发布",
  "ICP备案",
  "国家规章库",
  "回到顶部",
  "链接：",
  "【打印】",
  "【我要纠错】",
  "【关闭窗口】",
  "相关稿件",
  "主办单位",
  "网站声明",
  "联系我们",
  "免责声明",
  "修订对照",
  "网站管理",
  "客户服务",
  "技术支持",
  "相关链接",
];

/** 清理 HTML 实体与标签。 */
function stripHtml(text) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;|&quot;/g, "\"")
    .replace(/&mdash;|&#8212;/g, "——")
    .replace(/&middot;|&#183;/g, "·")
    .replace(/&amp;/g, "&");
}

/** 从文本中截断页面噪音（第一个噪音标记起）。 */
function cutNoise(text) {
  let out = text;
  for (const marker of NOISE_MARKERS) {
    const idx = out.indexOf(marker);
    if (idx > 0) {
      out = out.slice(0, idx);
    }
  }
  return out;
}

function splitProvisions(rawText) {
  const lines = preprocessLines(rawText);
  const starts = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.length > 0 && ARTICLE_LINE_RE.test(t) && !CHAPTER_RE.test(t)) {
      starts.push(i);
    }
  });
  if (starts.length === 0) {
    return [];
  }
  const articles = [];
  starts.forEach((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    // 剔除章节行（“第二章 总则”等不属于任何条文正文）。
    const chunkLines = lines.slice(start, end).filter((l) => !CHAPTER_RE.test(l.trim()));
    const text = cutNoise(stripHtml(chunkLines.join("\n"))).trim();
    const m = /^第[〇零一二三四五六七八九十百千0-9]+条/.exec(text);
    if (m === null) {
      return;
    }
    const locator = m[0];
    articles.push({
      locator,
      sourceText: text.replace(/\s+/g, " ").trim(),
    });
  });
  return articles;
}

/**
 * 无“第X条”结构文件（政策文件/通知）的正文提取：
 * 官方页面在导航、页脚之后还会重复正文，取“标题出现的所有位置中，
 * 到下一个标题重复或页脚标记为止长度最长的 span”，避免把导航文字当成正文，
 * 也避免把页面上的两份重复正文都收进来。结束边界取二者较近者。
 */
function extractFullBody(rawText, title) {
  const clean = stripHtml(rawText).replace(/\s+/g, " ").trim();
  const titleNo = title.replace(/\s+/g, "");
  const cleanNo = clean.replace(/\s+/g, "");
  const candidates = [];
  let i = -1;
  while ((i = cleanNo.indexOf(titleNo, i + 1)) !== -1) {
    candidates.push(i);
  }
  if (candidates.length === 0) {
    return cutNoise(clean).trim();
  }
  let best = null;
  for (let ci = 0; ci < candidates.length; ci++) {
    const start = candidates[ci];
    const nextTitle = ci + 1 < candidates.length ? candidates[ci + 1] : cleanNo.length;
    let end = nextTitle;
    for (const m of NOISE_MARKERS) {
      const mn = m.replace(/\s+/g, "");
      const idx = cleanNo.indexOf(mn, start + titleNo.length);
      if (idx > start && idx < end) {
        end = idx;
      }
    }
    const len = end - start;
    if (!best || len > best.len) {
      best = { start, len };
    }
  }
  return cleanNo.slice(best.start, best.start + Math.min(best.len, 20000));
}

// ---- 条文话题分配（确定性关键词规则）----
const PROVISION_TOPIC_RULES = [
  ["working-hours-leave", ["工作时间", "休息日", "延长工作时间", "年休假", "探亲假", "婚假", "丧假", "法定节假日", "带薪", "工时"]],
  ["overtime-pay", ["加班", "加班费", "加班工资", "百分之一百五十", "百分之二百", "百分之三百"]],
  ["wage-arrears", ["拖欠", "克扣", "工资", "劳动报酬", "欠薪", "报酬"]],
  ["unlawful-termination-compensation", ["解除劳动合同", "终止劳动合同", "经济补偿", "赔偿金", "违法解除"]],
  ["compensation-and-damages", ["经济补偿", "赔偿金", "补偿金", "代通知金"]],
  ["double-wage-notice", ["二倍工资", "双倍工资", "两倍工资"]],
  ["no-written-contract", ["书面劳动合同", "订立书面合同", "未订立书面"]],
  ["contract-performance", ["劳动合同", "合同期限", "无固定期限", "续订", "变更劳动合同", "履行劳动合同", "书面合同"]],
  ["probation-disputes", ["试用期", "录用条件", "试用期间"]],
  ["social-insurance", ["社会保险", "社保", "缴费", "养老保险", "医疗保险", "失业保险", "工伤保险", "生育保险"]],
  ["work-injury", ["工伤", "职业病", "伤残", "工亡", "停工留薪", "劳动能力鉴定"]],
  ["female-worker-protection", ["女职工", "孕期", "产假", "哺乳", "三期", "生育"]],
  ["noncompete-confidentiality", ["竞业限制", "竞业", "商业秘密", "保密"]],
  ["labor-dispatch", ["劳务派遣", "派遣单位", "用工单位", "派遣"]],
  ["new-employment-forms", ["新就业形态", "平台", "网约", "骑手", "灵活就业"]],
  ["labor-relationship-recognition", ["劳动关系", "事实劳动关系", "用工主体", "劳动用工", "劳动关系建立"]],
  ["arbitration-limitation", ["仲裁时效", "时效", "一年"]],
  ["arbitration-procedure", ["仲裁", "调解", "诉讼", "人民法院", "裁决", "仲裁委员会", "仲裁机构"]],
];

function topicIdsFor(lawSourceId, provisionText) {
  const matched = [];
  for (const [topic, keywords] of PROVISION_TOPIC_RULES) {
    if (keywords.some((k) => provisionText.includes(k))) {
      matched.push(topic);
    }
  }
  return [...new Set(matched)];
}

/** 法律级 topicIds（整部规范的兜底主题，正文未命中时使用）。 */


/** 关键条文的关键词映射（确定性、手工维护，用于 ADR-020 字段加权：改善关键法条排序）。
 *  key = provisionId（sourceId 前缀去掉后的 baseId + "-" + 条号，与 provisionId 生成规则一致）。
 *  关键词只用于检索加权，不改变条文文本与哈希。 */
const KEYWORD_MAP = {
  "laodonghetongfa-2012-21": ["试用期", "劳动合同期限", "约定试用期"],
  "laodonghetongfa-2012-39": ["试用期间", "录用条件", "解除劳动合同", "不符合录用条件"],
  "laodonghetongfa-2012-47": ["经济补偿", "解除劳动合同", "终止劳动合同", "工作年限"],
  "laodonghetongfa-2012-82": ["二倍工资", "未订立书面劳动合同", "书面劳动合同"],
  "laodonghetongfa-2012-87": ["赔偿金", "违法解除", "经济补偿标准", "解除劳动合同"],
  "laodonghetongfa-2012-38": ["经济补偿", "劳动报酬", "被迫解除"],
  "laodongfa-2018-28": ["经济补偿", "解除劳动合同"],
  "laodongfa-2018-41": ["延长工作时间", "加班", "协商"],
  "laodongfa-2018-44": ["加班费", "加班工资", "延长工作时间", "休息日", "法定休假日"],
  "laodongfa-2018-91": ["赔偿金", "经济补偿", "工资报酬"],
  "laodonghetongfa-shishitiaoli-25": ["赔偿金", "经济补偿", "违法解除"],
  "gongzi-zhifu-zanxing-13": ["加班工资", "加班费", "延长工作时间"],
  "laodonghetongfa-2012-35": ["变更劳动合同", "协商一致", "书面形式"],
  "laodonghetongfa-2012-42": ["孕期", "产期", "哺乳期", "不得解除劳动合同", "女职工"],
  "laodongfa-2018-29": ["孕期", "产期", "哺乳期", "不得解除劳动合同"],
  "nvzhigong-tebieguiding-5": ["孕期", "产期", "哺乳期", "解除劳动合同"],
  "gongshangbaoxian-tiaoli-30": ["工伤", "工伤保险待遇", "医疗费", "停工留薪期"],
  "gongshangbaoxian-tiaoli-33": ["停工留薪期", "原工资福利待遇", "伤残等级"],
  "gongshangbaoxian-tiaoli-62": ["未参加工伤保险", "工伤保险待遇", "用人单位支付", "赔偿"],
};


/** 整部规范的兜底主题（正文未命中规则时使用；人工维护的确定性映射）。 */
const LAW_TOPIC_DEFAULTS = {
  "law-laodongfa-2018": ["working-hours-leave", "overtime-pay", "wage-arrears", "unlawful-termination-compensation", "compensation-and-damages", "probation-disputes", "labor-relationship-recognition", "contract-performance", "arbitration-procedure"],
  "law-laodonghetongfa-2012": ["contract-performance", "double-wage-notice", "probation-disputes", "wage-arrears", "compensation-and-damages", "unlawful-termination-compensation", "noncompete-confidentiality", "labor-dispatch", "arbitration-procedure", "labor-relationship-recognition"],
  "law-zhengyi-tiaojie-zhongcai": ["arbitration-procedure", "arbitration-limitation", "labor-relationship-recognition"],
  "law-shehuibaoxian-2018": ["social-insurance", "work-injury", "wage-arrears", "female-worker-protection"],
  "law-zhiyebingfangzhifa-2018": ["work-injury", "female-worker-protection"],
  "law-gonghuifa-2021": ["labor-relationship-recognition", "contract-performance", "working-hours-leave", "female-worker-protection"],
  "reg-laodonghetongfa-shishitiaoli": ["contract-performance", "double-wage-notice", "compensation-and-damages", "probation-disputes"],
  "reg-gongshangbaoxian-tiaoli": ["work-injury", "social-insurance"],
  "reg-nianxiujia-tiaoli": ["working-hours-leave", "wage-arrears"],
  "reg-nvzhigong-tebieguiding": ["female-worker-protection", "working-hours-leave", "work-injury"],
  "reg-nongmingong-gongzi": ["wage-arrears", "arbitration-procedure", "working-hours-leave"],
  "reg-laodongjiandu-tiaoli": ["arbitration-procedure", "wage-arrears", "working-hours-leave"],
  "reg-jinzhi-tonggong": ["labor-relationship-recognition", "contract-performance"],
  "reg-quanguonianjie-fangjia": ["working-hours-leave"],
  "reg-shebaofei-zhengjiao": ["social-insurance"],
  "reg-shiyebaoxian-tiaoli": ["social-insurance"],
  "reg-guowuyuan-gongzuoshijian": ["working-hours-leave", "overtime-pay"],
  "reg-gongzi-zhifu-zanxing": ["wage-arrears", "overtime-pay", "working-hours-leave"],
  "rule-laodongrenshi-zhongcai-banankuigu": ["arbitration-procedure", "arbitration-limitation"],
  "rule-zhongcai-zuzhiguize": ["arbitration-procedure"],
  "rule-qiyelao-dong-zhengyi-xieshang": ["arbitration-procedure", "working-hours-leave"],
  "rule-zuidigongzi": ["wage-arrears", "working-hours-leave"],
  "rule-gongzi-zhesuan-2022": ["wage-arrears", "overtime-pay", "working-hours-leave"],
  "rule-nianxiujia-shishibanfa": ["working-hours-leave", "wage-arrears"],
  "rule-laowupaiai-zanxing": ["labor-dispatch", "contract-performance", "social-insurance"],
  "rule-shebaofa-shishi": ["social-insurance", "work-injury"],
  "rule-gongshang-rending-banfa": ["work-injury", "social-insurance"],
  "rule-feifa-yonggong-peichang": ["work-injury", "wage-arrears", "labor-relationship-recognition"],
  "rule-laowupaiqian-xukezheng": ["labor-dispatch"],
  "rule-tuoqian-ningxin-dianming": ["wage-arrears", "arbitration-procedure"],
  "jie-laodong-zhengyi-1": ["arbitration-procedure", "arbitration-limitation", "noncompete-confidentiality", "contract-performance", "double-wage-notice", "compensation-and-damages", "labor-relationship-recognition"],
  "jie-laodong-zhengyi-2": ["labor-relationship-recognition", "double-wage-notice", "noncompete-confidentiality", "social-insurance", "compensation-and-damages", "unlawful-termination-compensation", "arbitration-procedure"],
  "jie-gongshangbaoxian-xingzheng": ["work-injury", "social-insurance"],
  "policy-xinjiuyetaidu-labor-rights": ["new-employment-forms", "labor-relationship-recognition", "labor-dispatch", "working-hours-leave"],
};

function sourceTypeFor(sourceId) {
  if (sourceId.startsWith("law-")) return "law";
  if (sourceId.startsWith("reg-")) return "administrative_regulation";
  if (sourceId.startsWith("rule-")) return "departmental_rule";
  if (sourceId.startsWith("jie-")) return "judicial_interpretation";
  if (sourceId.startsWith("policy-")) return "policy";
  return "policy";
}

function main() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
  console.log("[import-laws] 记录数量:", records.length);
  let written = 0;
  const log = [];
  for (const rec of records) {
    const slug = rec.slug;
    const sourceId = rec.sourceId;
    const rawPath = join(RAW_DIR, slug + ".txt");
    if (!existsSync(rawPath)) {
      console.log("[import-laws] SKIP 缺少原文:", sourceId, "(" + slug + ")");
      continue;
    }
    if (!sourceId || !rec.title || !rec.officialUrl) {
      console.log("[import-laws] SKIP 元数据不完整:", JSON.stringify(rec).slice(0, 120));
      continue;
    }
    const rawText = readFileSync(rawPath, "utf8");
    const articles = splitProvisions(rawText);
    if (articles.length < (rec.articleCount ?? 5) && rec.articleCount !== 0) {
      console.log("[import-laws] WARN 条文数量偏少:", sourceId, "(" + articles.length + " < " + rec.articleCount + ")");
    }
    if (articles.length === 0) {
      // 无“第X条”结构的政策文件/通知：以正文提取结果作为单条 provision（如实保留官方正文）。
      const plain = extractFullBody(rawText, rec.title ?? "");
      if (plain.length < 40) {
        console.log("[import-laws] SKIP 无有效内容:", sourceId);
        continue;
      }
      articles.push({ locator: "全文", sourceText: plain.slice(0, 20000) });
      console.log("[import-laws] NOTE 无条文结构，以“全文”收录:", sourceId);
    }
    const provisions = articles.map((a) => {
      const baseId = sourceId.replace(/^(law|reg|rule|jie|policy)-/, "");
      const provisionId = baseId + "-" + articleIndex(a.locator);
      return {
        provisionId,
        locator: a.locator,
        sourceText: a.sourceText,
        topicIds: topicIdsFor(sourceId, a.sourceText),
        keywords: KEYWORD_MAP[provisionId] ?? [],
        textSha256: sha256(a.sourceText),
      };
    });
    const defaultTopics = LAW_TOPIC_DEFAULTS[sourceId] ?? ["contract-performance", "wage-arrears"];
    const lawTopics = [...new Set([...defaultTopics, ...provisions.flatMap((p) => p.topicIds)])];
    const doc = {
      schemaVersion: "2.0.0",
      contentType: "law",
      sourceId,
      title: rec.title,
      sourceType: rec.sourceType === "policy_document" ? "policy" : (rec.sourceType ?? sourceTypeFor(sourceId)),
      issuingAuthority: rec.issuingAuthority ?? "",
      documentNumber: rec.documentNumber ?? null,
      authorityLevel: "A",
      jurisdiction: "全国性",
      officialUrl: rec.officialUrl,
      promulgationDate: rec.promulgationDate ?? null,
      effectiveDate: rec.effectiveDate ?? null,
      expiryDate: null,
      validityStatus: rec.validityStatus ?? "effective",
      supersedes: rec.supersedes ?? [],
      supersededBy: rec.supersededBy ?? [],
      retrievedAt: rec.fetchedAt ?? RETRIEVED_AT,
      contentHash: contentHashOf(provisions),
      verificationStatus: "official_source_verified",
      reviewStatus: "source_verified",
      topicIds: lawTopics,
      provisions,
      validityNotes: rec.fetchNote ? [rec.fetchNote.slice(0, 200)] : [],
    };
    const outPath = join(OUT_DIR, sourceId + ".json");
    writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
    log.push(sourceId + " | " + doc.title + " | " + articles.length + " 条 | " + rec.officialUrl);
    written++;
  }
  console.log("[import-laws] 完成，写出规范总数:", written);
  writeFileSync(join(REPO, "content", "sources", "import-log-laws.md"),
    "# 法律规范导入日志 (2026-08-27)\n\n由 scripts/import-laws.mjs 从官方页面原始文本程序化生成。\n\n" + log.join("\n") + "\n",
    "utf8");
}

/** “第X条”→ 稳定短 id（如 laodongfa-47）。 */
function articleIndex(locator) {
  const num = locator.replace(/[^〇零一二三四五六七八九十百千0-9]/g, "");
  if (/^[0-9]+$/.test(num)) {
    return num;
  }
  const map = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  let total = 0;
  let section = 0;
  for (const ch of num) {
    if (ch in map) {
      section = map[ch];
    } else if (ch === "十") {
      total += (section === 0 ? 1 : section) * 10;
      section = 0;
    } else if (ch === "百") {
      total += (section === 0 ? 1 : section) * 100;
      section = 0;
    } else if (ch === "千") {
      total += (section === 0 ? 1 : section) * 1000;
      section = 0;
    }
  }
  total += section;
  return String(total);
}

main();