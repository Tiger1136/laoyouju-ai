import { z } from "zod";
import { TOPIC_IDS } from "@laoyouju/shared";

/**
 * 内容库 schema v2（auditable content model，Phase 7A）。
 * 与 packages/shared 的 API 契约相互独立：
 *  - shared 定义两端与服务端共用的 API v1 契约；
 *  - retrieval 定义 content/ 内容库的审计 schema、加载、校验与检索。
 *
 * 变更：
 *  - 新增 source registry（content/sources/registry.json）；
 *  - 规范/案例元数据扩展（authorityLevel、jurisdiction、时效与替代关系、核验状态等）；
 *  - topicIds 扩展为全部劳动争议主题（TOPIC_IDS）。
 */

export const CONTENT_SCHEMA_VERSION = "2.0.0";
export const JURISDICTION_NATIONAL = "全国性";

export const ReviewStatusSchema = z.enum(["draft", "source_verified", "legal_reviewed"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/** 核验状态：官方来源核验 与 人工复核 是不同状态。 */
export const VerificationStatusSchema = z.enum([
  "official_source_verified",
  "human_verified",
  "unverified",
]);
export type ContentVerificationStatus = z.infer<typeof VerificationStatusSchema>;

/** 来源分级：A 全国性权威规范；B 官方指导/典型案例；C 官方释法与白名单实务文章；D 社会内容（仅线索）。 */
export const AuthorityLevelSchema = z.enum(["A", "B", "C", "D"]);
export type AuthorityLevel = z.infer<typeof AuthorityLevelSchema>;

export const TopicIdSchema = z.enum(TOPIC_IDS);
export type ContentTopicId = z.infer<typeof TopicIdSchema>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** 专业复核记录（仅当 reviewStatus === "legal_reviewed" 时要求存在）。 */
export const ProfessionalReviewSchema = z.strictObject({
  reviewerName: z.string().min(1).max(100),
  reviewerTitle: z.string().min(1).max(100),
  reviewDate: z.string().regex(DATE_RE),
  reviewRecord: z.string().min(1).max(500),
});
export type ProfessionalReview = z.infer<typeof ProfessionalReviewSchema>;

export const LawSourceTypeSchema = z.enum([
  "law",
  "administrative_regulation",
  "departmental_rule",
  "judicial_interpretation",
  "arbitration_procedure",
  "policy",
]);
export type LawSourceType = z.infer<typeof LawSourceTypeSchema>;

export const ValidityStatusSchema = z.enum([
  "effective",
  "amended",
  "repealed",
  "unknown",
  "not_applicable",
]);
export type ContentValidityStatus = z.infer<typeof ValidityStatusSchema>;

/** 官方 host 白名单（只允许这些官方域名或子域名；禁止相似域名绕过）。
 *  Phase 7B 扩展（省级法院官网，均经页面核验确为官方法院站点后加入）：
 *  jsfy.gov.cn（江苏法院网/江苏省高级人民法院）、gdcourts.gov.cn（广东法院网/广东省高级人民法院）、
 *  hshfy.sh.cn（上海市高级人民法院）、hncourt.gov.cn（河南省高级人民法院）。 */
export const ALLOWED_OFFICIAL_HOSTS: readonly string[] = [
  "flk.npc.gov.cn",
  "www.npc.gov.cn",
  "npc.gov.cn",
  "www.gov.cn",
  "gov.cn",
  "www.court.gov.cn",
  "court.gov.cn",
  "gongbao.court.gov.cn",
  "www.mohrss.gov.cn",
  "mohrss.gov.cn",
  "rmfyb.chinacourt.org",
  "mofcom.gov.cn", // 商务部（官方政府站点，含政策法规库 policy.mofcom.gov.cn）
  "samr.gov.cn", // 国家市场监督管理总局
  "gxcourt.gov.cn", // 广西壮族自治区高级人民法院（法院系统官方站点）
  "jsfy.gov.cn", // 江苏法院网（江苏省高级人民法院，Phase 7B 核验）
  "gdcourts.gov.cn", // 广东法院网（广东省高级人民法院，Phase 7B 核验）
  "hshfy.sh.cn", // 上海市高级人民法院（Phase 7B 核验）
  "hncourt.gov.cn", // 河南省高级人民法院（Phase 7B 核验）
  "jxfy.gov.cn", // 江西法院网（江西省高级人民法院，Phase 7B 核验）
  "lncourt.gov.cn", // 辽宁法院网（辽宁省各级法院官方站点，Phase 7B 核验）
  "tjcourt.gov.cn", // 天津法院网（天津各级法院官方站点，Phase 7B 核验）
  "hebeicourt.gov.cn", // 河北法院网（河北省高级人民法院，Phase 7B 核验）
];

/** 判断 URL 的 host 是否在官方白名单内（允许白名单域名的精确匹配或其子域名）。 */
export function isAllowedOfficialHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  for (const allowed of ALLOWED_OFFICIAL_HOSTS) {
    if (h === allowed || h.endsWith(`.${allowed}`)) {
      return true;
    }
  }
  return false;
}

export const ProvisionSchema = z.strictObject({
  provisionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/),
  locator: z.string().min(1).max(200),
  sourceText: z.string().min(1),
  topicIds: z.array(TopicIdSchema).max(20).default([]),
  keywords: z.array(z.string().min(1).max(64)).max(20).default([]),
  textSha256: z.string().regex(SHA256_RE),
});
export type Provision = z.infer<typeof ProvisionSchema>;

/**
 * 规范性文件（法律/行政法规/部门规章/司法解释/仲裁程序文件/政策文件）schema v2。
 * 字段与 phase-7a 规范清单一一对应：
 * sourceId/title/issuingAuthority/documentNumber/sourceType/authorityLevel/jurisdiction/
 * officialUrl/promulgationDate/effectiveDate/expiryDate/validityStatus/supersedes/supersededBy/
 * retrievedAt/contentHash/verificationStatus/provisions。
 */
export const LawSourceSchema = z.strictObject({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentType: z.literal("law"),
  sourceId: z.string().regex(ID_RE),
  title: z.string().min(1).max(300),
  sourceType: LawSourceTypeSchema,
  issuingAuthority: z.string().min(1).max(150),
  documentNumber: z.string().min(1).max(120).nullable(),
  authorityLevel: z.literal("A"),
  jurisdiction: z.literal(JURISDICTION_NATIONAL),
  officialUrl: z.string().url().refine((v) => v.startsWith("https://"), {
    message: "officialUrl 必须使用 HTTPS",
  }),
  promulgationDate: z.string().regex(DATE_RE),
  effectiveDate: z.string().regex(DATE_RE),
  expiryDate: z.string().regex(DATE_RE).nullable().default(null),
  validityStatus: ValidityStatusSchema,
  supersedes: z.array(z.string().regex(ID_RE)).max(20).default([]),
  supersededBy: z.array(z.string().regex(ID_RE)).max(20).default([]),
  retrievedAt: z.string().regex(DATE_RE),
  contentHash: z.string().regex(SHA256_RE),
  verificationStatus: VerificationStatusSchema,
  reviewStatus: ReviewStatusSchema,
  topicIds: z.array(TopicIdSchema).min(1),
  provisions: z.array(ProvisionSchema).min(1),
  validityNotes: z.array(z.string().min(1).max(500)).max(20).default([]),
  professionalReview: ProfessionalReviewSchema.optional(),
});
export type LawSource = z.infer<typeof LawSourceSchema>;

export const CaseTypeSchema = z.enum([
  "guiding_case", // 最高法指导性案例
  "typical_case", // 最高法/人社部等全国性典型/参考案例
  "reference_case", // 人民法院案例库参考案例等
  "local_typical_case", // 地方高院/地方人社部门典型案例
  "arbitration_typical_case", // 仲裁机构典型事例
]);
export type CaseType = z.infer<typeof CaseTypeSchema>;

export const CitedProvisionSchema = z.strictObject({
  sourceId: z.string().regex(ID_RE),
  locator: z.string().min(1).max(200),
});

export const CaseSourceSchema = z.strictObject({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentType: z.literal("case"),
  sourceId: z.string().regex(ID_RE),
  caseId: z.string().regex(ID_RE), // 与 sourceId 相同（校验强制）
  title: z.string().min(1).max(300),
  publishingAuthority: z.string().min(1).max(150),
  caseType: CaseTypeSchema,
  publicationDate: z.string().regex(DATE_RE),
  jurisdiction: z.string().min(1).max(60),
  authorityLevel: z.literal("B"),
  officialUrl: z.string().url().refine((v) => v.startsWith("https://"), {
    message: "officialUrl 必须使用 HTTPS",
  }),
  sourceCheckedAt: z.string().regex(DATE_RE), // 复核核对日期（与 retrieval v1 兼容）
  retrievedAt: z.string().regex(DATE_RE), // 抓取/收集日期
  verificationStatus: VerificationStatusSchema,
  reviewStatus: ReviewStatusSchema,
  topicIds: z.array(TopicIdSchema).min(1),
  issues: z.array(z.string().min(1).max(300)).min(1).max(10),
  keyFacts: z.string().min(1).max(2000),
  holding: z.string().min(1).max(1500),
  reasoning: z.string().min(1).max(2000),
  citedProvisions: z.array(CitedProvisionSchema).default([]),
  documentNumber: z.string().min(1).max(120).nullable().default(null), // 页面出现案号/入库编号时填写
  professionalReview: ProfessionalReviewSchema.optional(),
});
export type CaseSource = z.infer<typeof CaseSourceSchema>;

export const ContentDocumentSchema = z.union([LawSourceSchema, CaseSourceSchema]);
export type ContentDocument = z.infer<typeof ContentDocumentSchema>;

// ---------------------------------------------------------------------------
// Source Registry（content/sources/registry.json）
// ---------------------------------------------------------------------------

export const RegistryEntrySchema = z.strictObject({
  sourceId: z.string().regex(ID_RE),
  title: z.string().min(1).max(300),
  contentType: z.enum(["law", "case", "research_hint"]),
  sourceType: LawSourceTypeSchema.or(z.literal("case")).nullable(),
  authorityLevel: AuthorityLevelSchema,
  issuingAuthority: z.string().min(1).max(150).nullable(),
  documentNumber: z.string().min(1).max(120).nullable(),
  jurisdiction: z.string().min(1).max(60).nullable(),
  officialUrl: z.string().url().refine((v) => v.startsWith("https://"), {
    message: "officialUrl 必须使用 HTTPS",
  }).nullable(),
  promulgationDate: z.string().regex(DATE_RE).nullable(),
  effectiveDate: z.string().regex(DATE_RE).nullable(),
  expiryDate: z.string().regex(DATE_RE).nullable(),
  validityStatus: ValidityStatusSchema.nullable(),
  supersedes: z.array(z.string().regex(ID_RE)).max(30).default([]),
  supersededBy: z.array(z.string().regex(ID_RE)).max(30).default([]),
  retrievedAt: z.string().regex(DATE_RE),
  contentHash: z.string().regex(SHA256_RE).nullable(),
  verificationStatus: VerificationStatusSchema.nullable(),
  reviewStatus: ReviewStatusSchema.nullable(),
  loaded: z.boolean(),
  note: z.string().min(1).max(500).nullable().default(null),
});
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

export const SourceRegistrySchema = z.strictObject({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  registryVersion: z.number().int().positive(),
  generatedAt: z.string().regex(DATE_RE),
  sources: z.array(RegistryEntrySchema).min(1),
});
export type SourceRegistry = z.infer<typeof SourceRegistrySchema>;