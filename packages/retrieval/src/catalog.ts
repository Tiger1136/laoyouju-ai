import { TOPIC_IDS, type TopicId } from "@laoyouju/shared";
import { loadContent, type LoadedContent } from "./load.js";

/** reviewStatus 中文说明（公开页面使用，避免把 source_verified 当成 legal_reviewed）。 */
export const REVIEW_STATUS_LABEL: Record<string, string> = {
  draft: "草稿，未核对",
  source_verified: "已核对官方来源，尚待专业复核",
  legal_reviewed: "已通过专业复核",
};

export const VALIDITY_STATUS_LABEL: Record<string, string> = {
  effective: "现行有效",
  amended: "现行有效（有修正）",
  repealed: "已废止",
  unknown: "效力状态不明",
  not_applicable: "不适用",
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  law: "法律",
  administrative_regulation: "行政法规",
  departmental_rule: "部门规章",
  judicial_interpretation: "司法解释",
  arbitration_procedure: "仲裁程序规范",
  policy: "政策文件",
  local_guidance: "地方裁审指引（省级法院/人社部门）",
  case: "官方案例",
};

export const VERIFICATION_STATUS_LABEL: Record<string, string> = {
  official_source_verified: "已与官方来源核验",
  human_verified: "已人工复核",
  unverified: "未核验",
};

export const CASE_TYPE_LABEL: Record<string, string> = {
  guiding_case: "指导性案例",
  typical_case: "典型案例",
  reference_case: "参考案例",
  local_typical_case: "地方典型案例",
  arbitration_typical_case: "仲裁典型事例",
};

export interface CatalogProvisionView {
  provisionId: string;
  locator: string;
  topicIds: string[];
}

export interface CatalogLawView {
  sourceId: string;
  title: string;
  sourceType: string;
  sourceTypeLabel: string;
  authorityLevel: string;
  issuingAuthority: string;
  documentNumber: string | null;
  jurisdiction: string;
  validityStatus: string;
  validityStatusLabel: string;
  promulgationDate: string;
  effectiveDate: string;
  expiryDate: string | null;
  supersedes: string[];
  supersededBy: string[];
  officialUrl: string;
  sourceCheckedAt: string;
  retrievedAt: string;
  reviewStatus: string;
  reviewStatusLabel: string;
  verificationStatus: string;
  verificationStatusLabel: string;
  topicIds: string[];
  provisions: CatalogProvisionView[];
}

export interface CatalogCaseView {
  sourceId: string;
  caseId: string;
  title: string;
  publishingAuthority: string;
  caseType: string;
  caseTypeLabel: string;
  authorityLevel: string;
  publicationDate: string;
  jurisdiction: string;
  officialUrl: string;
  sourceCheckedAt: string;
  retrievedAt: string;
  reviewStatus: string;
  reviewStatusLabel: string;
  verificationStatus: string;
  verificationStatusLabel: string;
  topicIds: string[];
  issues: string[];
  keyFacts: string;
  holding: string;
  reasoning: string;
  citedProvisions: { sourceId: string; locator: string }[];
  documentNumber: string | null;
}

export interface CatalogTopicView {
  id: string;
  provisionCount: number;
  caseCount: number;
  boundaryNote: string;
}

export interface Catalog {
  laws: CatalogLawView[];
  cases: CatalogCaseView[];
  topics: CatalogTopicView[];
}

/**
 * 构建期从同一份 schema 校验后的内容目录生成 Web 展示数据。
 * 不在此手写重复数据：所有标题/机关/位置/topic 均来自 content/ 目录。
 */
export function buildCatalog(content?: LoadedContent): Catalog {
  const loaded = content ?? loadContent();

  const laws: CatalogLawView[] = loaded.laws.map((law) => ({
    sourceId: law.sourceId,
    title: law.title,
    sourceType: law.sourceType,
    sourceTypeLabel: SOURCE_TYPE_LABEL[law.sourceType] ?? law.sourceType,
    authorityLevel: law.authorityLevel,
    issuingAuthority: law.issuingAuthority,
    documentNumber: law.documentNumber,
    jurisdiction: law.jurisdiction,
    validityStatus: law.validityStatus,
    validityStatusLabel: VALIDITY_STATUS_LABEL[law.validityStatus] ?? law.validityStatus,
    promulgationDate: law.promulgationDate,
    effectiveDate: law.effectiveDate,
    expiryDate: law.expiryDate,
    supersedes: law.supersedes,
    supersededBy: law.supersededBy,
    officialUrl: law.officialUrl,
    sourceCheckedAt: law.retrievedAt,
    retrievedAt: law.retrievedAt,
    reviewStatus: law.reviewStatus,
    reviewStatusLabel: REVIEW_STATUS_LABEL[law.reviewStatus] ?? law.reviewStatus,
    verificationStatus: law.verificationStatus,
    verificationStatusLabel: VERIFICATION_STATUS_LABEL[law.verificationStatus] ?? law.verificationStatus,
    topicIds: law.topicIds,
    provisions: law.provisions.map((p) => ({
      provisionId: p.provisionId,
      locator: p.locator,
      topicIds: p.topicIds,
    })),
  }));

  const cases: CatalogCaseView[] = loaded.cases.map((c) => ({
    sourceId: c.sourceId,
    caseId: c.caseId,
    title: c.title,
    publishingAuthority: c.publishingAuthority,
    caseType: c.caseType,
    caseTypeLabel: CASE_TYPE_LABEL[c.caseType] ?? c.caseType,
    authorityLevel: c.authorityLevel,
    publicationDate: c.publicationDate,
    jurisdiction: c.jurisdiction,
    officialUrl: c.officialUrl,
    sourceCheckedAt: c.sourceCheckedAt,
    retrievedAt: c.retrievedAt,
    reviewStatus: c.reviewStatus,
    reviewStatusLabel: REVIEW_STATUS_LABEL[c.reviewStatus] ?? c.reviewStatus,
    verificationStatus: c.verificationStatus,
    verificationStatusLabel: VERIFICATION_STATUS_LABEL[c.verificationStatus] ?? c.verificationStatus,
    topicIds: c.topicIds,
    issues: c.issues,
    keyFacts: c.keyFacts,
    holding: c.holding,
    reasoning: c.reasoning,
    citedProvisions: c.citedProvisions,
    documentNumber: c.documentNumber,
  }));

  const topics: CatalogTopicView[] = TOPIC_IDS.map((id) => {
    const provisionCount = loaded.laws.reduce(
      (acc, law) => acc + law.provisions.filter((p) => p.topicIds.includes(id)).length,
      0,
    );
    const caseCount = loaded.cases.filter((c) => c.topicIds.includes(id)).length;
    return {
      id,
      provisionCount,
      caseCount,
      boundaryNote: "当前已收录全国性规则、官方发布案例，以及山东省级裁审会议纪要/诉讼指引（地方裁审指引，C 级，仅适用于山东省）；地方性法规、省内其他裁审口径未作为本地知识库收录，涉及地方规则时将通过联网检索线索提示并引导核验地方官方来源。",
    };
  });

  return { laws, cases, topics };
}

/** 便捷：按 topicId 统计已收录的有效 provision 数（仅未废止/unknown 的 law 进入）。 */
export function countValidProvisionsByTopic(topicId: TopicId, content?: LoadedContent): number {
  const loaded = content ?? loadContent();
  let n = 0;
  for (const law of loaded.laws) {
    if (law.validityStatus === "repealed" || law.validityStatus === "unknown") {
      continue;
    }
    for (const p of law.provisions) {
      if (p.topicIds.includes(topicId)) {
        n++;
      }
    }
  }
  return n;
}