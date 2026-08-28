import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const RAW_LAWS = path.join(REPO, "content", "raw", "laws");
const OUT_LAWS = path.join(REPO, "content", "laws");

// 确定性主题关键词（人工维护、可审计；与方法/案例规则同风格；只对含关键词的条文标注）。
const TOPIC_RULES = [
  ["overtime-pay", ["加班", "延长工作时间", "工时标准"]],
  ["wage-arrears", ["欠薪", "拖欠工资", "劳动报酬", "工资报酬", "追索劳动报酬", "克扣工资", "未足额支付"]],
  ["unlawful-termination-compensation", ["违法解除", "解除劳动合同", "终止劳动合同", "辞退", "经济补偿", "被迫解除"]],
  ["compensation-and-damages", ["赔偿金", "经济补偿", "代通知金"]],
  ["double-wage-notice", ["二倍工资", "双倍工资"]],
  ["no-written-contract", ["书面劳动合同", "订立书面劳动合同", "未签订"]],
  ["noncompete-confidentiality", ["竞业限制", "竞业禁止", "保密义务", "商业秘密"]],
  ["social-insurance", ["社会保险", "社保", "缴费", "工伤保险待遇", "失业保险", "养老保险", "医疗保险"]],
  ["work-injury", ["工伤", "工伤保险", "工亡", "停工留薪", "职业病", "伤残"]],
  ["labor-relationship-recognition", ["劳动关系", "用工事实", "混同用工", "关联公司", "承包", "挂靠", "转包", "分包"]],
  ["new-employment-forms", ["新就业形态", "平台", "骑手", "配送", "网络主播", "灵活就业"]],
  ["labor-dispatch", ["劳务派遣", "派遣单位", "用工单位", "劳务外包"]],
  ["arbitration-procedure", ["仲裁", "举证责任", "管辖", "裁审衔接", "仲裁前置", "裁决", "终局裁决"]],
  ["arbitration-limitation", ["时效"]],
  ["probation-disputes", ["试用期", "录用条件"]],
  ["contract-performance", ["无固定期限", "固定期限", "续签", "调岗", "降薪", "变更劳动合同", "服务期", "违约金", "岗位调整"]],
  ["working-hours-leave", ["工作时间", "休息休假", "年休假", "带薪年休假", "病假", "加班"]],
  ["female-worker-protection", ["女职工", "怀孕", "孕期", "产期", "哺乳期", "三期", "生育"]],
];

function canonicalize(s) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000\u200b\u00a0]+/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
function computeTextSha256(text) {
  return createHash("sha256").update(canonicalize(text), "utf8").digest("hex");
}
function inferTopics(text) {
  const c = canonicalize(text);
  const out = [];
  for (const [topic, kws] of TOPIC_RULES) {
    if (kws.some((k) => c.includes(canonicalize(k)))) out.push(topic);
  }
  return out.length > 0 ? [...new Set(out)] : ["arbitration-procedure"];
}

const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(REPO, "content", "sources", "probe", "sd-guidance.json"), "utf8"),
);

const CN_NUM = new Map(
  ["一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","二十一","二十二","二十三","二十四","二十五","二十六","二十七","二十八","二十九","三十"].map((v, i) => [v, i + 1]),
);

function splitItems(text, markerRe) {
  const markers = [];
  let m;
  const re = new RegExp(markerRe, "gm");
  while ((m = re.exec(text)) !== null) {
    markers.push({ start: m.index, cn: m[1] });
  }
  const items = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].start;
    const end = i + 1 < markers.length ? markers[i + 1].start : text.length;
    const seg = text.slice(start, end).replace(/\s+$/g, "");
    const nl = seg.indexOf("\n");
    const heading = (nl >= 0 ? seg.slice(0, nl) : seg).replace(/[\s\u3000]+/g, "").trim();
    const body = (nl >= 0 ? seg.slice(nl + 1) : "").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
    items.push({ cn: markers[i].cn, num: CN_NUM.get(markers[i].cn) ?? items.length + 1, heading, body });
  }
  return items.filter((it) => it.body.length > 0);
}

if (process.argv.includes("--dryrun")) {
  for (const doc of MANIFEST) {
    const raw = fs.readFileSync(path.join(RAW_LAWS, doc.rawFile), "utf8");
    const items = splitItems(raw, doc.itemRegex);
    console.log("===== " + doc.sourceId + " items=" + items.length);
    for (const it of items) {
      const topics = inferTopics(it.heading + it.body);
      console.log("  #" + it.num + " | " + it.heading.slice(0, 70) + " | len=" + it.body.length + " | topics=" + topics.join(","));
    }
  }
  process.exit(0);
}

for (const doc of MANIFEST) {
  const raw = fs.readFileSync(path.join(RAW_LAWS, doc.rawFile), "utf8");
  const items = splitItems(raw, doc.itemRegex);
  const provisions = items.map((it) => {
    const sourceText = it.heading + "。" + it.body;
    const topics = doc.topicsByItem?.[it.num] ?? inferTopics(it.heading + it.body);
    return {
      provisionId: doc.sourceId + "-p" + String(it.num).padStart(2, "0"),
      locator: it.heading.slice(0, 200),
      sourceText,
      topicIds: topics,
      keywords: [],
      textSha256: computeTextSha256(sourceText),
    };
  });
  // 与 packages/retrieval validate.computeContentHash 一致：规范化后取 SHA-256。
  const contentHash = computeTextSha256(provisions.map((p) => p.sourceText).join("\n"));
  const docTopicIds = [...new Set(provisions.flatMap((p) => p.topicIds))];
  const law = {
    schemaVersion: "2.0.0",
    contentType: "law",
    sourceId: doc.sourceId,
    title: doc.title,
    sourceType: "local_guidance",
    issuingAuthority: doc.issuingAuthority,
    documentNumber: null,
    authorityLevel: "C",
    jurisdiction: "山东省",
    officialUrl: doc.officialUrl,
    promulgationDate: doc.promulgationDate,
    effectiveDate: doc.effectiveDate,
    expiryDate: null,
    validityStatus: "effective",
    supersedes: [],
    supersededBy: [],
    retrievedAt: "2026-08-28",
    contentHash,
    verificationStatus: "official_source_verified",
    reviewStatus: "source_verified",
    topicIds: docTopicIds,
    provisions,
    validityNotes: doc.validityNotes ?? [],
  };
  fs.writeFileSync(path.join(OUT_LAWS, doc.sourceId + ".json"), JSON.stringify(law, null, 2) + "\n", "utf8");
  console.log("[import-sd-guidance] wrote " + doc.sourceId + " provisions=" + provisions.length + " topics=" + docTopicIds.join(","));
}
