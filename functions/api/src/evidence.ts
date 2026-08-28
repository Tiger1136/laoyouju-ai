import type { LoadedContent, QueryResult } from "@laoyouju/retrieval";
import { MIN_RELEVANCE_SCORE } from "@laoyouju/retrieval";
import type {
  SourceGroup,
  SourceLevel,
  SourceType,
  ValidityStatus,
  VerificationStatus,
} from "@laoyouju/shared";

/** 一条来源的元数据（内容库文档级；用于证据组织与引用校验）。 */
export interface SourceMeta {
  sourceType: SourceType;
  sourceLevel: SourceLevel;
  sourceGroup: SourceGroup;
  issuingAuthority: string;
  jurisdiction: string;
  validityStatus: ValidityStatus;
  publishedDate: string | null;
  retrievedAt: string;
  verificationStatus: VerificationStatus;
  reviewStatus: "draft" | "source_verified" | "legal_reviewed";
  url: string;
  title: string;
}

/**
 * Web 展示分组：法律法规 / 司法解释与仲裁程序 / 地方裁审参考（C 级地方指引） / 官方案例 / 补充参考。
 * Phase 7C-1：地方裁审指引（local_guidance）单独归入 "local" 组，绝不与全国性法律法规混同。
 */
export function groupOf(sourceType: string, level: SourceLevel): SourceGroup {
  if (sourceType === "local_guidance") {
    return "local";
  }
  if (level === "D") {
    return "supplement";
  }
  if (level === "C") {
    return "supplement"; // C 级补充线索（联网检索线索等；地方指引已被 local_guidance 分支捕获）
  }
  if (sourceType === "case") {
    return "case";
  }
  if (sourceType === "judicial_interpretation" || sourceType === "arbitration_procedure") {
    return "judicial";
  }
  return "law";
}

/** 从内容库构建 sourceId -> 元数据 映射。 */
export function buildSourceMeta(content: LoadedContent): Map<string, SourceMeta> {
  const map = new Map<string, SourceMeta>();
  for (const law of content.laws) {
    map.set(law.sourceId, {
      sourceType: law.sourceType as SourceType,
      sourceLevel: law.authorityLevel as SourceLevel,
      sourceGroup: groupOf(law.sourceType, law.authorityLevel),
      issuingAuthority: law.issuingAuthority,
      jurisdiction: law.jurisdiction,
      validityStatus: law.validityStatus as ValidityStatus,
      publishedDate: law.promulgationDate,
      retrievedAt: law.retrievedAt,
      verificationStatus: law.verificationStatus as VerificationStatus,
      reviewStatus: law.reviewStatus,
      url: law.officialUrl,
      title: law.title,
    });
  }
  for (const c of content.cases) {
    map.set(c.sourceId, {
      sourceType: "case" as SourceType,
      sourceLevel: c.authorityLevel as SourceLevel,
      sourceGroup: groupOf("case", c.authorityLevel as SourceLevel),
      issuingAuthority: c.publishingAuthority,
      jurisdiction: c.jurisdiction,
      validityStatus: "not_applicable" as ValidityStatus,
      publishedDate: c.publicationDate,
      retrievedAt: c.retrievedAt,
      verificationStatus: c.verificationStatus as VerificationStatus,
      reviewStatus: c.reviewStatus,
      url: c.officialUrl,
      title: c.title,
    });
  }
  return map;
}

export const MAX_EVIDENCE = 12;
export const MAX_SIMILAR_CASES = 3;
export const MAX_EVIDENCE_CHARS = 320;

/** 证据排序键（综合权威性、相关性、时效性、地域适用性、效力状态；确定性平级用 chunkId）。 */
export function evidenceRankKey(hit: QueryResult): { level: number; validity: number; relevance: number; jurisdiction: number; published: number; chunkId: string } {
  const level = hit.sourceLevel === "A" ? 0 : hit.sourceLevel === "B" ? 1 : hit.sourceLevel === "C" ? 2 : 3;
  const validity = hit.validityStatus === "effective" ? 0 : hit.validityStatus === "amended" ? 1 : hit.validityStatus === "not_applicable" ? 2 : 3;
  const jurisdiction = hit.jurisdiction === "全国性" ? 0 : 1;
  const published = hit.publishedDate !== "" && hit.publishedDate !== undefined ? -Number(hit.publishedDate.replace(/[^0-9]/g, "")) : 0;
  return {
    level,
    validity,
    relevance: hit.score,
    jurisdiction,
    published,
    chunkId: hit.chunkId,
  };
}

/** 证据选取：确保至少 1 条 A 级规范（检索端保证）；相似案例最多 MAX_SIMILAR_CASES 条；总量上限 MAX_EVIDENCE。 */
export function selectEvidence(hits: QueryResult[], opts: { topK?: number } = {}): QueryResult[] {
  const topK = opts.topK ?? MAX_EVIDENCE;
  const sorted = [...hits].sort((a, b) => {
    const ka = evidenceRankKey(a);
    const kb = evidenceRankKey(b);
    if (ka.level !== kb.level) return ka.level - kb.level;
    if (ka.validity !== kb.validity) return ka.validity - kb.validity;
    if (kb.relevance !== ka.relevance) return kb.relevance - ka.relevance;
    if (ka.jurisdiction !== kb.jurisdiction) return ka.jurisdiction - kb.jurisdiction;
    if (kb.published !== ka.published) return kb.published - ka.published;
    return a.chunkId.localeCompare(b.chunkId) || a.docId.localeCompare(b.docId);
  });
  const selected: QueryResult[] = [];
  const cases: QueryResult[] = [];
  for (const hit of sorted) {
    if (hit.kind === "case") {
      cases.push(hit);
    } else {
      selected.push(hit);
    }
  }
  const finalHits = [...selected.slice(0, topK - Math.min(cases.length, MAX_SIMILAR_CASES))];
  finalHits.push(...cases.slice(0, MAX_SIMILAR_CASES));
  return finalHits.slice(0, topK);
}

/** 证据文本片段裁剪（保留可读性；摘录不得视为完整条文）。 */
export function clip(text: string, max = MAX_EVIDENCE_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** 生成发送给模型的证据文本（编号 [S1]…[Sn]，含分级/效力/地区元数据；分级标签为文字标签，不含歧义）。 */
export function buildEvidenceText(hits: QueryResult[], sourceMeta: Map<string, SourceMeta>): string {
  return hits
    .map((c, i) => {
      const meta = sourceMeta.get(c.docId);
      const levelLabel = evidenceLevelLabel(c, meta);
      const scopeNote =
        c.sourceLevel === "C" && meta?.sourceType === "local_guidance"
          ? "（地方裁审口径，仅适用于山东省，不是全国统一规则）"
          : c.sourceLevel === "B"
            ? "（案例仅供类案参考，不具有普遍约束力）"
            : "";
      const validityLabel =
        c.validityStatus === "effective" ? "现行有效" : c.validityStatus === "amended" ? "现行有效（有修正）" : c.kind === "case" ? "案例参考" : c.validityStatus;
      const authority = meta?.issuingAuthority ?? "";
      const jurisdiction = c.jurisdiction || "全国性";
      return `[S${i + 1}] 《${c.title}》${c.locator ? `（${c.locator}）` : ""}｜${levelLabel}${scopeNote}｜${validityLabel}｜发布机关：${authority}｜适用地区：${jurisdiction}｜${c.kind === "case" ? "案例要旨：" : "条文："}${clip(c.text)}`;
    })
    .join("\n\n");
}

/** 证据分级文字标签（A 全国性规范 / B 官方案例 / C 地方指引或补充线索 / D 补充线索）。 */
export function evidenceLevelLabel(c: Pick<QueryResult, "sourceLevel" | "kind">, meta?: SourceMeta): string {
  if (c.sourceLevel === "A") {
    return "A级·全国性法律规范";
  }
  if (c.sourceLevel === "B") {
    return "B级·官方案例参考";
  }
  if (c.sourceLevel === "C") {
    return meta?.sourceType === "local_guidance" ? "C级·地方裁审参考" : "C级·补充线索";
  }
  return "D级·补充线索";
}

/** 检索是否足够（不用于“资料不足拒答”，仅用于决定是否需要发起联网搜索）。 */
export function hasSufficientLocalEvidence(hits: QueryResult[]): boolean {
  return hits.some((h) => h.sourceLevel === "A" && h.score >= MIN_RELEVANCE_SCORE);
}