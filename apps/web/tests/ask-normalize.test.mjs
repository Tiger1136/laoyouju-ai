// 三态响应归一化与纯展示映射测试（node:test + Node 24 TS type-stripping，无 DOM/无第三方测试库）。
// 覆盖：answered 字段映射、needs_clarification 文案约束、out_of_scope 助手说明、
// 未知 outcome/非法 JSON 不被误判、来源 officialUrl 透传、source_verified 不冒充专业复核。
import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_NOTICE, OUT_OF_SCOPE_MESSAGE } from "@laoyouju/shared";
import { normalizeAskResponse } from "../lib/api.ts";
import {
  CLARIFICATION_FOLLOWUP_HINT,
  NO_SIMILAR_CASE_COPY,
  answerSections,
  citationView,
  clarificationSections,
  groupSources,
  reviewLabel,
  similarCasesOrPlaceholder,
} from "../lib/present.ts";

/** needs_clarification 页面不得出现的表述（审计用；不进入生产构建产物）。 */
const CLARIFICATION_BANNED_PHRASES = ["资料不足", "无法回答", "当前资料未覆盖", "请咨询律师后再说"];

const SOURCE_A = {
  citationRef: "S1",
  sourceId: "struct-test-law-a",
  title: "中华人民共和国劳动合同法",
  sourceType: "law",
  sourceLevel: "A",
  group: "law",
  issuingAuthority: "全国人民代表大会常务委员会",
  jurisdiction: "全国性",
  locator: "第八十七条",
  officialUrl: "https://flk.npc.gov.cn/detail?title=%E5%8A%B3%E5%8A%A8%E5%90%88%E5%90%8C%E6%B3%95",
  validityStatus: "effective",
  publishedDate: "2012-12-28",
  retrievedAt: "2026-08-27",
  excerpt: "（测试）用人单位违反本法规定解除或者终止劳动合同的，应当依照本法第四十七条规定的经济补偿标准的二倍向劳动者支付赔偿金。",
  reviewStatus: "source_verified",
  verificationStatus: "official_source_verified",
};

function answeredFixture() {
  return {
    ok: true,
    apiVersion: "v1",
    requestId: "r-1",
    outcome: "answered",
    topicIds: ["unlawful-termination-compensation"],
    coverage: { scope: "全国性规则", localRulesCovered: false },
    answer: {
      issueIdentification: "（测试）问题识别：违法解除劳动合同。",
      preliminaryConclusion: "（测试）初步结论：可能符合二倍赔偿金规则。",
      applicableLaw: ["《中华人民共和国劳动合同法》第八十七条 [S1]"],
      similarCases: [],
      nextSteps: ["（测试）收集解除通知与工资流水。"],
      evidenceChecklist: ["（测试）劳动合同", "（测试）工资流水"],
      factsToConfirm: ["（测试）入职时间"],
      boundaries: ["（测试）不是律师意见；不预测胜诉率；请核验官方来源。"],
      aiNotice: AI_NOTICE,
    },
    clarification: null,
    outOfScope: null,
    sources: [SOURCE_A],
  };
}

const SOURCE_C_SD = {
  citationRef: "S2",
  sourceId: "sd-ldrs-shenli-jiyao-2019",
  title: "山东省高级人民法院、山东省人力资源和社会保障厅关于审理劳动人事争议案件若干问题会议纪要（2019）",
  sourceType: "local_guidance",
  sourceTypeLabel: "地方裁审指引（省级法院/人社部门）",
  sourceLevel: "C",
  sourceLevelLabel: "C级 · 地方裁审参考",
  group: "local",
  issuingAuthority: "山东省高级人民法院、山东省人力资源和社会保障厅",
  jurisdiction: "山东省",
  locator: "五、关于未约定经济补偿的竞业限制协议的效力问题",
  officialUrl: "https://www.sdcourt.gov.cn/lypyfy/404120/404053/8497525/index.html",
  validityStatus: "effective",
  publishedDate: null,
  retrievedAt: "2026-08-28",
  excerpt: "（测试）山东省关于未约定经济补偿的竞业限制协议效力的裁审口径摘录。",
  reviewStatus: "source_verified",
  verificationStatus: "official_source_verified",
  topicIds: ["noncompete-confidentiality"],
};

/** answered fixture 支持注入 localGuidance 与额外来源（用于分级展示测试）。 */
function answeredWithLocalGuidanceFixture() {
  const f = answeredFixture();
  f.answer.localGuidance = [
    "如争议发生在山东，可参考：《山东省高级人民法院、山东省人力资源和社会保障厅关于审理劳动人事争议案件若干问题会议纪要（2019）》（五、关于未约定经济补偿的竞业限制协议的效力问题）[S2]：山东裁审口径摘录；其他地区裁审口径可能不同。",
  ];
  f.answer.similarCases = ["（测试）参考案例 [S3]"];
  f.sources = [
    SOURCE_A,
    SOURCE_C_SD,
    {
      citationRef: "S3",
      sourceId: "struct-test-case-b2",
      title: "（测试）山东省高级人民法院典型案例",
      sourceType: "case",
      sourceLevel: "B",
      group: "case",
      issuingAuthority: "山东省高级人民法院",
      jurisdiction: "山东省",
      locator: "案例要旨",
      officialUrl: "https://www.sdcourt.gov.cn/struct-test/case",
      validityStatus: "not_applicable",
      publishedDate: "2024-04-29",
      retrievedAt: "2026-08-28",
      excerpt: "（测试）案例要旨摘录",
      reviewStatus: "source_verified",
      verificationStatus: "official_source_verified",
    },
  ];
  return f;
}

function clarificationFixture() {
  return {
    ok: true,
    apiVersion: "v1",
    requestId: "r-2",
    outcome: "needs_clarification",
    topicIds: ["work-injury"],
    coverage: { scope: "全国性规则", localRulesCovered: false },
    answer: null,
    clarification: {
      legalFramework: ["（测试）工伤待遇取决于工伤认定与伤残等级，见《工伤保险条例》。[S1]"],
      possibleConclusions: ["（测试）可能结论A：构成工伤由保险基金/单位支付待遇；可能结论B：不构成工伤则按普通民事途径处理。"],
      keyFactsNeeded: ["（测试）受伤时间、地点、经过"],
      evidenceToPrepare: ["（测试）病历、诊断证明、事故经过证明"],
      aiNotice: AI_NOTICE,
    },
    outOfScope: null,
    sources: [SOURCE_A],
  };
}

function outOfScopeFixture() {
  return {
    ok: true,
    apiVersion: "v1",
    requestId: "r-3",
    outcome: "out_of_scope",
    topicIds: [],
    coverage: { scope: "全国性规则", localRulesCovered: false },
    answer: null,
    clarification: null,
    outOfScope: { message: OUT_OF_SCOPE_MESSAGE, suggestedTopics: ["公司拖欠工资，我应该怎么追讨？"], aiNotice: AI_NOTICE },
    sources: [],
  };
}

// ---------- API 响应严格归一化 ----------

test("answered：合规响应归一化为 answered，八段字段映射正确", () => {
  const state = normalizeAskResponse(200, answeredFixture());
  assert.equal(state.status, "answered");
  assert.equal(state.data?.outcome, "answered");
  const sections = answerSections(state.data);
  const keys = sections.map((s) => s.key);
  assert.deepEqual(keys, ["issueIdentification", "preliminaryConclusion", "applicableLaw", "localGuidance", "similarCases", "nextSteps", "evidenceChecklist", "factsToConfirm", "boundaries"]);
  assert.equal(sections[3].items, null, "无 localGuidance 时不显示空栏目（items 为 null）");
  assert.equal(sections[0].items[0], "（测试）问题识别：违法解除劳动合同。");
  assert.equal(sections[1].items[0], "（测试）初步结论：可能符合二倍赔偿金规则。");
  assert.deepEqual(sections[2].items, ["《中华人民共和国劳动合同法》第八十七条 [S1]"]);
  assert.equal(similarCasesOrPlaceholder(state.data.answer)[0], NO_SIMILAR_CASE_COPY, "无相似案例时必须显示诚实占位文案");
  assert.ok(state.data.sources.some((s) => s.sourceLevel === "A"), "answered 必须含 A 级来源");
});

test("needs_clarification：归一化正确且不出现“资料不足/无法回答/未覆盖/咨询律师后再说”", () => {
  const state = normalizeAskResponse(200, clarificationFixture());
  assert.equal(state.status, "needs_clarification");
  const sections = clarificationSections(state.data);
  assert.ok(sections.framework.length >= 1);
  assert.ok(sections.conclusions.length >= 1);
  const allCopy = JSON.stringify({ ...sections, hint: CLARIFICATION_FOLLOWUP_HINT });
  for (const banned of CLARIFICATION_BANNED_PHRASES) {
    assert.equal(allCopy.includes(banned), false, "不得出现“" + banned + "”");
  }
  assert.ok(CLARIFICATION_FOLLOWUP_HINT.includes("请补充上述信息后重新提交"), "必须包含明确操作提示");
});

test("out_of_scope：显示劳动争议助手固定说明与可点击示例（来自服务端固定文案）", () => {
  const state = normalizeAskResponse(200, outOfScopeFixture());
  assert.equal(state.status, "out_of_scope");
  assert.ok(state.data?.outOfScope?.message.includes("劳动争议法律助手"), "必须使用劳动争议助手固定文案");
  assert.ok(state.data.outOfScope.suggestedTopics.length >= 1, "必须提供可改问示例");
  assert.equal(state.data.sources.length, 0, "out_of_scope 不展示来源列表");
});

test("未知 outcome / 非法 JSON / 契约失败的成功响应 → 稳定 error（绝不当作 out_of_scope）", () => {
  const unknownOutcome = { ...answeredFixture(), outcome: "something_else", answer: null, clarification: null, outOfScope: null };
  const s1 = normalizeAskResponse(200, unknownOutcome);
  assert.equal(s1.status, "error");
  assert.notEqual(s1.status, "out_of_scope");

  const invalidShape = { ok: true, apiVersion: "v1", outcome: "answered" };
  const s2 = normalizeAskResponse(200, invalidShape);
  assert.equal(s2.status, "error");

  const s3 = normalizeAskResponse(200, "not-json");
  assert.equal(s3.status, "error");
  assert.ok(s3.errorMessage.length > 0, "必须给出稳定错误提示");

  const s4 = normalizeAskResponse(500, { error: { code: "WHATEVER", message: "内部错误", retryable: true } });
  assert.equal(s4.status, "error");
  assert.ok(!JSON.stringify(s4).includes("stack"), "不得泄露内部信息");
});

test("API 错误状态映射：503/429/502/400 稳定提示；错误响应结构非法也不崩溃", () => {
  const cases = [
    [503, "SERVICE_NOT_READY", "问答服务尚未配置密钥"],
    [503, "RATE_LIMITED", "请求过于频繁"],
    [502, "UPSTREAM_ERROR", "生成服务暂时不可用"],
    [400, "INVALID_REQUEST", "问题不符合要求"],
  ];
  for (const [status, code, expected] of cases) {
    const s = normalizeAskResponse(status, { ok: false, apiVersion: "v1", requestId: "r", error: { code, message: "x", retryable: false } });
    assert.equal(s.status, "error");
    assert.ok(s.errorMessage.includes(expected), `应包含稳定提示: ${expected}`);
  }
  const bad = normalizeAskResponse(500, { weird: true });
  assert.equal(bad.status, "error");
  assert.ok(bad.errorMessage.length > 0);
});

// ---------- 来源展示映射 ----------

test("来源卡片：officialUrl 原样透传（官方链接使用 officialUrl）", () => {
  const v = citationView(SOURCE_A);
  assert.equal(v.url, SOURCE_A.officialUrl);
  assert.equal(v.ref, "S1");
  assert.equal(v.title, "中华人民共和国劳动合同法");
  assert.equal(v.locator, "第八十七条");
});

test("source_verified 显示“已核对官方来源，尚待专业复核”，不得显示“已通过专业复核”", () => {
  assert.equal(reviewLabel("source_verified"), "已核对官方来源，尚待专业复核");
  assert.equal(reviewLabel("legal_reviewed"), "已通过专业复核");
  const v = citationView({ ...SOURCE_A, reviewStatus: "source_verified" });
  assert.ok(!v.reviewLabel.includes("已通过专业复核"), "source_verified 不得冒充专业复核");
  assert.notEqual(v.reviewLabel, "已通过专业复核");
});

test("来源按 国家法律/司法解释/地方裁审参考/官方案例/补充线索 分组（C 级地方指引单独分组）", () => {
  const groups = groupSources([
    SOURCE_A,
    { ...SOURCE_A, citationRef: "S2", sourceType: "judicial_interpretation", sourceLevel: "A", group: "judicial" },
    SOURCE_C_SD,
    { ...SOURCE_A, citationRef: "S4", sourceType: "case", sourceLevel: "B", group: "case" },
    { ...SOURCE_A, citationRef: "S5", sourceType: "policy", sourceLevel: "C", group: "supplement", reviewStatus: "draft" },
  ]);
  assert.deepEqual(groups.map((g) => g.label), [
    "国家法律法规与司法解释（A 级）",
    "司法解释与仲裁程序（A 级）",
    "地方裁审参考（C 级，仅山东省）",
    "官方案例（B 级，类案参考）",
    "补充检索线索（C 级，待核验）",
  ]);
  assert.equal(groups[2].items[0].citationRef, "S2");
  assert.equal(groups[2].items[0].sourceLevel, "C");
});

test("合规成功响应在契约层面通过（AskSuccessResponseSchema 派生字段可枚举）", async () => {
  // 使用共享 schema 确认 present 模块接受的 fixture 与真实契约一致。
  const { AskSuccessResponseSchema } = await import("@laoyouju/shared");
  assert.equal(AskSuccessResponseSchema.safeParse(answeredFixture()).success, true);
  assert.equal(AskSuccessResponseSchema.safeParse(clarificationFixture()).success, true);
  assert.equal(AskSuccessResponseSchema.safeParse(outOfScopeFixture()).success, true);
});
// ---------- Phase 7C-1：来源层级展示（A/B/C 文字标签、localGuidance 独立栏目） ----------

test("localGuidance 作为独立栏目出现在 适用法律 与 相似官方案例 之间（含 C 级层级标题）", () => {
  const data = normalizeAskResponse(200, answeredWithLocalGuidanceFixture()).data;
  const sections = answerSections(data);
  const keys = sections.map((s) => s.key);
  assert.deepEqual(keys, ["issueIdentification", "preliminaryConclusion", "applicableLaw", "localGuidance", "similarCases", "nextSteps", "evidenceChecklist", "factsToConfirm", "boundaries"]);
  const local = sections.find((s) => s.key === "localGuidance");
  assert.ok(local.heading.includes("山东地区裁审参考"), "必须是山东地区裁审参考栏目");
  assert.ok(local.heading.includes("C 级"), "必须标注 C 级");
  assert.ok(local.heading.includes("仅适用于山东省"), "必须明确仅适用山东省");
  assert.ok(local.items[0].includes("如争议发生在山东"), "未知地点必须条件化表述");
  assert.ok(local.items[0].includes("其他地区裁审口径可能不同"), "必须声明地区差异");
  // 无 localGuidance 时不渲染空栏目
  const empty = answerSections(normalizeAskResponse(200, answeredFixture()).data);
  assert.equal(empty.find((s) => s.key === "localGuidance").items, null);
});

test("来源卡片带分级/类型文字标签（sourceLevelLabel/sourceTypeLabel）", () => {
  const v = citationView(SOURCE_C_SD);
  assert.equal(v.sourceLevelLabel, "C级 · 地方裁审参考");
  assert.equal(v.sourceTypeLabel, "地方裁审指引（省级法院/人社部门）");
  assert.equal(v.jurisdiction, "山东省");
  // 旧载荷没有标签字段时按共享标签映射回退（不得空白）
  const v2 = citationView(SOURCE_A);
  assert.equal(v2.sourceLevelLabel, "A级 · 全国性法律规范");
  assert.equal(v2.sourceTypeLabel, "法律");
});

test("localGuidance 引用可在 sources 中解析且来源为 C 级地方指引（契约级）", async () => {
  const { AskSuccessResponseSchema } = await import("@laoyouju/shared");
  const parsed = AskSuccessResponseSchema.safeParse(answeredWithLocalGuidanceFixture());
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? null));
  const data = parsed.data;
  const refToSource = new Map(data.sources.map((s) => [s.citationRef, s]));
  for (const item of data.answer.localGuidance) {
    for (const m of item.matchAll(/\[S(\d+)\]/g)) {
      const s = refToSource.get("S" + m[1]);
      assert.ok(s, "引用必须可解析");
      assert.equal(s.sourceLevel, "C");
      assert.equal(s.sourceType, "local_guidance");
      assert.equal(s.jurisdiction, "山东省");
    }
  }
});
