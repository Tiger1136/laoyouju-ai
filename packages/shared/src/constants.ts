/** API 版本标识（当前只有 v1）。 */
export const API_VERSION = "v1" as const;

/** 用户问题 trim 后的最小长度。 */
export const QUESTION_MIN_LENGTH = 2;

/** 用户问题 trim 后的最大长度。 */
export const QUESTION_MAX_LENGTH = 500;

/** 请求体原始字节上限（bytes）。 */
export const MAX_REQUEST_BODY_BYTES = 8192;

/** DeepSeek 默认配置（服务端环境变量 DEEPSEEK_BASE_URL / DEEPSEEK_MODEL 可覆盖）。 */
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

/**
 * 产品覆盖的话题 ID（Phase 7A：从六场景扩展为劳动争议全口径主题）。
 * 原有六个 ID 保留以兼容既有内容与调用方；新增主题覆盖：
 * 劳动关系认定、合同订立履行变更解除终止、未签合同二倍工资、工资提成奖金、
 * 工作时间休息休假、经济补偿与赔偿金、社会保险、工伤、女职工三期保护、
 * 竞业限制与保密、劳务派遣、新就业形态、欠薪、仲裁时效、仲裁管辖庭审证据与裁诉衔接。
 */
export const TOPIC_IDS = [
  // ---- Phase 6 保留的六个场景 ----
  "unlawful-termination-compensation",
  "wage-arrears",
  "overtime-pay",
  "no-written-contract",
  "probation-disputes",
  "social-insurance-noncompete",
  // ---- Phase 7A 新增 ----
  "labor-relationship-recognition",
  "contract-performance",
  "double-wage-notice",
  "compensation-and-damages",
  "working-hours-leave",
  "social-insurance",
  "work-injury",
  "female-worker-protection",
  "noncompete-confidentiality",
  "labor-dispatch",
  "new-employment-forms",
  "arbitration-limitation",
  "arbitration-procedure",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

/** Topic ID 的中文标签。 */
export const TOPIC_LABELS: Readonly<Record<TopicId, string>> = {
  "unlawful-termination-compensation": "违法解除与经济补偿",
  "wage-arrears": "拖欠工资",
  "overtime-pay": "加班费",
  "no-written-contract": "未签书面劳动合同",
  "probation-disputes": "试用期争议",
  "social-insurance-noncompete": "社会保险与竞业限制",
  "labor-relationship-recognition": "劳动关系认定",
  "contract-performance": "劳动合同订立履行变更解除终止",
  "double-wage-notice": "未签合同二倍工资",
  "compensation-and-damages": "经济补偿与违法解除赔偿金",
  "working-hours-leave": "工作时间休息休假",
  "social-insurance": "社会保险",
  "work-injury": "工伤",
  "female-worker-protection": "女职工与三期保护",
  "noncompete-confidentiality": "竞业限制与保密",
  "labor-dispatch": "劳务派遣",
  "new-employment-forms": "新就业形态",
  "arbitration-limitation": "仲裁时效",
  "arbitration-procedure": "仲裁管辖庭审证据与裁诉衔接",
};

/**
 * 回答状态枚举（Phase 7A 起废除面向用户的泛化 insufficient）：
 * - answered：事实足够，输出完整初步分析；
 * - needs_clarification：事实不足，仍输出已确定的法律框架、可能结论、关键事实与证据清单；
 * - out_of_scope：仅用于做饭、天气、股票、娱乐等非劳动争议问题。
 */
export const ANSWER_OUTCOMES = ["answered", "needs_clarification", "out_of_scope"] as const;
export type AnswerOutcome = (typeof ANSWER_OUTCOMES)[number];

/**
 * out_of_scope 固定语义文案（由服务端程序写入，不允许模型自定义）。
 */
export const OUT_OF_SCOPE_MESSAGE =
  "我是劳动争议法律助手，暂不处理该类问题。你可以问我劳动合同、辞退、工资、加班、社保、工伤或劳动仲裁等问题。";

/** 来源分级（A/B/C/D，详见 docs/ARCHITECTURE.md）。 */
export const SOURCE_LEVELS = ["A", "B", "C", "D"] as const;
export type SourceLevel = (typeof SOURCE_LEVELS)[number];

/**
 * 来源分组（Web 展示分组）：法律法规 / 司法解释与仲裁程序 / 地方裁审参考 / 官方案例 / 补充参考。
 * Phase 7C-1 新增 "local"：地方裁审指引（C 级）单独分组，避免与全国性法律法规混同。
 */
export const SOURCE_GROUPS = ["law", "judicial", "local", "case", "supplement"] as const;
export type SourceGroup = (typeof SOURCE_GROUPS)[number];

/**
 * 来源类型中文标签（单一事实来源：内容库 catalog、API 来源卡片与 Web 展示共用）。
 * 键与 API SourceTypeSchema / 内容库 LawSourceTypeSchema + case 对齐。
 */
export const SOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  law: "法律",
  administrative_regulation: "行政法规",
  departmental_rule: "部门规章",
  judicial_interpretation: "司法解释",
  arbitration_procedure: "仲裁程序规范",
  policy: "政策文件",
  local_guidance: "地方裁审指引（省级法院/人社部门）",
  case: "官方案例",
};

/**
 * 来源分级中文标签（A/B/C/D）。同时包含文字标签（不只靠颜色），
 * 用于 Web 来源卡片与 API 来源卡片展示：
 * - A：全国性法律规范（法律/行政法规/司法解释等）；
 * - B：官方案例（类案参考，无普遍约束力）；
 * - C：地方裁审指引/补充线索（Phase 7C-1 起地方裁审指引仅可放 localGuidance）；
 * - D：补充线索（仅线索）。
 */
export const SOURCE_LEVEL_LABELS: Readonly<Record<SourceLevel, string>> = {
  A: "A级 · 全国性法律规范",
  B: "B级 · 官方案例参考",
  C: "C级 · 地方裁审参考",
  D: "D级 · 补充线索",
};

/**
 * 是否为具体省级 jurisdiction（区别于 全国性 / 待核验 / 未知）。
 * 用于 localGuidance 分级校验：地方裁审指引必须带具体省份 jurisdiction。
 */
export function isProvincialJurisdiction(jurisdiction: string): boolean {
  const j = jurisdiction.trim();
  return j !== "" && j !== "全国性" && j !== "待核验" && j !== "未知";
}

/**
 * 固定 AI 内容提示文案。
 * 由程序写入，不允许模型自定义；含义固定为：
 * - 内容由 AI 生成；
 * - 仅基于已收录的公开资料整理，供参考；
 * - 不构成律师法律意见；
 * - 不预测胜诉率/诉讼结果，不保证个案结果；
 * - 地方政策与完整案情可能影响结论；
 * - 用户应核验官方来源；
 * - 必要时咨询执业律师或当地法律援助机构。
 */
export const AI_NOTICE =
  "本回答由 AI 生成，仅基于已收录的公开资料与经筛选的研究线索整理，供参考；不构成律师法律意见，不预测诉讼结果，不保证个案结果。" +
  "地方政策与完整案情可能影响结论；请以官方发布的法律文本为准并核验来源；必要时请咨询执业律师或当地法律援助机构。";
