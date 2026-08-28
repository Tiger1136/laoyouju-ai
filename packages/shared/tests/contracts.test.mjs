// 共享契约运行时校验测试（Node 内置 test runner；运行前需先 build 生成 dist）—— Phase 7A v2。
// 成功响应 fixture 为“结构测试专用”中性占位，不代表任何真实法律结论。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_NOTICE,
  API_VERSION,
  OUT_OF_SCOPE_MESSAGE,
  QUESTION_MAX_LENGTH,
  AnswerSchema,
  ApiErrorResponseSchema,
  AskRequestSchema,
  AskSuccessResponseSchema,
  ClarificationSchema,
  OutOfScopeSchema,
  SourceCitationSchema,
} from "../dist/index.js";

// ---------- 结构测试专用中性 fixture（严禁视为法律结论） ----------
const CITATION_A = {
  citationRef: "S1",
  sourceId: "struct-test-law-a",
  title: "（结构测试）示例法律文件标题",
  sourceType: "law",
  sourceLevel: "A",
  group: "law",
  issuingAuthority: "（结构测试）示例发文机关",
  jurisdiction: "全国性",
  locator: "（结构测试）示例条款",
  officialUrl: "https://example.com/struct-test/a",
  validityStatus: "effective",
  publishedDate: "2020-01-01",
  retrievedAt: "2026-08-27",
  excerpt: "（结构测试）示例条文摘录",
  reviewStatus: "source_verified",
  verificationStatus: "official_source_verified",
};

const CITATION_B = {
  citationRef: "S2",
  sourceId: "struct-test-case-b",
  title: "（结构测试）示例案例标题",
  sourceType: "case",
  sourceLevel: "B",
  group: "case",
  issuingAuthority: "（结构测试）示例法院",
  jurisdiction: "全国性",
  locator: "（结构测试）示例裁判要旨",
  officialUrl: "https://example.com/struct-test/b",
  validityStatus: "not_applicable",
  publishedDate: null,
  retrievedAt: "2026-08-27",
  excerpt: "（结构测试）示例案例规则摘录",
  reviewStatus: "source_verified",
  verificationStatus: "official_source_verified",
};

function validAnswerFixture() {
  return {
    issueIdentification: "（结构测试）问题识别与争议焦点",
    preliminaryConclusion: "（结构测试）初步结论占位",
    applicableLaw: ["（结构测试）适用法律条文 [S1]"],
    similarCases: ["（结构测试）相似案例 [S2]"],
    nextSteps: ["（结构测试）下一步行动占位"],
    evidenceChecklist: ["（结构测试）证据清单占位"],
    factsToConfirm: ["（结构测试）尚需确认事实占位"],
    boundaries: ["（结构测试）信息边界占位"],
    aiNotice: AI_NOTICE,
  };
}

function validClarificationFixture() {
  return {
    legalFramework: ["（结构测试）法律框架 [S1]"],
    possibleConclusions: ["（结构测试）可能结论A", "（结构测试）可能结论B"],
    keyFactsNeeded: ["（结构测试）关键事实占位"],
    evidenceToPrepare: ["（结构测试）证据准备占位"],
    aiNotice: AI_NOTICE,
  };
}

function validSuccessFixture(overrides = {}) {
  return {
    ok: true,
    apiVersion: API_VERSION,
    requestId: "struct-test-request-id",
    outcome: "answered",
    topicIds: ["wage-arrears"],
    coverage: { scope: "全国性规则", localRulesCovered: false },
    answer: validAnswerFixture(),
    clarification: null,
    outOfScope: null,
    sources: [CITATION_A, CITATION_B],
    ...overrides,
  };
}

// ---------- AskRequest ----------

test("合法 question 通过且被 trim", () => {
  const result = AskRequestSchema.safeParse({ question: "  公司拖欠工资怎么办？  " });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.question, "公司拖欠工资怎么办？");
  }
});

test("少于 2 字拒绝", () => {
  const result = AskRequestSchema.safeParse({ question: "a" });
  assert.equal(result.success, false);
});

test("超过 500 字拒绝", () => {
  const result = AskRequestSchema.safeParse({ question: "a".repeat(QUESTION_MAX_LENGTH + 1) });
  assert.equal(result.success, false);
});

test("空白字符串拒绝", () => {
  for (const blank of ["", "   ", "\t\n"]) {
    const result = AskRequestSchema.safeParse({ question: blank });
    assert.equal(result.success, false, "空白输入应被拒绝: " + JSON.stringify(blank));
  }
});

test("未知字段拒绝", () => {
  const result = AskRequestSchema.safeParse({ question: "公司拖欠工资怎么办？", userId: "u-1" });
  assert.equal(result.success, false);
});

test("question 非字符串拒绝", () => {
  const result = AskRequestSchema.safeParse({ question: 123 });
  assert.equal(result.success, false);
});

// ---------- SourceCitation ----------

test("合法来源通过（含 A/B 分级、分组、核验状态、日期）", () => {
  assert.equal(SourceCitationSchema.safeParse(CITATION_A).success, true);
  assert.equal(SourceCitationSchema.safeParse(CITATION_B).success, true);
});

test("sourceId 过长/格式非法拒绝", () => {
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, sourceId: "x".repeat(65) }).success, false);
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, sourceId: "-bad-start" }).success, false);
});

test("citationRef 非法/缺失拒绝", () => {
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, citationRef: "X1" }).success, false);
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, citationRef: "S0" }).success, false);
});

test("officialUrl 非 HTTPS 拒绝", () => {
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, officialUrl: "http://example.com/a" }).success, false);
});

test("sourceLevel 只允许 A/B/C/D", () => {
  for (const level of ["A", "B", "C", "D"]) {
    assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, sourceLevel: level }).success, true);
  }
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, sourceLevel: "E" }).success, false);
});

test("verificationStatus 只允许官方核验/人工复核/未核验", () => {
  for (const v of ["official_source_verified", "human_verified", "unverified"]) {
    assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, verificationStatus: v }).success, true);
  }
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, verificationStatus: "machine" }).success, false);
});

// ---------- Answer（八段结构） ----------

test("合法回答通过", () => {
  assert.equal(AnswerSchema.safeParse(validAnswerFixture()).success, true);
});

test("缺少任一段拒绝", () => {
  const fields = ["issueIdentification", "preliminaryConclusion", "applicableLaw", "similarCases", "nextSteps", "evidenceChecklist", "factsToConfirm", "boundaries", "aiNotice"];
  for (const field of fields) {
    const fixture = validAnswerFixture();
    delete fixture[field];
    assert.equal(AnswerSchema.safeParse(fixture).success, false, "缺少 " + field + " 应被拒绝");
  }
});

// ---------- Clarification / OutOfScope ----------

test("合法澄清结构通过", () => {
  assert.equal(ClarificationSchema.safeParse(validClarificationFixture()).success, true);
});

test("澄清结构缺失任一段拒绝", () => {
  const fields = ["legalFramework", "possibleConclusions", "keyFactsNeeded", "evidenceToPrepare"];
  for (const field of fields) {
    const fixture = validClarificationFixture();
    delete fixture[field];
    assert.equal(ClarificationSchema.safeParse(fixture).success, false);
  }
});

test("out_of_scope 使用固定语义文案，不允许自定义", () => {
  assert.equal(OutOfScopeSchema.safeParse({ message: OUT_OF_SCOPE_MESSAGE, suggestedTopics: ["欠薪怎么办"], aiNotice: AI_NOTICE }).success, true);
  assert.equal(OutOfScopeSchema.safeParse({ message: "我能帮你", suggestedTopics: [], aiNotice: AI_NOTICE }).success, false);
});

// ---------- AskSuccessResponse（跨字段校验） ----------

test("合法成功响应通过", () => {
  assert.equal(AskSuccessResponseSchema.safeParse(validSuccessFixture()).success, true);
});

test("sources 中重复 citationRef 拒绝", () => {
  const fixture = validSuccessFixture({ sources: [CITATION_A, { ...CITATION_B, citationRef: "S1" }] });
  assert.equal(AskSuccessResponseSchema.safeParse(fixture).success, false);
});

test("answered 必须有 answer 且不得附带其他形态", () => {
  const noAnswer = validSuccessFixture({ answer: null });
  assert.equal(AskSuccessResponseSchema.safeParse(noAnswer).success, false);
  const mixed = validSuccessFixture({ clarification: validClarificationFixture() });
  assert.equal(AskSuccessResponseSchema.safeParse(mixed).success, false);
});

test("answered/needs_clarification 必须至少包含一项 A 类来源", () => {
  const onlyB = validSuccessFixture({ sources: [CITATION_B] });
  assert.equal(AskSuccessResponseSchema.safeParse(onlyB).success, false);
  const clarificationResponse = {
    ...validSuccessFixture({ answer: null }),
    outcome: "needs_clarification",
    clarification: validClarificationFixture(),
  };
  assert.equal(AskSuccessResponseSchema.safeParse(clarificationResponse).success, true);
  const clarOnlyB = { ...clarificationResponse, sources: [CITATION_B] };
  assert.equal(AskSuccessResponseSchema.safeParse(clarOnlyB).success, false);
});

test("needs_clarification 必须有澄清结构且不得附带 answer/outOfScope", () => {
  const fixture = {
    ...validSuccessFixture({ answer: null }),
    outcome: "needs_clarification",
    clarification: validClarificationFixture(),
  };
  assert.equal(AskSuccessResponseSchema.safeParse(fixture).success, true);
  const missingClar = { ...fixture, clarification: null };
  assert.equal(AskSuccessResponseSchema.safeParse(missingClar).success, false);
});

test("out_of_scope 必须有 outOfScope、sources 为空且不得附带其他形态", () => {
  const fixture = {
    ...validSuccessFixture({ answer: null, sources: [] }),
    outcome: "out_of_scope",
    outOfScope: { message: OUT_OF_SCOPE_MESSAGE, suggestedTopics: [], aiNotice: AI_NOTICE },
  };
  assert.equal(AskSuccessResponseSchema.safeParse(fixture).success, true);
  const withSources = { ...fixture, sources: [CITATION_A] };
  assert.equal(AskSuccessResponseSchema.safeParse(withSources).success, false);
});

test("文本中引用不存在的 [S#] 拒绝（未知引用不得经过契约层）", () => {
  const badCitation = validAnswerFixture();
  badCitation.applicableLaw = ["引用不存在的编号 [S9]"];
  const fixture = validSuccessFixture({ answer: badCitation });
  assert.equal(AskSuccessResponseSchema.safeParse(fixture).success, false);
});

test("apiVersion 必须是 v1；topicIds 必须来自枚举", () => {
  const badVersion = validSuccessFixture({ apiVersion: "v2" });
  assert.equal(AskSuccessResponseSchema.safeParse(badVersion).success, false);
  const badTopic = validSuccessFixture({ topicIds: ["not-a-topic"] });
  assert.equal(AskSuccessResponseSchema.safeParse(badTopic).success, false);
});

test("answered 必须有适用法律、下一步与信息边界", () => {
  const fixture = validSuccessFixture();
  fixture.answer.applicableLaw = [];
  assert.equal(AskSuccessResponseSchema.safeParse(fixture).success, false);
});

test("aiNotice 必须是固定文案", () => {
  const fixture = validSuccessFixture();
  fixture.answer.aiNotice = "自定义提示";
  assert.equal(AskSuccessResponseSchema.safeParse(fixture).success, false);
});

// ---------- ApiErrorResponse ----------

test("合法错误响应通过；未知错误码拒绝", () => {
  const ok = {
    ok: false,
    apiVersion: API_VERSION,
    requestId: "r1",
    error: { code: "INVALID_REQUEST", message: "请求参数无效", retryable: false },
  };
  assert.equal(ApiErrorResponseSchema.safeParse(ok).success, true);
  const bad = { ...ok, error: { code: "WHATEVER", message: "x", retryable: false } };
  assert.equal(ApiErrorResponseSchema.safeParse(bad).success, false);
});

// ---------- 补充安全断言（Phase 7A-R1 审计：恢复性补回更强等价测试） ----------

test("strictObject：引用/回答/澄清/领域引导/响应携带未知字段一律拒绝", () => {
  assert.equal(SourceCitationSchema.safeParse({ ...CITATION_A, extra: "x" }).success, false);
  const answer = validAnswerFixture();
  answer.extra = "x";
  assert.equal(AnswerSchema.safeParse(answer).success, false);
  const clar = {
    legalFramework: ["框架"],
    possibleConclusions: ["结论A"],
    keyFactsNeeded: ["事实"],
    evidenceToPrepare: ["证据"],
    aiNotice: AI_NOTICE,
    extra: "x",
  };
  assert.equal(ClarificationSchema.safeParse(clar).success, false);
  const oos = { message: OUT_OF_SCOPE_MESSAGE, suggestedTopics: [], aiNotice: AI_NOTICE, extra: "x" };
  assert.equal(OutOfScopeSchema.safeParse(oos).success, false);
  assert.equal(AskSuccessResponseSchema.safeParse({ ...validSuccessFixture(), extra: "x" }).success, false);
});

test("citationRef 越界（S0 / S1000）与非法 sourceId 空白拒绝", () => {
  const bad0 = { ...CITATION_A, citationRef: "S0" };
  const bad1000 = { ...CITATION_A, citationRef: "S1000" };
  const badSrc = { ...CITATION_A, sourceId: " 非法 source id " };
  assert.equal(SourceCitationSchema.safeParse(bad0).success, false);
  assert.equal(SourceCitationSchema.safeParse(bad1000).success, false);
  assert.equal(SourceCitationSchema.safeParse(badSrc).success, false);
  // 响应层：不允许引用不存在于 sources 的编号（S9/S101 均拒绝）
  const fixture = validSuccessFixture();
  fixture.answer.applicableLaw = ["越界引用 [S101]"];
  assert.equal(AskSuccessResponseSchema.safeParse(fixture).success, false);
});
