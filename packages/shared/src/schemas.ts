import { z } from "zod";
import {
  AI_NOTICE,
  ANSWER_OUTCOMES,
  API_VERSION,
  isProvincialJurisdiction,
  OUT_OF_SCOPE_MESSAGE,
  QUESTION_MAX_LENGTH,
  QUESTION_MIN_LENGTH,
  SOURCE_GROUPS,
  SOURCE_LEVELS,
  TOPIC_IDS,
} from "./constants.js";

/**
 * 本文件定义两端与服务端共用的严格 API 契约（zod v4 运行时校验）—— Phase 7A v2。
 * 所有 schema 均为 strictObject：拒绝未知字段，防止多余字段混入。
 * 错误消息一律不包含用户输入原文。
 *
 * 回答状态（outcome）：
 * - answered：事实足够，输出完整初步分析（八段结构）；
 * - needs_clarification：事实不足，仍输出已确定的法律框架、可能结论、关键事实与证据清单；
 * - out_of_scope：非劳动争议问题，使用固定领域引导文案；不调用生成模型。
 */

// ---------------------------------------------------------------------------
// AskRequest：/api/v1/ask 请求体
// ---------------------------------------------------------------------------

export const AskRequestSchema = z.strictObject({
  question: z
    .string({ error: "question 必须是字符串" })
    .trim()
    .min(QUESTION_MIN_LENGTH, { error: "问题过短" })
    .max(QUESTION_MAX_LENGTH, { error: "问题过长" }),
});

// ---------------------------------------------------------------------------
// 来源分级 / 分组 / 核验状态
// ---------------------------------------------------------------------------

export const SourceTypeSchema = z.enum([
  "law",
  "administrative_regulation",
  "departmental_rule",
  "judicial_interpretation",
  "arbitration_procedure",
  "case",
  "policy",
  // Phase 7C-1：地方裁审指引（省级法院/人社部门会议纪要、诉讼指引等）。
  // 仅 C 级 + 省级 jurisdiction；不得显示为全国性法律依据。
  "local_guidance",
]);

export const ValidityStatusSchema = z.enum([
  "effective",
  "amended",
  "repealed",
  "unknown",
  "not_applicable",
]);

export const ReviewStatusSchema = z.enum(["draft", "source_verified", "legal_reviewed"]);

/** 核验状态：官方来源已核验 与 人工复核 是两个不同的状态（不得混淆）。 */
export const VerificationStatusSchema = z.enum([
  "official_source_verified", // 已与官方来源核验（可为程序化/机器导入后核验）
  "human_verified", // 人工复核（含专业复核）
  "unverified", // 未核验
]);

export const SourceLevelSchema = z.enum(SOURCE_LEVELS);
export const SourceGroupSchema = z.enum(SOURCE_GROUPS);

/** sourceId 格式：字母数字开头，后续允许字母数字与 . _ -，最长 64 字符。 */
export const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** 模型引用编号格式：[S1]、[S2] ... */
export const CITATION_REF_PATTERN = /^S[1-9][0-9]{0,2}$/;

export const SourceCitationSchema = z.strictObject({
  citationRef: z
    .string({ error: "citationRef 必须是字符串" })
    .regex(CITATION_REF_PATTERN, { error: "citationRef 格式非法" }),
  sourceId: z
    .string({ error: "sourceId 必须是字符串" })
    .trim()
    .min(1, { error: "sourceId 不能为空" })
    .max(64, { error: "sourceId 过长" })
    .regex(SOURCE_ID_PATTERN, { error: "sourceId 格式非法" }),
  title: z
    .string({ error: "title 必须是字符串" })
    .trim()
    .min(1, { error: "title 不能为空" })
    .max(300, { error: "title 过长" }),
  sourceType: SourceTypeSchema,
  /** 来源类型中文标签（如“法律”“地方裁审指引（省级法院/人社部门）”）。 */
  sourceTypeLabel: z.string().trim().max(60).default(""),
  sourceLevel: SourceLevelSchema,
  /** 来源分级中文标签（如“A级 · 全国性法律规范”“C级 · 地方裁审参考”），含文字、不只靠颜色。 */
  sourceLevelLabel: z.string().trim().max(60).default(""),
  group: SourceGroupSchema,
  /** topicIds（适用时；法律与案例来源携带）。 */
  topicIds: z.array(z.enum(TOPIC_IDS)).max(10).default([]),
  issuingAuthority: z
    .string({ error: "issuingAuthority 必须是字符串" })
    .trim()
    .min(1, { error: "issuingAuthority 不能为空" })
    .max(150, { error: "issuingAuthority 过长" }),
  jurisdiction: z
    .string({ error: "jurisdiction 必须是字符串" })
    .trim()
    .min(1, { error: "jurisdiction 不能为空" })
    .max(60, { error: "jurisdiction 过长" }),
  locator: z
    .string({ error: "locator 必须是字符串" })
    .trim()
    .min(1, { error: "locator 不能为空" })
    .max(200, { error: "locator 过长" }),
  officialUrl: z
    .string({ error: "officialUrl 必须是字符串" })
    .trim()
    .min(1, { error: "officialUrl 不能为空" })
    .max(500, { error: "officialUrl 过长" })
    .url({ error: "officialUrl 必须是合法 URL" })
    .refine((value) => value.startsWith("https://"), {
      error: "officialUrl 必须使用 HTTPS",
    }),
  validityStatus: ValidityStatusSchema,
  publishedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  excerpt: z
    .string({ error: "excerpt 必须是字符串" })
    .trim()
    .min(1, { error: "excerpt 不能为空" })
    .max(1000, { error: "excerpt 过长" }),
  reviewStatus: ReviewStatusSchema,
  verificationStatus: VerificationStatusSchema,
});
// ---------------------------------------------------------------------------
// Answer（answered）：Phase 7A 八段回答结构
// ---------------------------------------------------------------------------

const SectionItemSchema = z
  .string({ error: "段落条目必须是字符串" })
  .trim()
  .min(1, { error: "段落条目不能为空" })
  .max(800, { error: "段落条目过长" });

export const AnswerSchema = z.strictObject({
  /** 问题识别与争议焦点 */
  issueIdentification: z
    .string({ error: "issueIdentification 必须是字符串" })
    .trim()
    .min(1, { error: "issueIdentification 不能为空" })
    .max(800, { error: "issueIdentification 过长" }),
  /** 初步结论 */
  preliminaryConclusion: z
    .string({ error: "preliminaryConclusion 必须是字符串" })
    .trim()
    .min(1, { error: "preliminaryConclusion 不能为空" })
    .max(1200, { error: "preliminaryConclusion 过长" }),
  /** 适用法律及具体条文（每条可带 [S#] 引用；只允许 A 级全国性法律依据） */
  applicableLaw: z
    .array(SectionItemSchema, { error: "applicableLaw 必须是数组" })
    .max(20, { error: "applicableLaw 条目过多" }),
  /**
   * 山东地区裁审参考（Phase 7C-1 新增可选字段；只允许 C 级地方裁审指引 + 省级 jurisdiction；
   * 仅作为山东地区裁审口径参考，不属于全国统一法律规则；无相关内容时为空数组）。
   */
  localGuidance: z
    .array(SectionItemSchema, { error: "localGuidance 必须是数组" })
    .max(10, { error: "localGuidance 条目过多" })
    .default([]),
  /** 相似官方案例（每条可带 [S#] 引用；只允许 B 级案例；无高度相似案例时明确说明"未找到"） */
  similarCases: z
    .array(SectionItemSchema, { error: "similarCases 必须是数组" })
    .max(10, { error: "similarCases 条目过多" }),
  /** 用户下一步行动 */
  nextSteps: z
    .array(SectionItemSchema, { error: "nextSteps 必须是数组" })
    .max(20, { error: "nextSteps 条目过多" }),
  /** 证据材料清单 */
  evidenceChecklist: z
    .array(SectionItemSchema, { error: "evidenceChecklist 必须是数组" })
    .max(20, { error: "evidenceChecklist 条目过多" }),
  /** 尚需确认的事实 */
  factsToConfirm: z
    .array(SectionItemSchema, { error: "factsToConfirm 必须是数组" })
    .max(20, { error: "factsToConfirm 条目过多" }),
  /** 信息边界和 AI 声明 */
  boundaries: z
    .array(SectionItemSchema, { error: "boundaries 必须是数组" })
    .max(20, { error: "boundaries 条目过多" }),
  aiNotice: z.literal(AI_NOTICE, { error: "aiNotice 必须是固定 AI 内容提示文案" }),
});

// ---------------------------------------------------------------------------
// Clarification（needs_clarification）：事实不足时仍需输出的确定信息
// ---------------------------------------------------------------------------

export const ClarificationSchema = z.strictObject({
  /** 已能确定的法律框架（每条可带 [S#] 引用） */
  legalFramework: z
    .array(SectionItemSchema, { error: "legalFramework 必须是数组" })
    .min(1, { error: "legalFramework 至少一条" })
    .max(20, { error: "legalFramework 条目过多" }),
  /** 可能存在的两种或多种结论 */
  possibleConclusions: z
    .array(SectionItemSchema, { error: "possibleConclusions 必须是数组" })
    .min(1, { error: "possibleConclusions 至少一条" })
    .max(10, { error: "possibleConclusions 条目过多" }),
  /** 决定结论所需的关键事实 */
  keyFactsNeeded: z
    .array(SectionItemSchema, { error: "keyFactsNeeded 必须是数组" })
    .min(1, { error: "keyFactsNeeded 至少一条" })
    .max(20, { error: "keyFactsNeeded 条目过多" }),
  /** 用户下一步应准备的证据 */
  evidenceToPrepare: z
    .array(SectionItemSchema, { error: "evidenceToPrepare 必须是数组" })
    .min(1, { error: "evidenceToPrepare 至少一条" })
    .max(20, { error: "evidenceToPrepare 条目过多" }),
  aiNotice: z.literal(AI_NOTICE, { error: "aiNotice 必须是固定 AI 内容提示文案" }),
});

// ---------------------------------------------------------------------------
// OutOfScope：非劳动争议问题的固定领域引导
// ---------------------------------------------------------------------------

export const OutOfScopeSchema = z.strictObject({
  message: z.literal(OUT_OF_SCOPE_MESSAGE, {
    error: "out_of_scope 必须使用固定领域引导文案",
  }),
  /** 建议改问的劳动问题示例（程序维护，非模型生成） */
  suggestedTopics: z
    .array(z.string().trim().min(1).max(80))
    .max(10)
    .default([]),
  aiNotice: z.literal(AI_NOTICE, { error: "aiNotice 必须是固定 AI 内容提示文案" }),
});

// ---------------------------------------------------------------------------
// AskSuccessResponse：/api/v1/ask 成功响应（含跨字段校验）
// ---------------------------------------------------------------------------

export const TopicIdSchema = z.enum(TOPIC_IDS);

export const CoverageSchema = z.strictObject({
  scope: z.literal("全国性规则"),
  localRulesCovered: z.literal(false),
});

export const OutcomeSchema = z.enum(ANSWER_OUTCOMES);

const CITATION_REF_IN_TEXT_RE = /\[S([1-9][0-9]{0,2})\]/g;

export const AskSuccessResponseSchema = z
  .strictObject({
    ok: z.literal(true),
    apiVersion: z.literal(API_VERSION),
    requestId: z
      .string({ error: "requestId 必须是字符串" })
      .trim()
      .min(1, { error: "requestId 不能为空" })
      .max(64, { error: "requestId 过长" }),
    outcome: OutcomeSchema,
    topicIds: z
      .array(TopicIdSchema, { error: "topicIds 必须是数组" })
      .max(10, { error: "topicIds 条目过多" }),
    coverage: CoverageSchema,
    answer: AnswerSchema.nullable(),
    clarification: ClarificationSchema.nullable(),
    outOfScope: OutOfScopeSchema.nullable(),
    sources: z
      .array(SourceCitationSchema, { error: "sources 必须是数组" })
      .max(40, { error: "sources 条目过多" }),
  })
  .superRefine((data, ctx) => {
    const seenRefs = new Set<string>();
    data.sources.forEach((source, index) => {
      if (seenRefs.has(source.citationRef)) {
        ctx.addIssue({
          code: "custom",
          message: `sources[${index}] 的 citationRef 重复`,
          path: ["sources", index, "citationRef"],
        });
      }
      seenRefs.add(source.citationRef);
    });

    const textFields: string[][] =
      data.answer !== null
        ? [
            data.answer.applicableLaw,
            data.answer.localGuidance,
            data.answer.similarCases,
            data.answer.nextSteps,
            data.answer.evidenceChecklist,
            data.answer.factsToConfirm,
            data.answer.boundaries,
          ]
        : data.clarification !== null
          ? [
              data.clarification.legalFramework,
              data.clarification.possibleConclusions,
              data.clarification.keyFactsNeeded,
              data.clarification.evidenceToPrepare,
            ]
          : [];

    // 三态互斥：outcome 与结构一致。
    if (data.outcome === "answered") {
      if (data.answer === null) {
        ctx.addIssue({ code: "custom", message: "answered 必须提供 answer", path: ["answer"] });
      }
      if (data.clarification !== null || data.outOfScope !== null) {
        ctx.addIssue({ code: "custom", message: "answered 不得附带 clarification/outOfScope" });
      }
    } else if (data.outcome === "needs_clarification") {
      if (data.clarification === null) {
        ctx.addIssue({ code: "custom", message: "needs_clarification 必须提供 clarification", path: ["clarification"] });
      }
      if (data.answer !== null || data.outOfScope !== null) {
        ctx.addIssue({ code: "custom", message: "needs_clarification 不得附带 answer/outOfScope" });
      }
    } else {
      if (data.outOfScope === null) {
        ctx.addIssue({ code: "custom", message: "out_of_scope 必须提供 outOfScope", path: ["outOfScope"] });
      }
      if (data.answer !== null || data.clarification !== null) {
        ctx.addIssue({ code: "custom", message: "out_of_scope 不得附带 answer/clarification" });
      }
    }

    // answered / needs_clarification：核心法律结论必须至少有一项 A 类来源。
    if (data.outcome === "answered" || data.outcome === "needs_clarification") {
      if (data.sources.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: `${data.outcome} 应答必须至少引用一个来源`,
          path: ["sources"],
        });
      }
      if (!data.sources.some((s) => s.sourceLevel === "A")) {
        ctx.addIssue({
          code: "custom",
          message: "核心法律结论必须至少有一项 A 类来源",
          path: ["sources"],
        });
      }
    }
    if (data.outcome === "answered" && data.answer !== null) {
      if (data.answer.applicableLaw.length === 0) {
        ctx.addIssue({ code: "custom", message: "answered 必须包含适用法律及具体条文", path: ["answer", "applicableLaw"] });
      }
      if (data.answer.nextSteps.length === 0) {
        ctx.addIssue({ code: "custom", message: "answered 必须包含下一步行动", path: ["answer", "nextSteps"] });
      }
      if (data.answer.boundaries.length === 0) {
        ctx.addIssue({ code: "custom", message: "answered 必须包含信息边界", path: ["answer", "boundaries"] });
      }
    }
    if (data.outcome === "out_of_scope" && data.sources.length > 0) {
      ctx.addIssue({ code: "custom", message: "out_of_scope 不得附带来源", path: ["sources"] });
    }

    // 回答中引用的每个 [S#] 必须属于本次检索结果（citationRef 集合）。
    for (const [listIndex, list] of textFields.entries()) {
      for (const [itemIndex, item] of list.entries()) {
        const refs = [...item.matchAll(CITATION_REF_IN_TEXT_RE)].map((m) => `S${m[1]}`);
        for (const ref of refs) {
          if (!seenRefs.has(ref)) {
            ctx.addIssue({
              code: "custom",
              message: `texts[${listIndex}][${itemIndex}] 引用了不存在的 citationRef ${ref}`,
            });
          }
        }
      }
    }

    // Phase 7C-1 来源分级约束（A/B/C 不得混置）：
    // - applicableLaw 只允许引用 A 级全国性规范（法律/行政法规/司法解释等）；
    // - similarCases 只允许引用 B 级官方案例；
    // - localGuidance 只允许引用 C 级地方裁审指引（sourceType=local_guidance 且带省级 jurisdiction）。
    //   保证前端与回答文本不会把 C 级内容显示为“国家法律依据”。
    if (data.answer !== null) {
      const sourceByRef = new Map(data.sources.map((s) => [s.citationRef, s]));
      const checkLevels = (
        field: "applicableLaw" | "localGuidance" | "similarCases",
        list: readonly string[],
        ok: (s: { sourceLevel: string; sourceType: string; jurisdiction: string }) => boolean,
        expect: string,
      ): void => {
        list.forEach((item, itemIndex) => {
          for (const m of item.matchAll(CITATION_REF_IN_TEXT_RE)) {
            const ref = `S${m[1]}`;
            const src = sourceByRef.get(ref);
            if (src !== undefined && !ok(src)) {
              ctx.addIssue({
                code: "custom",
                message: `answer.${field}[${itemIndex}] 引用了非${expect}来源 ${ref}（sourceLevel=${src.sourceLevel}, sourceType=${src.sourceType}, jurisdiction=${src.jurisdiction}）`,
                path: ["answer", field, itemIndex],
              });
            }
          }
        });
      };
      checkLevels("applicableLaw", data.answer.applicableLaw, (s) => s.sourceLevel === "A", "A 级全国性规范");
      checkLevels("localGuidance", data.answer.localGuidance, (s) => s.sourceLevel === "C" && s.sourceType === "local_guidance" && isProvincialJurisdiction(s.jurisdiction), "C 级地方裁审指引（省级 jurisdiction）");
      checkLevels("similarCases", data.answer.similarCases, (s) => s.sourceLevel === "B" && s.sourceType === "case", "B 级官方案例");
    }
  });
// ---------------------------------------------------------------------------
// ApiErrorResponse：统一错误响应
// ---------------------------------------------------------------------------

export const ErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNSUPPORTED_MEDIA_TYPE",
  "PAYLOAD_TOO_LARGE",
  "ORIGIN_NOT_ALLOWED",
  "METHOD_NOT_ALLOWED",
  "NOT_FOUND",
  "SERVICE_NOT_READY",
  "RATE_LIMITED",
  "OUT_OF_SCOPE",
  "UPSTREAM_ERROR",
  "INTERNAL_ERROR",
]);

export const ApiErrorResponseSchema = z.strictObject({
  ok: z.literal(false),
  apiVersion: z.literal(API_VERSION),
  requestId: z
    .string({ error: "requestId 必须是字符串" })
    .trim()
    .min(1, { error: "requestId 不能为空" })
    .max(64, { error: "requestId 过长" }),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z
      .string({ error: "error.message 必须是字符串" })
      .trim()
      .min(1, { error: "error.message 不能为空" })
      .max(200, { error: "error.message 过长" }),
    retryable: z.boolean({ error: "error.retryable 必须是布尔值" }),
    // Phase 8：限流响应建议重试等待秒数（可选；前端可据此显示“稍后再试”）。
    retryAfterSeconds: z.number().min(0).max(86400).optional(),
  }),
});

// ---------------------------------------------------------------------------
// 便捷 parse/safeParse 方法（避免手写两套类型）
// ---------------------------------------------------------------------------

export const parseAskRequest = (input: unknown) => AskRequestSchema.safeParse(input);
export const parseAskSuccessResponse = (input: unknown) => AskSuccessResponseSchema.safeParse(input);
export const parseApiErrorResponse = (input: unknown) => ApiErrorResponseSchema.safeParse(input);