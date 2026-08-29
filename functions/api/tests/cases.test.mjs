// Phase 7C-2：案例证据确定性组装单元测试（合成内容库，不绑定真实 sourceId）。
// 运行：node tests/cases.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, queryIndex, MIN_RELEVANCE_SCORE } from "@laoyouju/retrieval";
import {
  MAX_SIMILAR_CASE_ITEMS,
  buildSimilarCaseItem,
  caseBoundaryNote,
  caseRegionGroup,
  chooseSimilarCases,
  collectSimilarCaseCandidates,
  evaluateCopresenceContract,
  isNoCasePlaceholder,
  jurisdictionMatchesLocation,
  normalizeRegionName,
  rankCaseCandidates,
  regionTokens,
} from "../dist/cases.js";

const SHA256 = "a".repeat(64);

function mkLaw(sourceId, title) {
  return {
    schemaVersion: "2.0.0",
    contentType: "law",
    sourceId,
    title,
    sourceType: "law",
    issuingAuthority: "全国人民代表大会常务委员会",
    documentNumber: null,
    authorityLevel: "A",
    jurisdiction: "全国性",
    officialUrl: "https://example.gov.cn/law/" + sourceId,
    promulgationDate: "2020-01-01",
    effectiveDate: "2020-01-01",
    expiryDate: null,
    validityStatus: "effective",
    supersedes: [],
    supersededBy: [],
    retrievedAt: "2026-08-01",
    contentHash: SHA256,
    verificationStatus: "official_source_verified",
    reviewStatus: "source_verified",
    topicIds: ["noncompete-confidentiality", "compensation-and-damages"],
    validityNotes: [],
    provisions: [
      {
        provisionId: sourceId + "-p1",
        locator: "第一条",
        sourceText: title + "：用人单位与劳动者可以约定竞业限制条款并给予经济补偿。",
        topicIds: ["noncompete-confidentiality"],
        keywords: ["竞业限制", "经济补偿"],
        textSha256: SHA256,
      },
    ],
  };
}

function mkCase(sourceId, jur, topics, about) {
  return {
    schemaVersion: "2.0.0",
    contentType: "case",
    sourceId,
    caseId: sourceId,
    title: about + "——某某竞业限制纠纷案",
    publishingAuthority: "某某法院",
    caseType: "typical_case",
    publicationDate: "2024-01-01",
    jurisdiction: jur,
    authorityLevel: "B",
    officialUrl: "https://example.gov.cn/case/" + sourceId,
    sourceCheckedAt: "2026-08-01",
    retrievedAt: "2026-08-01",
    verificationStatus: "official_source_verified",
    reviewStatus: "source_verified",
    topicIds: topics,
    issues: [about],
    keyFacts: "劳动者与用人单位订立劳动合同，劳动合同中约定了竞业限制条款与保密条款，约定了竞业限制经济补偿的支付标准与支付方式；用人单位按月向劳动者支付经济补偿款；劳动者离职后从事了与原用人单位具有竞争关系的工作，双方就竞业限制经济补偿与违约金发生争议。",
    holding: "人民法院审理认为：竞业限制经济补偿的标准与支付方式应当依照劳动合同的约定与法律规定处理；用人单位未按约定支付竞业限制经济补偿的，劳动者可以依据法律规定主张权利；竞业限制条款效力的认定应当结合劳动者是否属于负有保密义务的人员范围综合判断。" + about + "。",
    reasoning: "根据《中华人民共和国劳动合同法》第二十三条、第二十四条关于竞业限制与保密义务的规定，用人单位与劳动者约定竞业限制条款的，应当在解除或者终止劳动合同后按月给予劳动者经济补偿；未约定经济补偿或者经济补偿标准不明确的，应当按照相关规定处理；竞业限制的期限不得超过二年；人民法院应当综合审查竞业限制范围、人员范围与经济补偿的约定与履行情况作出裁判。",
    citedProvisions: [],
    documentNumber: null,
  };
}

// 合成内容库：1 部法律 + 4 个案例（同主题、不同地域）
const CASES = [
  mkCase("fx-case-sd-001", "山东省", ["noncompete-confidentiality", "compensation-and-damages"], "未约定竞业限制经济补偿的协议效力"),
  mkCase("fx-case-national-001", "全国性", ["noncompete-confidentiality"], "最高法关于竞业限制补偿纠纷的裁判规则"),
  mkCase("fx-case-cy-001", "四川省、重庆市", ["noncompete-confidentiality"], "川渝地区竞业限制人员范围认定"),
  mkCase("fx-case-other-topic-001", "山东省", ["work-injury"], "工伤认定与待遇"),
];
const index = buildIndex([mkLaw("fx-law-001", "中华人民共和国劳动合同法（测试）")], CASES);
const qForTopic = () => "竞业限制经济补偿 违约金 保密义务 人民法院 劳动合同法 裁判 竞业条款";

test("地域归一化：省/市/自治区/多地域/城市映射", () => {
  assert.equal(normalizeRegionName("山东省"), "山东");
  assert.equal(normalizeRegionName("天津市"), "天津");
  assert.equal(normalizeRegionName("新疆维吾尔自治区"), "新疆");
  assert.equal(normalizeRegionName("广西壮族自治区"), "广西");
  assert.equal(normalizeRegionName("济南"), "山东");
  assert.deepEqual(regionTokens("四川省、重庆市"), ["四川", "重庆"]);
  assert.deepEqual(regionTokens("全国性"), ["全国性"]);
  assert.equal(jurisdictionMatchesLocation("山东省", "山东"), true);
  assert.equal(jurisdictionMatchesLocation("山东省", "济南"), true);
  assert.equal(jurisdictionMatchesLocation("山东省", "北京"), false);
  assert.equal(jurisdictionMatchesLocation("全国性", "山东"), false);
  assert.equal(jurisdictionMatchesLocation("四川省、重庆市", "重庆"), true);
  assert.equal(jurisdictionMatchesLocation("四川省、重庆市", "四川"), true);
});

test("地域分组：same/national/other（地域只作偏好，不作硬过滤）", () => {
  assert.equal(caseRegionGroup("山东省", "山东"), "same");
  assert.equal(caseRegionGroup("全国性", "山东"), "national");
  assert.equal(caseRegionGroup("河北省", "山东"), "other");
  assert.equal(caseRegionGroup("山东省", undefined), "other");
});

test("排序：同地域 > 全国性 > 其他省份；同组按分数降序", () => {
  const rank = (...cs) => cs.map((c, i) => ({ docId: "d" + i, chunkId: "d" + i, kind: "case", title: "t", locator: "l", text: "text", officialUrl: "u", validityStatus: "not_applicable", reviewStatus: "source_verified", verificationStatus: "official_source_verified", sourceLevel: "B", jurisdiction: c.jur, publishedDate: "2024-01-01", topicIds: ["noncompete-confidentiality"], keywords: [], score: c.score }));
  const cs = [
    rank({ jur: "河北省", score: 130 })[0],
    rank({ jur: "全国性", score: 120 })[0],
    rank({ jur: "山东省", score: 90 })[0],
  ];
  const ordered = rankCaseCandidates(cs, ["noncompete-confidentiality"], "山东");
  assert.equal(ordered[0].chunk.jurisdiction, "山东省", "同地域案例应优先");
  assert.equal(ordered[1].chunk.jurisdiction, "全国性", "全国性其次");
  assert.equal(ordered[2].chunk.jurisdiction, "河北省", "其他省份最后");
});

test("候选收集：主检索池优先；补充检索按 topic 覆盖（同地域案例即使池外也能召回）", () => {
  // 主池：只有全国性与川渝案例；补充检索应召回山东省案例。
  const poolCases = CASES.slice(0, 2).map((c) => {
    const [chunk] = queryIndex(index, "竞业限制 经济补偿 裁判规则 法院", 5, "noncompete-confidentiality").filter((r) => r.docId === c.sourceId);
    return chunk ?? queryIndex(index, c.title, 5, "noncompete-confidentiality")[0];
  }).filter(Boolean);
  const candidates = collectSimilarCaseCandidates(index, ["noncompete-confidentiality"], poolCases, qForTopic);
  const ids = candidates.map((c) => c.docId);
  assert.ok(ids.includes("fx-case-sd-001"), "补充检索应召回同地域案例; got=" + ids.join(","));
  assert.ok(ids.includes("fx-case-national-001"));
  // 不同主题案例不得进入候选
  assert.ok(!ids.includes("fx-case-other-topic-001"), "无关主题案例不得进入候选");
});

test("排序结果：山东地点 → 山东省案例第一、全国性案例第二", () => {
  const candidates = collectSimilarCaseCandidates(index, ["noncompete-confidentiality"], [], qForTopic);
  const ranked = rankCaseCandidates(candidates, ["noncompete-confidentiality"], "山东");
  assert.equal(ranked[0].chunk.docId, "fx-case-sd-001");
  assert.equal(ranked[1].chunk.docId, "fx-case-national-001");
});

test("边界说明：同地域/全国性/外地三类文案（外地必须声明实际地域与外地类案参考）", () => {
  assert.ok(caseBoundaryNote("山东省", "山东").includes("山东省官方案例"));
  assert.ok(caseBoundaryNote("全国性", "山东").includes("全国性参考案例"));
  const other = caseBoundaryNote("河北省", "山东");
  assert.ok(other.includes("河北省"), "外地案例必须显示实际适用地域");
  assert.ok(other.includes("外地类案仅供参考") && other.includes("各地裁审口径可能不同"));
});

test("similarCases 条目：确定性文案含引用、要旨摘录与边界说明", () => {
  const c = CASES[0];
  const chunk = {
    docId: c.sourceId, chunkId: c.sourceId, kind: "case", title: c.title, locator: "案例要旨",
    text: c.title + "。" + c.keyFacts + "。" + c.holding + "。" + c.reasoning,
    officialUrl: c.officialUrl, validityStatus: "not_applicable", reviewStatus: c.reviewStatus,
    verificationStatus: c.verificationStatus, sourceLevel: "B", jurisdiction: c.jurisdiction,
    publishedDate: c.publicationDate, topicIds: c.topicIds, keywords: [], score: 100,
  };
  const item = buildSimilarCaseItem(chunk, "S9", "山东");
  assert.ok(item.startsWith("《" + c.title + "》[S9]："));
  assert.ok(item.includes("山东省官方案例"));
  assert.ok(item.length > 50);
});

test("chooseSimilarCases：模型写占位时引擎确定性补充（最多 2 条，主题交集）", () => {
  const chosen = chooseSimilarCases({
    modelItems: ["未找到可核验的高度相似官方案例。"],
    evidence: [],
    index,
    topics: ["noncompete-confidentiality"],
    pool: [],
    location: "山东",
    queryForTopic: qForTopic,
  });
  assert.ok(chosen.chunks.length >= 1 && chosen.chunks.length <= MAX_SIMILAR_CASE_ITEMS);
  assert.equal(chosen.chunks[0].docId, "fx-case-sd-001");
  assert.equal(chosen.supplemented, true);
});

test("chooseSimilarCases：模型引用有效且与主题相关时优先保留（验证引用有效性）", () => {
  const nationalChunk = queryIndex(index, "全国性 竞业限制 补偿", 20, "noncompete-confidentiality").find((r) => r.kind === "case" && r.docId === "fx-case-national-001");
  const chosen = chooseSimilarCases({
    modelItems: ["《最高法案例》要旨 [S3]：……"],
    evidence: [{ chunk: nationalChunk, ref: "S3" }],
    index,
    topics: ["noncompete-confidentiality"],
    pool: [],
    location: "山东",
    queryForTopic: qForTopic,
  });
  assert.equal(chosen.chunks[0].docId, nationalChunk.docId, "模型有效引用优先保留");
  assert.ok(chosen.chunks.length >= 1 && chosen.chunks.length <= 2);
});

test("chooseSimilarCases：模型引用了与主题无关的案例时被过滤（不放大不相关案例）", () => {
  const [injuryChunk] = queryIndex(index, "工伤 认定", 5, "work-injury");
  const chosen = chooseSimilarCases({
    modelItems: ["《工伤案例》要旨 [S3]：……"],
    evidence: [{ chunk: injuryChunk, ref: "S3" }],
    index,
    topics: ["noncompete-confidentiality"],
    pool: [],
    location: "山东",
    queryForTopic: qForTopic,
  });
  assert.ok(!chosen.chunks.some((c) => c.docId === injuryChunk.docId), "主题无关引用应被过滤");
});

test("占位识别：未找到/暂未 等文案", () => {
  assert.equal(isNoCasePlaceholder("未找到可核验的高度相似官方案例。"), true);
  assert.equal(isNoCasePlaceholder("暂未找到高相似案例"), true);
  assert.equal(isNoCasePlaceholder("《某案例》要旨 [S1]：……"), false);
});

test("共现契约：answered+主题+合格候选 → applied 且 satisfied；无候选/非answered → 不强制", () => {
  const [good] = queryIndex(index, "竞业限制 补偿", 5, "noncompete-confidentiality");
  const c1 = evaluateCopresenceContract({ outcome: "answered", topics: ["noncompete-confidentiality"], qualifiedCandidates: [good] });
  assert.equal(c1.applied, true);
  assert.equal(c1.satisfied, true);
  const c2 = evaluateCopresenceContract({ outcome: "answered", topics: ["noncompete-confidentiality"], qualifiedCandidates: [] });
  assert.equal(c2.applied, false, "无合格候选时不强制（允许诚实占位）");
  const c3 = evaluateCopresenceContract({ outcome: "needs_clarification", topics: ["noncompete-confidentiality"], qualifiedCandidates: [good] });
  assert.equal(c3.applied, false, "非 answered 不强制");
});

test("确定性：相同输入两次运行时排序与选择完全一致", () => {
  const run = () => collectSimilarCaseCandidates(index, ["noncompete-confidentiality"], [], qForTopic).map((c) => c.docId + "|" + c.score.toFixed(4));
  assert.deepEqual(run(), run());
});

test("负向：低于相关性阈值的候选不进入（合成弱相关案例）", () => {
  const weak = { docId: "fx-weak-001", chunkId: "fx-weak-001", kind: "case", title: "弱相关案例", locator: "案例要旨", text: "房租物业费缴纳", officialUrl: "https://example.cn/x", validityStatus: "not_applicable", reviewStatus: "source_verified", verificationStatus: "official_source_verified", sourceLevel: "B", jurisdiction: "山东省", publishedDate: "2024-01-01", topicIds: ["noncompete-confidentiality"], keywords: [], score: MIN_RELEVANCE_SCORE - 0.01 };
  const chosen = rankCaseCandidates([weak], ["noncompete-confidentiality"], "山东");
  assert.ok(chosen.length === 0 || chosen[0].chunk.topicIds.includes("noncompete-confidentiality"), "弱相关候选不被放大");
  const fromCollect = collectSimilarCaseCandidates(index, ["noncompete-confidentiality"], [weak], qForTopic);
  assert.ok(!fromCollect.some((c) => c.docId === weak.docId), "低于门槛不得进入");
});