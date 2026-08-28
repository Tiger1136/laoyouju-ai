import { loadContent, type LoadedContent } from "./load.js";
import { computeTextSha256 } from "./normalize.js";
import { isAllowedOfficialHost, JURISDICTION_NATIONAL, type ContentDocument, type RegistryEntry } from "./schemas.js";

/** Phase 7A 验收底线：不少于 30 部现行全国性规范、50 个官方案例。 */
export const MIN_LAW_SOURCES = 30;
export const MIN_CASE_SOURCES = 50;

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  lawCount: number;
  caseCount: number;
  provisionCount: number;
  registryEntryCount: number;
  issues: ValidationIssue[];
}

/** 计算规范文档 contentHash：全部 provisions 的 sourceText 依序以 "\n" 连接后取 SHA-256。 */
export function computeContentHash(provisions: { sourceText: string }[]): string {
  return computeTextSha256(provisions.map((p) => p.sourceText).join("\n"));
}

/**
 * 内容库全局校验 v2（Phase 7A）。覆盖：
 *  - sourceId 全局唯一（law + case）；provisionId 全局唯一；同来源内不重复 provision；
 *  - source registry 必须存在；每个 loaded 来源必须与 registry 记录字段一致（title/机关/文号/类型/分级/地区/URL/效力/核验状态）；
 *  - 已加载规范必须为 A 级、现行有效（effective/amended）、不得被替代（supersededBy 为空）；
 *  - 已加载案例必须为 B 级；其 citedProvisions 必须指向真实存在的法条；
 *  - 官方 host 白名单（含子域名），禁止相似域名绕过；
 *  - 全国性规范签发机关必须为全国性机关；
 *  - verificationStatus：official_source_verified 与 human_verified 不得混淆（human_verified 必须伴随 legal_reviewed 记录）；
 *  - textSha256 与规范化 sourceText 一致；contentHash 与 provisions 一致；
 *  - 验收底线：laws ≥ 30、cases ≥ 50（阻止把过窄内容库当成完成）。
 */
export function validateContent(content?: LoadedContent): ValidationResult {
  const loaded = content ?? loadContent();
  const issues: ValidationIssue[] = [];

  if (loaded.laws.length < MIN_LAW_SOURCES) {
    issues.push({
      code: "BELOW_MINIMUM_LAW_SOURCES",
      message: `规范来源数量 ${loaded.laws.length} 低于 Phase 7A 底线 ${MIN_LAW_SOURCES}`,
    });
  }
  if (loaded.cases.length < MIN_CASE_SOURCES) {
    issues.push({
      code: "BELOW_MINIMUM_CASE_SOURCES",
      message: `官方案例数量 ${loaded.cases.length} 低于 Phase 7A 底线 ${MIN_CASE_SOURCES}`,
    });
  }

  const registryById = new Map<string, RegistryEntry>();
  for (const entry of loaded.registry.sources) {
    if (registryById.has(entry.sourceId)) {
      issues.push({ code: "DUPLICATE_REGISTRY_SOURCE_ID", message: `registry sourceId 重复: ${entry.sourceId}` });
    } else {
      registryById.set(entry.sourceId, entry);
    }
  }

  const sourceIds = new Map<string, ContentDocument>();
  const provisionIds = new Set<string>();

  for (const doc of loaded.documents) {
    if (sourceIds.has(doc.sourceId)) {
      issues.push({ code: "DUPLICATE_SOURCE_ID", message: `sourceId 重复: ${doc.sourceId}` });
    } else {
      sourceIds.set(doc.sourceId, doc);
    }

    const entry = registryById.get(doc.sourceId);
    if (!entry) {
      issues.push({ code: "REGISTRY_ENTRY_MISSING", message: `${doc.sourceId} 缺少 source registry 记录` });
    } else {
      if (!entry.loaded) {
        issues.push({ code: "REGISTRY_LOADED_FLAG_MISMATCH", message: `${doc.sourceId} registry.loaded=false 但存在内容文件` });
      }
      checkRegistryConsistency(doc, entry, issues);
    }

    if (!isAllowedOfficialHost(new URL(doc.officialUrl).hostname)) {
      issues.push({
        code: "OFFICIAL_HOST_NOT_ALLOWED",
        message: `${doc.sourceId} 的 officialUrl host 不在官方白名单: ${doc.officialUrl}`,
      });
    }

    if (doc.reviewStatus === "legal_reviewed" && !doc.professionalReview) {
      issues.push({
        code: "LEGAL_REVIEWED_WITHOUT_RECORD",
        message: `${doc.sourceId} 标记为 legal_reviewed 但缺少 professionalReview 记录`,
      });
    }
    // 核验状态与复核状态不得混淆：human_verified 必须是 legal_reviewed；official_source_verified 不得冒充 human_verified。
    if (doc.verificationStatus === "human_verified" && doc.reviewStatus !== "legal_reviewed") {
      issues.push({
        code: "VERIFICATION_STATUS_MIXED",
        message: `${doc.sourceId} verificationStatus=human_verified 但 reviewStatus 不是 legal_reviewed`,
      });
    }
    if (doc.verificationStatus === "unverified") {
      issues.push({
        code: "UNVERIFIED_LOADED_SOURCE",
        message: `${doc.sourceId} verificationStatus=unverified，不得作为已加载内容`,
      });
    }

    if (doc.contentType === "law") {
      // Phase 7C：地方裁审指引（local_guidance）应为 C 级 + 省级 jurisdiction；
      // 其余类型必须 A 级 + 全国性 + 全国性机关（不得把地方口径冒充全国法律）。
      if (doc.sourceType === "local_guidance") {
        if (doc.authorityLevel !== "C") {
          issues.push({
            code: "LOCAL_GUIDANCE_WRONG_LEVEL",
            message: `${doc.sourceId} 地方裁审指引必须为 C 级（不得标为 A 级）: ${doc.authorityLevel}`,
          });
        }
        if (doc.jurisdiction === JURISDICTION_NATIONAL || doc.jurisdiction === "") {
          issues.push({
            code: "LOCAL_GUIDANCE_REQUIRES_PROVINCE",
            message: `${doc.sourceId} 地方裁审指引的 jurisdiction 必须为具体省份: ${doc.jurisdiction}`,
          });
        }
      } else {
        if (doc.authorityLevel !== "A") {
          issues.push({
            code: "NATIONAL_SOURCE_MUST_BE_A",
            message: `${doc.sourceId} 全国性规范来源必须为 A 级: ${doc.authorityLevel}`,
          });
        }
        if (doc.jurisdiction !== JURISDICTION_NATIONAL) {
          issues.push({
            code: "NATIONAL_SOURCE_REQUIRES_NATIONAL_JURISDICTION",
            message: `${doc.sourceId} 全国性规范来源的 jurisdiction 必须为全国性: ${doc.jurisdiction}`,
          });
        }
        if (!isNationalAuthority(doc.issuingAuthority)) {
          issues.push({
            code: "NOT_NATIONAL_AUTHORITY",
            message: `${doc.sourceId} 的签发机关不是全国性机关: ${doc.issuingAuthority}`,
          });
        }
      }
      if (doc.validityStatus === "repealed" || doc.validityStatus === "unknown") {
        issues.push({
          code: "REPEALED_OR_UNKNOWN_ENTERING_INDEX",
          message: `${doc.sourceId} 的法律效力为 ${doc.validityStatus}，不得作为现行依据进入索引`,
        });
      }
      if (doc.supersededBy.length > 0) {
        issues.push({
          code: "SUPERSEDED_ENTERING_INDEX",
          message: `${doc.sourceId} 被替代 (${doc.supersededBy.join(",")})，不得作为现行依据进入索引`,
        });
      }
      // authorityLevel="A" 由 schema 字面量强制（内容加载时即校验）。
      const expectedHash = computeContentHash(doc.provisions);
      if (doc.contentHash !== expectedHash) {
        issues.push({
          code: "CONTENT_HASH_MISMATCH",
          message: `${doc.sourceId} 的 contentHash 与 provisions 不一致 (expected ${expectedHash})`,
        });
      }
      for (const prov of doc.provisions) {
        if (provisionIds.has(prov.provisionId)) {
          issues.push({ code: "DUPLICATE_PROVISION_ID", message: `provisionId 重复: ${prov.provisionId}` });
        }
        provisionIds.add(prov.provisionId);
        const expected = computeTextSha256(prov.sourceText);
        if (prov.textSha256 !== expected) {
          issues.push({
            code: "TEXT_SHA256_MISMATCH",
            message: `${prov.provisionId} 的 textSha256 与规范化 sourceText 不一致`,
          });
        }
      }
      const seenText = new Set<string>();
      for (const prov of doc.provisions) {
        const c = computeTextSha256(prov.sourceText);
        if (seenText.has(c)) {
          issues.push({
            code: "DUPLICATE_PROVISION",
            message: `${doc.sourceId} 存在重复 provision: ${prov.provisionId}`,
          });
        }
        seenText.add(c);
      }
    } else {
      // case
      if (doc.caseId !== doc.sourceId) {
        issues.push({ code: "CASE_ID_MISMATCH", message: `${doc.sourceId} 的 caseId 必须与 sourceId 一致` });
      }
      // authorityLevel="B" 由 schema 字面量强制（内容加载时即校验）。
      for (const cited of doc.citedProvisions) {
        const law = sourceIds.get(cited.sourceId);
        if (!law || law.contentType !== "law") {
          issues.push({
            code: "CITED_SOURCE_NOT_FOUND",
            message: `${doc.sourceId} 引用的 citedProvisions sourceId 不存在或不是法规: ${cited.sourceId}`,
          });
        }
      }
    }
  }

  // registry 逆向一致性：loaded=true 但无内容文件 → 报错；loaded=false 但存在内容文件 → 报错。
  for (const entry of loaded.registry.sources) {
    const doc = sourceIds.get(entry.sourceId);
    if (entry.loaded && !doc) {
      issues.push({ code: "REGISTRY_LOADED_WITHOUT_DOC", message: `${entry.sourceId} registry.loaded=true 但缺少内容文件` });
    }
    if (!entry.loaded && doc) {
      issues.push({ code: "REGISTRY_UNLOADED_WITH_DOC", message: `${entry.sourceId} registry.loaded=false 但存在内容文件` });
    }
    // 替代关系链一致性。
    for (const replacedBy of entry.supersededBy) {
      const by = registryById.get(replacedBy);
      if (!by) {
        issues.push({ code: "SUPERSEDED_BY_MISSING", message: `${entry.sourceId} supersededBy=${replacedBy} 在 registry 中不存在` });
      } else if (!by.supersedes.includes(entry.sourceId)) {
        issues.push({
          code: "SUPERSESSION_LINK_BROKEN",
          message: `${entry.sourceId} supersededBy=${replacedBy}，但 ${replacedBy} 的 supersedes 未包含 ${entry.sourceId}`,
        });
      }
    }
    for (const replaced of entry.supersedes) {
      const by = registryById.get(replaced);
      if (!by) {
        issues.push({ code: "SUPERSEDES_MISSING", message: `${entry.sourceId} supersedes=${replaced} 在 registry 中不存在` });
      }
    }
  }

  const provisionCount = loaded.laws.reduce((acc, l) => acc + l.provisions.length, 0);

  return {
    ok: issues.length === 0,
    lawCount: loaded.laws.length,
    caseCount: loaded.cases.length,
    provisionCount,
    registryEntryCount: loaded.registry.sources.length,
    issues,
  };
}

/** registry 记录与内容文件关键字段一致性校验。 */
function checkRegistryConsistency(
  doc: ContentDocument,
  entry: RegistryEntry,
  issues: ValidationIssue[],
): void {
  const check = (label: string, docValue: unknown, regValue: unknown): void => {
    const dv = docValue ?? null;
    const rv = regValue ?? null;
    if (dv !== rv) {
      issues.push({
        code: "REGISTRY_METADATA_MISMATCH",
        message: `${doc.sourceId} 的 ${label} 与 registry 不一致 (doc=${JSON.stringify(dv)} registry=${JSON.stringify(rv)})`,
      });
    }
  };
  check("title", doc.title, entry.title);
  check("contentType", doc.contentType, entry.contentType);
  check("authorityLevel", doc.authorityLevel, entry.authorityLevel);
  if (doc.contentType === "law") {
    check("issuingAuthority", doc.issuingAuthority, entry.issuingAuthority);
    check("sourceType", doc.sourceType, entry.sourceType);
    check("documentNumber", doc.documentNumber, entry.documentNumber);
    check("jurisdiction", doc.jurisdiction, entry.jurisdiction);
    check("officialUrl", doc.officialUrl, entry.officialUrl);
    check("validityStatus", doc.validityStatus, entry.validityStatus);
    check("contentHash", doc.contentHash, entry.contentHash);
    check("verificationStatus", doc.verificationStatus, entry.verificationStatus);
    check("reviewStatus", doc.reviewStatus, entry.reviewStatus);
  } else {
    check("sourceType", "case", entry.sourceType);
    check("publishingAuthority", doc.publishingAuthority, entry.issuingAuthority);
    check("officialUrl", doc.officialUrl, entry.officialUrl);
    check("verificationStatus", doc.verificationStatus, entry.verificationStatus);
    check("reviewStatus", doc.reviewStatus, entry.reviewStatus);
  }
}

/** 全国性机关识别（用于“全国版规范禁止地方政府/地方法院资料”）。 */
export function isNationalAuthority(authority: string): boolean {
  const s = authority.replace(/\s+/g, "");
  if (s.includes("最高人民法院") || s === "最高人民法院") {
    return true;
  }
  if (
    s.includes("人力资源社会保障部") ||
    s.includes("人力资源和社会保障部") ||
    s.includes("劳动和社会保障部") ||
    s.includes("劳动部") || // 1994年前后发文机关（劳动部、原劳动部）
    s.includes("劳动人事争议") ||
    s.includes("国务院") ||
    s.includes("全国人民代表大会常务委员会") ||
    s.includes("全国人大常委会") ||
    s.includes("全国人民代表大会")
  ) {
    const local = /^[省市区县自治].*(人民法院|人力资源社会保障|劳动人事|人民代表大会|劳动厅|劳动局)/.test(s);
    return !local;
  }
  // 部委（人社部等）与“最高人民法院”已覆盖；其他全国性机关以明确名单为准。
  if (s.includes("中华全国总工会") || s.includes("全国总工会")) {
    return true;
  }
  return false;
}