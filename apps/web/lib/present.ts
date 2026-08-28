import { SOURCE_LEVEL_LABELS, SOURCE_TYPE_LABELS } from "@laoyouju/shared";
import type { AskSuccessResponse, Clarification, SourceCitation } from "@laoyouju/shared";

/**
 * 三态回答的纯展示映射（无 React/DOM 依赖，可被 Node 测试直接断言）。
 * 所有文案为确定性常量；核验状态如实展示（source_verified 绝不显示为“已通过专业复核”）。
 */

export const GROUP_LABELS: Readonly<Record<string, string>> = {
  law: "国家法律法规与司法解释（A 级）",
  judicial: "司法解释与仲裁程序（A 级）",
  local: "地方裁审参考（C 级，仅山东省）",
  case: "官方案例（B 级，类案参考）",
  supplement: "补充检索线索（C 级，待核验）",
};

export const REVIEW_STATUS_COPY: Readonly<Record<string, string>> = {
  draft: "草稿，未核对",
  source_verified: "已核对官方来源，尚待专业复核",
  legal_reviewed: "已通过专业复核",
};

export const VALIDITY_STATUS_COPY: Readonly<Record<string, string>> = {
  effective: "现行有效",
  amended: "现行有效（有修正）",
  repealed: "已废止",
  unknown: "效力状态不明",
  not_applicable: "案例参考",
};

export const COVERAGE_NOTE =
  "本回答优先依据 A 级全国性规则（法律、行政法规、部门规章、司法解释、仲裁程序文件）；B 级官方发布案例仅作类案参考，不具有普遍约束力。山东地方裁审指引（C 级）仅在问题涉及山东时以“山东地区裁审参考”单独列出，不属于全国统一法律依据；其他地区地方规则未作本地收录，涉及时会提示并引导核验地方官方来源。";

export const CLARIFICATION_FOLLOWUP_HINT =
  "请补充上述信息后重新提交，我会基于补充的事实与已核验的全国性规则继续分析。";

export const NO_SIMILAR_CASE_COPY = "暂未找到可核验的高度相似官方案例。";

export function reviewLabel(status: string): string {
  const copy = REVIEW_STATUS_COPY[status] ?? status;
  return copy;
}

export function validityLabel(status: string): string {
  const copy = VALIDITY_STATUS_COPY[status] ?? status;
  return copy;
}

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

export interface AnswerSection {
  key: string;
  heading: string;
  items: string[] | null;
}

/** answered 的八段结构（按固定顺序；空段返回 null，由 UI 隐藏）。 */
export function answerSections(data: AskSuccessResponse): AnswerSection[] {
  const a = data.answer;
  if (a === null) {
    return [];
  }
  return [
    { key: "issueIdentification", heading: "问题识别与争议焦点", items: [a.issueIdentification] },
    { key: "preliminaryConclusion", heading: "初步结论", items: [a.preliminaryConclusion] },
    { key: "applicableLaw", heading: "适用法律及具体条文（A 级 · 全国性法律依据）", items: a.applicableLaw.length > 0 ? a.applicableLaw : null },
    { key: "localGuidance", heading: "山东地区裁审参考（C 级 · 仅适用于山东省，非全国统一规则）", items: a.localGuidance.length > 0 ? a.localGuidance : null },
    { key: "similarCases", heading: "相似官方案例（B 级 · 类案参考）", items: a.similarCases.length > 0 ? a.similarCases : null },
    { key: "nextSteps", heading: "下一步行动", items: a.nextSteps.length > 0 ? a.nextSteps : null },
    { key: "evidenceChecklist", heading: "证据材料清单", items: a.evidenceChecklist.length > 0 ? a.evidenceChecklist : null },
    { key: "factsToConfirm", heading: "尚需确认的事实", items: a.factsToConfirm.length > 0 ? a.factsToConfirm : null },
    { key: "boundaries", heading: "信息边界", items: a.boundaries.length > 0 ? a.boundaries : null },
  ];
}

/** similarCases 为空时使用的诚实文案（不伪造案例）。 */
export function similarCasesOrPlaceholder(answer: AskSuccessResponse["answer"]): string[] {
  if (answer === null) {
    return [];
  }
  return answer.similarCases.length > 0 ? answer.similarCases : [NO_SIMILAR_CASE_COPY];
}

/** clarification 展示结构。 */
export function clarificationSections(data: AskSuccessResponse): { framework: string[]; conclusions: string[]; keyFacts: string[]; evidence: string[] } {
  const c: Clarification | null = data.clarification;
  if (c === null) {
    return { framework: [], conclusions: [], keyFacts: [], evidence: [] };
  }
  return {
    framework: c.legalFramework,
    conclusions: c.possibleConclusions,
    keyFacts: c.keyFactsNeeded,
    evidence: c.evidenceToPrepare,
  };
}

/** 来源卡片字段映射（officialUrl 原样透传；核验状态如实）。 */
export interface CitationView {
  ref: string;
  title: string;
  locator: string;
  authority: string;
  validityStatusLabel: string;
  jurisdiction: string;
  excerpt: string;
  url: string;
  publishedDate: string | null;
  reviewLabel: string;
  sourceLevel: string;
  sourceLevelLabel: string;
  sourceTypeLabel: string;
}

export function citationView(s: SourceCitation): CitationView {
  return {
    ref: s.citationRef,
    title: s.title,
    locator: s.locator,
    authority: s.issuingAuthority,
    validityStatusLabel: validityLabel(s.validityStatus),
    jurisdiction: s.jurisdiction,
    excerpt: s.excerpt,
    url: s.officialUrl,
    publishedDate: s.publishedDate,
    reviewLabel: reviewLabel(s.reviewStatus),
    sourceLevel: s.sourceLevel,
    sourceLevelLabel: s.sourceLevelLabel || SOURCE_LEVEL_LABELS[s.sourceLevel] || s.sourceLevel,
    sourceTypeLabel: s.sourceTypeLabel || SOURCE_TYPE_LABELS[s.sourceType] || s.sourceType,
  };
}

/** 按 group 分组（保持首次出现顺序），组内保持传入顺序。 */
export function groupSources(sources: readonly SourceCitation[]): { group: string; label: string; items: SourceCitation[] }[] {
  const groups: string[] = [];
  for (const s of sources) {
    if (!groups.includes(s.group)) {
      groups.push(s.group);
    }
  }
  return groups.map((g) => ({
    group: g,
    label: groupLabel(g),
    items: sources.filter((s) => s.group === g),
  }));
}