import {
  AI_NOTICE,
  API_VERSION,
  isProvincialJurisdiction,
  OUT_OF_SCOPE_MESSAGE,
  parseAskSuccessResponse,
  SOURCE_LEVEL_LABELS,
  SOURCE_TYPE_LABELS,
  type Answer,
  type AskSuccessResponse,
  type Clarification,
  type SourceCitation,
  type TopicId,
} from "@laoyouju/shared";
import {
  buildIndex,
  loadContent,
  MIN_RELEVANCE_SCORE,
  queryIndex,
  type BuiltIndex,
  type QueryResult,
} from "@laoyouju/retrieval";
import {
  type SearchProvider,
  type SearchResultItem,
  validateSearchItems,
} from "@laoyouju/search";
import { resolveDeepSeekConfig, resolveSearchProvider, type DeepSeekConfig } from "./config.js";
import { chatCompletion, UpstreamError } from "./deepseek.js";
import {
  classifyScope,
  decomposeIssues,
  extractFacts,
  inferTopicsFromText,
  isBareLaborQuery,
  isSituationQuestion,
  missingRequiredFacts,
  type FactSet,
  type MissingFactItem,
} from "./analyze.js";
import {
  buildEvidenceText,
  buildSourceMeta,
  clip,
  MAX_EVIDENCE,
  selectEvidence,
  type SourceMeta,
} from "./evidence.js";
import {
  buildSimilarCaseItem,
  chooseSimilarCases,
  collectSimilarCaseCandidates,
  evaluateCopresenceContract,
  rankCaseCandidates,
} from "./cases.js";
import { RequestGuard, limitMessage, resolveLimitConfig, type LimitDecision } from "./limit.js";
import { buildMessages } from "./prompt.js";

/** answered 输出上限：1200～1400 tokens（八段结构仍完整；同步链路约束下不再让模型生成双份输出）。 */
export const MAX_OUTPUT_TOKENS = 1300;
/** 模型调用超时：不超过 15 秒（须为检索、解析、网关返回预留时间；公网同步链路实测约 20s 失败）。 */
export const DEFAULT_TIMEOUT_MS = 15_000;
/** 每个问题最多调用两次联网搜索（产品约束）。 */
export const MAX_SEARCHES_PER_QUESTION = 2;

/** 回答中最多携带的山东地方裁审参考条数（C 级，仅作为地区口径补充）。 */
export const MAX_LOCAL_GUIDANCE = 2;

/** 山东省（含省内主要城市）判定：用于地方裁审指引的适用性门控。 */
const SHANDONG_LOCATION_TERMS: readonly string[] = [
  "山东", "济南", "青岛", "烟台", "潍坊", "淄博", "威海", "济宁", "泰安",
  "临沂", "德州", "聊城", "滨州", "菏泽", "东营", "日照", "枣庄", "莱芜",
];

/** 判断提取到的工作地点是否属于山东省（未提取地点返回 false）。 */
export function isShandongLocation(location: string | undefined): boolean {
  if (location === undefined || location === "") {
    return false;
  }
  return SHANDONG_LOCATION_TERMS.some(
    (t) => location === t || location.includes(t) || t.includes(location),
  );
}

const CITATION_RE = /\[S([1-9][0-9]{0,2})\]/g;

/** 每个话题的确定性代表查询（用于裸词/无 BM25 命中时的 topic fallback；基于真实条文文本检索）。 */
export const TOPIC_QUERY_MAP: Record<string, string> = {
  "work-injury": "工伤认定 申请 工伤保险待遇 停工留薪期",
  "working-hours-leave": "年休假 应休未休 工资报酬 折算",
  "social-insurance": "社会保险 缴费 用人单位 参保",
  "overtime-pay": "加班 延长工作时间 工资报酬 加班费",
  "unlawful-termination-compensation": "解除劳动合同 经济补偿 赔偿金",
  "compensation-and-damages": "经济补偿 赔偿金 计算",
  "wage-arrears": "拖欠工资 劳动报酬 支付",
  "double-wage-notice": "二倍工资 未订立书面劳动合同",
  "no-written-contract": "书面劳动合同 订立 二倍工资",
  "probation-disputes": "试用期 录用条件 解除",
  "noncompete-confidentiality": "竞业限制 补偿 保密",
  "labor-dispatch": "劳务派遣 用工单位 派遣单位",
  "new-employment-forms": "新就业形态 平台 劳动关系",
  "labor-relationship-recognition": "劳动关系 用工事实 认定",
  "arbitration-procedure": "劳动人事争议仲裁 管辖 申请",
  "arbitration-limitation": "仲裁时效 一年",
  "contract-performance": "劳动合同 变更 解除 终止",
  "female-worker-protection": "女职工 孕期 产期 哺乳期",
  "social-insurance-noncompete": "社会保险 竞业限制",
};

/** 每个话题的确定性“可能结论”框架（仅用于 needs_clarification 的法律框架说明；不套用无关话题模板）。 */
export const TOPIC_FRAMEWORK: Record<string, readonly string[]> = {
  "work-injury": [
    "工伤待遇取决于工伤认定与伤残等级：认定成功后按《工伤保险条例》项目支付待遇；用人单位未参加工伤保险的，由该单位按条例标准支付；停工留薪期内原工资福利待遇不变，由单位支付。",
    "是否构成工伤取决于事故/伤害是否因工作原因发生、工作时间和工作场所等要素；具体金额取决于伤残等级、本人工资与参保情况。",
  ],
  "working-hours-leave": [
    "应休未休年休假的折算与未休待遇取决于未休天数、日工资（月计薪天数约21.75天）与离职时点；单位已安排休假或书面承诺不休的说明影响结论。",
  ],
  "social-insurance": [
    "用人单位应当依法为劳动者缴纳社会保险费；未缴/断缴会影响养老、医疗、工伤等待遇，存在补缴与滞纳金问题；是否形成劳动关系决定参保义务主体。",
  ],
  "overtime-pay": [
    "加班费取决于工时制度、加班时长与计算基数：标准工时下休息日/休假日/延时加班分别按不低于200%/300%/150%支付；综合计算工时与不定时工时另有规则。",
  ],
  "unlawful-termination-compensation": [
    "辞退是否合法取决于解除理由与程序（协商一致、单位单方解除的法定情形、员工被迫离职等）；违法解除的赔偿金按经济补偿标准的二倍计算。",
  ],
  "compensation-and-damages": [
    "经济补偿按劳动者工作年限每满一年支付一个月工资；违法解除赔偿金为二倍经济补偿；基数一般为解除前十二个月平均工资。",
  ],
  "wage-arrears": [
    "拖欠工资可向劳动监察投诉或申请劳动仲裁；农民工工资另有特别保障制度（总包单位代付、工资保证金等）；仲裁时效一般为一年。",
  ],
  "double-wage-notice": [
    "未订立书面劳动合同的二倍工资自入职满一个月起算，最多十一个月；是否受时效等因素影响需结合事实。",
  ],
  "no-written-contract": ["用人单位应当自用工之日起一个月内订立书面劳动合同；逾期未订立的可主张二倍工资（最多十一个月）。"],
  "probation-disputes": [
    "试用期约定受期限与次数限制；试用期解除需以不符合录用条件等法定情形为依据；违法解除的赔偿问题按解除规则处理。",
  ],
  "noncompete-confidentiality": ["竞业限制应约定经济补偿；未约定补偿不影响条款效力但补偿计算有规则；期限最长不超过两年，且仅限负有保密义务人员。"],
  "labor-dispatch": ["派遣工与派遣单位订立劳动合同；用工单位仅在使用派遣工的情形下承担相应责任；退回与解除的条件有法定限制。"],
  "new-employment-forms": ["平台用工下双方是否构成劳动关系取决于用工事实与管理程度；不符合劳动关系的可适用书面协议与职业伤害保障等制度。"],
  "labor-relationship-recognition": ["劳动关系认定取决于用工事实（接受管理、从事有报酬劳动、业务组成部分等）；未签合同不影响事实劳动关系的成立。"],
  "arbitration-procedure": ["劳动争议一般先裁后审；仲裁管辖取决于用人单位所在地与劳动合同履行地；裁决不服可在法定期限内起诉。"],
  "arbitration-limitation": ["劳动仲裁时效一般为一年，自知道或应当知道权利被侵害时起算；劳动关系存续期间的拖欠劳动报酬争议不受一年限制（终止后一年内提出）。"],
  "contract-performance": ["劳动合同的订立、变更、解除与终止均有法定条件与程序；单方变更（调岗降薪）需协商一致或符合约定/法定情形。"],
  "female-worker-protection": ["对孕期、产期、哺乳期女职工的保护包括不得以特定理由解除、不得安排禁忌劳动、产假待遇等；违法解除的后果按解除规则处理。"],
  "social-insurance-noncompete": ["社会保险缴费义务与竞业限制补偿规则分别适用；两者均属劳动争议常见争议点。"],
};

const GENERIC_FRAMEWORK_NOTES: readonly string[] = [
  "该问题属于劳动争议范畴；法律结论取决于具体事实（时间、地点、主体、金额或过程）。",
  "以上为法律框架说明，不代表对您情形的确定结论；请补充关键事实后重新提问。",
];

export interface AskContext {
  config: DeepSeekConfig;
  fetchFn: typeof fetch;
  index: BuiltIndex;
  sourceMeta: Map<string, SourceMeta>;
  /** 联网搜索 Provider（未配置时本地知识库仍工作）。 */
  searchProvider?: SearchProvider | undefined;
  /** 当前日期（ISO；测试可注入）。 */
  now?: string | undefined;
  timeoutMs?: number | undefined;
  maxTokens?: number | undefined;
  /** Phase 8 上线保护：模型调用槽位（全局日额度/并发/kill switch）；未注入时不限制。 */
  guard?: RequestGuard | undefined;
}

export interface AskOutcome {
  status: number;
  errorCode: string | null;
  payload: unknown;
  /** Phase 8：429 建议等待秒数（供 Retry-After 头）。 */
  retryAfter?: number | undefined;
}

let cachedResources: { index: BuiltIndex; sourceMeta: Map<string, SourceMeta> } | undefined;

/** 加载（并缓存）检索索引 + 来源元数据。 */
export function loadAskResources(): { index: BuiltIndex; sourceMeta: Map<string, SourceMeta> } {
  if (cachedResources) {
    return cachedResources;
  }
  const content = loadContent();
  cachedResources = { index: buildIndex(content.laws, content.cases), sourceMeta: buildSourceMeta(content) };
  return cachedResources;
}

export function createDefaultAskContext(): AskContext {
  const { index, sourceMeta } = loadAskResources();
  return {
    config: resolveDeepSeekConfig(),
    fetchFn: globalThis.fetch,
    index,
    sourceMeta,
    // SearchProvider 缺省：未配置 WSA（WSA_API_KEY 缺失）时本地知识库仍可工作。
    searchProvider: resolveSearchProvider(),
    now: new Date().toISOString().slice(0, 10),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxTokens: MAX_OUTPUT_TOKENS,
    // Phase 8：上线保护（客户端限频/全局日额度/并发/kill switch；默认阈值可经 LIMIT_* 环境变量覆盖）。
    guard: new RequestGuard({ config: resolveLimitConfig() }),
  };
}

/** 从回答文本中提取所有 [S#] 引用。 */
export function extractCitationRefs(texts: string[]): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(CITATION_RE)) {
      out.add(`S${m[1]}`);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const ARTICLE_RE = /第[零一二三四五六七八九十百千0-9]+条/;

/** 移除不在有效集合内的 [S#] 引用（未知引用安全丢弃）。 */
function sanitizeRefs(text: string, valid: ReadonlySet<string>): string {
  return text.replace(CITATION_RE, (m, n: string) => (valid.has(`S${n}`) ? m : ""));
}

/** 判断字符串是否貌似“法律条文引述”。 */
function looksLikeArticleCitation(text: string): boolean {
  return ARTICLE_RE.test(text);
}

/**
 * 解析模型 JSON（answered 专用：调用前已确定分支，模型只生成 answer 结构）；
 * 若模型仍带 clarification 字段则忽略（不做双份输出）。失败返回 null（视为畸形内容）。
 */
function parseModelPayload(content: string): ModelAnswerShape | null {
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return null;
  }
  const record = obj as Record<string, unknown>;
  const answerRaw = record.answer as Record<string, unknown> | undefined;
  if (answerRaw === undefined) {
    return null;
  }
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s) => s.length > 0) : []);
  const answer: ModelAnswerShape = {
    issueIdentification: str(answerRaw.issueIdentification),
    preliminaryConclusion: str(answerRaw.preliminaryConclusion),
    applicableLaw: arr(answerRaw.applicableLaw),
    similarCases: arr(answerRaw.similarCases),
    nextSteps: arr(answerRaw.nextSteps),
    evidenceChecklist: arr(answerRaw.evidenceChecklist),
    factsToConfirm: arr(answerRaw.factsToConfirm),
    boundaries: arr(answerRaw.boundaries),
  };
  if (answer.issueIdentification === "" || answer.preliminaryConclusion === "") {
    return null;
  }
  return answer;
}

interface ModelAnswerShape {
  issueIdentification: string;
  preliminaryConclusion: string;
  applicableLaw: string[];
  similarCases: string[];
  nextSteps: string[];
  evidenceChecklist: string[];
  factsToConfirm: string[];
  boundaries: string[];
}

function outOfScopePayload(requestId: string): AskSuccessResponse {
  return {
    ok: true,
    apiVersion: API_VERSION,
    requestId,
    outcome: "out_of_scope",
    topicIds: [],
    coverage: { scope: "全国性规则", localRulesCovered: false },
    answer: null,
    clarification: null,
    outOfScope: {
      message: OUT_OF_SCOPE_MESSAGE,
      suggestedTopics: [
        "公司拖欠工资，我应该怎么追讨？",
        "被违法辞退，经济补偿和赔偿金怎么算？",
        "加班费应该怎么计算？",
        "入职后一直没签劳动合同，能主张二倍工资吗？",
        "试用期内被辞退合法吗？",
        "单位不缴社保，我能主张什么？",
      ],
      aiNotice: AI_NOTICE,
    },
    sources: [],
  };
}

/** 依据证据（不依赖模型输出）构造安全的 needs_clarification 框架（模型畸形输出/引用异常的兜底）。
 *  框架按 topic 与真实 evidence 生成：legalFramework 来自 A 级证据；可能结论来自话题框架；
 *  关键事实与证据清单来自 FACT_REQUIREMENTS（按话题）；绝不输出固定的“辞退/赔偿金/仲裁时效”模板。 */
function fallbackClarification(
  requestId: string,
  question: string,
  topics: readonly TopicId[],
  evidence: EvidenceItem[],
  missing: MissingFactItem[],
  meta: Map<string, SourceMeta>,
  ctx: AskContext,
): AskSuccessResponse {
  let items = evidence;
  const inferred = topics.length > 0 ? topics : (inferTopicsFromText(question) as TopicId[]);
  if (!items.some((e) => e.chunk.sourceLevel === "A") && inferred.length > 0) {
    const fb = retrieveByTopic(ctx.index, inferred).map((chunk, i) => ({ chunk, ref: "S" + (i + 1) }));
    const seen = new Set(items.map((e) => e.chunk.docId + "\u0000" + e.chunk.chunkId));
    for (const e of fb) {
      if (!seen.has(e.chunk.docId + "\u0000" + e.chunk.chunkId)) {
        items = [...items, e];
        seen.add(e.chunk.docId + "\u0000" + e.chunk.chunkId);
      }
    }
  }
  const aItems = items.filter((e) => e.chunk.sourceLevel === "A").slice(0, 6);
  // Phase 7C-1：澄清路径同样携带山东地方裁审参考（C 级，仅作地区口径补充；地点明确非山东时排除）。
  const clarLocation = extractFacts(question).location;
  const clarGuidance = buildClarificationGuidance(ctx, inferred, items, clarLocation);
  const legalFramework = aItems.length > 0
    ? [
        ...aItems.map((e) => `《${e.chunk.title}》${e.chunk.locator ? `（${e.chunk.locator}）` : ""} [${e.ref}]：${clip(e.chunk.text, 160)}`),
        ...clarGuidance.items,
      ]
    : clarGuidance.items.length > 0
      ? clarGuidance.items
      : ["该问题属于劳动争议范畴；请补充问题背景（涉及劳动合同、工资、社保、工伤或劳动仲裁等具体事项）后重新提问。"];
  const possibleConclusions = possibleConclusionsFor(inferred);
  const requirements = missing.length > 0 ? missing : missingRequiredFacts(inferred, emptyFacts());
  const keyFactsNeeded = requirements.length > 0
    ? requirements.map((r) => r.description)
    : ["案件的关键时间点与具体过程（建议按时间线描述）"];
  const evidenceToPrepare = requirements.length > 0
    ? requirements.map((r) => r.evidenceTip)
    : ["劳动合同、工资流水、考勤记录、解除/辞退证明等书面材料"];
  const clarification: Clarification = {
    legalFramework,
    possibleConclusions,
    keyFactsNeeded,
    evidenceToPrepare,
    aiNotice: AI_NOTICE,
  };
  const response: AskSuccessResponse = {
    ok: true,
    apiVersion: API_VERSION,
    requestId,
    outcome: "needs_clarification",
    topicIds: ([...new Set([...inferred, ...items.flatMap((e) => e.chunk.topicIds)])] as TopicId[]).slice(0, 10),
    coverage: { scope: "全国性规则", localRulesCovered: false },
    answer: null,
    clarification,
    outOfScope: null,
    sources: [...aItems.map((e) => buildCitation(e, meta.get(e.chunk.docId))), ...clarGuidance.sources],
  };
  const parsed = parseAskSuccessResponse(response);
  return parsed.success ? parsed.data : response;
}

function emptyFacts(): FactSet {
  return {
    hasContractAbsence: false,
    hasWrittenContract: false,
    hasProbationContext: false,
    hasOvertimeHours: false,
    hasInjuryContext: false,
    hasPregnancyContext: false,
    hasArbitrationDateContext: false,
    hasDispatchContext: false,
    hasPlatformContext: false,
    hasSpecificAmount: false,
    hasTimeExpression: false,
    firstPersonSituation: false,
    raw: [],
  };
}

/** 按话题返回确定性“可能结论”框架；话题无匹配时用中性说明（不套用无关话题模板）。 */
function possibleConclusionsFor(topics: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of topics.slice(0, 6)) {
    const fw = TOPIC_FRAMEWORK[t];
    if (fw !== undefined) {
      out.push(...fw);
    }
  }
  if (out.length === 0) {
    out.push(...GENERIC_FRAMEWORK_NOTES);
  }
  return out.slice(0, 6);
}

/** 按话题从索引中确定性选取真实 A 级规范条文（topic fallback；裸劳动词/BM25 无命中时使用）。 */
export function retrieveByTopic(index: BuiltIndex, topics: readonly unknown[], perTopic = 3): QueryResult[] {
  const out: QueryResult[] = [];
  const seen = new Set<string>();
  for (const t of topics.slice(0, 6)) {
    const query = TOPIC_QUERY_MAP[t as string];
    if (query === undefined) {
      continue;
    }
    let taken = 0;
    for (const r of queryIndex(index, query, perTopic * 4, t as string)) {
      if (r.kind !== "provision" || r.sourceLevel !== "A") {
        continue;
      }
      const key = r.docId + "\u0000" + r.chunkId;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(r);
      taken++;
      if (taken >= perTopic) {
        break;
      }
    }
  }
  return out.slice(0, MAX_EVIDENCE);
}

/**
 * 判断证据块是否为“内容库地方裁审指引”（C 级 + 省级 jurisdiction + sourceType=local_guidance）。
 * 注意：联网检索线索也是 C 级（补充线索），但不是地方裁审指引，不进入 localGuidance。
 */
export function isLocalGuidanceChunk(c: QueryResult, sourceMeta: Map<string, SourceMeta>): boolean {
  return (
    c.sourceLevel === "C" &&
    isProvincialJurisdiction(c.jurisdiction) &&
    sourceMeta.get(c.docId)?.sourceType === "local_guidance"
  );
}

/**
 * 收集本次证据中的山东地方裁审参考（确定性，最多 MAX_LOCAL_GUIDANCE 条）：
 * 1) 优先取检索池（hits）中合格 C 级地方指引（score ≥ MIN_RELEVANCE_SCORE，防止弱相关进入）；
 * 2) 检索池没有时，按话题补充检索（TOPIC_QUERY_MAP + 山东裁审词，绝不硬编码 sourceId）。
 * 仅供程序组装 localGuidance / 澄清框架使用；不进入 applicableLaw。
 */
export function collectLocalGuidance(
  index: BuiltIndex,
  topics: readonly TopicId[],
  pool: readonly QueryResult[],
  sourceMeta: Map<string, SourceMeta>,
): QueryResult[] {
  const seen = new Map<string, QueryResult>();
  for (const h of pool) {
    if (isLocalGuidanceChunk(h, sourceMeta) && h.score >= MIN_RELEVANCE_SCORE) {
      seen.set(h.docId + "\u0000" + h.chunkId, h);
    }
  }
  if (seen.size === 0 && topics.length > 0) {
    for (const t of topics.slice(0, 4)) {
      const query = TOPIC_QUERY_MAP[t];
      if (query === undefined) {
        continue;
      }
      for (const rr of queryIndex(index, query + " 山东省 地方裁审", 6, t)) {
        if (isLocalGuidanceChunk(rr, sourceMeta) && rr.score >= MIN_RELEVANCE_SCORE) {
          seen.set(rr.docId + "\u0000" + rr.chunkId, rr);
        }
      }
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId) || a.docId.localeCompare(b.docId))
    .slice(0, MAX_LOCAL_GUIDANCE);
}

/** 单独一条 localGuidance 条目的确定性文案（含适用地域说明；地点未知使用条件化表述）。 */
export function guidanceItem(c: QueryResult, ref: string, location: string | undefined): string {
  const isSd = isShandongLocation(location);
  const prefix = isSd ? "山东地区裁审参考：" : "如争议发生在山东，可参考：";
  const suffix = isSd ? "（仅适用于山东省，不属于全国统一法律规则）。" : "；其他地区裁审口径可能不同。";
  const locator = c.locator ? "（" + c.locator + "）" : "";
  return prefix + "《" + c.title + "》" + locator + "[" + ref + "]：" + clip(c.text, 200) + suffix;
}

/** 组装 answered 的 localGuidance 字段（地点明确为非山东时为空数组）。 */
export function buildLocalGuidanceItems(
  chunks: readonly QueryResult[],
  evidence: readonly EvidenceItem[],
  location: string | undefined,
): string[] {
  if (location !== undefined && !isShandongLocation(location)) {
    return [];
  }
  const refByKey = new Map(
    evidence.map((e) => [e.chunk.docId + "\u0000" + e.chunk.chunkId, e.ref]),
  );
  const items: string[] = [];
  for (const g of chunks) {
    const ref = refByKey.get(g.docId + "\u0000" + g.chunkId);
    if (ref !== undefined) {
      items.push(guidanceItem(g, ref, location));
    }
    if (items.length >= MAX_LOCAL_GUIDANCE) {
      break;
    }
  }
  return items;
}

/** 澄清（needs_clarification）路径附加的山东地方裁审参考（仅当地点未知或为山东时）。 */
function buildClarificationGuidance(
  ctx: AskContext,
  topics: readonly TopicId[],
  items: readonly EvidenceItem[],
  location: string | undefined,
): { items: string[]; sources: SourceCitation[] } {
  if (location !== undefined && !isShandongLocation(location)) {
    return { items: [], sources: [] };
  }
  const refByKey = new Map(
    items.map((e) => [e.chunk.docId + "\u0000" + e.chunk.chunkId, e.ref]),
  );
  const guides = collectLocalGuidance(
    ctx.index,
    topics,
    items.map((e) => e.chunk),
    ctx.sourceMeta,
  );
  const itemsOut: string[] = [];
  const sources: SourceCitation[] = [];
  let next = items.length + 1;
  for (const g of guides) {
    const key = g.docId + "\u0000" + g.chunkId;
    const ref = refByKey.get(key) ?? "S" + next++;
    itemsOut.push(guidanceItem(g, ref, location));
    sources.push(buildCitation({ chunk: g, ref }, ctx.sourceMeta.get(g.docId)));
  }
  return { items: itemsOut, sources };
}

/** similarCases 分区：只接受“纯 B 级案例引用”的条目；引用非案例/非 B 级来源的条目整条丢弃。 */
function cleanSimilarCases(
  items: string[],
  valid: ReadonlySet<string>,
  levelByRef: ReadonlyMap<string, string>,
  isCaseByRef: ReadonlyMap<string, boolean>,
): string[] {
  const out: string[] = [];
  for (const raw of items) {
    const t = sanitizeRefs(raw, valid).trim();
    if (t.length === 0) {
      continue;
    }
    const refs = extractCitationRefs([t]);
    if (refs.length === 0) {
      out.push(t); // 占位文案（如“未找到高度相似官方案例”）
      continue;
    }
    if (refs.every((ref) => levelByRef.get(ref) === "B" && isCaseByRef.get(ref) === true)) {
      out.push(t);
    }
    if (out.length >= 10) {
      break;
    }
  }
  return out;
}

/** 携带山东地方裁审参考时追加到 boundaries 的确定性说明。 */
function localGuidanceNotice(location: string | undefined): string {
  return isShandongLocation(location)
    ? "山东地区裁审参考仅适用于山东省的裁审实践，不属于全国统一法律规则；其他地区裁审口径可能不同。"
    : "如争议发生在山东，可参考山东地区裁审口径；其他地区裁审口径可能不同。";
}

interface EvidenceItem {
  chunk: QueryResult;
  ref: string;
}

function buildCitation(item: EvidenceItem, m: SourceMeta | undefined): SourceCitation {
  const meta = m ?? {
    sourceType: "policy" as const,
    sourceLevel: item.chunk.sourceLevel as "A" | "B" | "C" | "D",
    sourceGroup: item.chunk.kind === "supplement" ? ("supplement" as const) : ("law" as const),
    issuingAuthority: "",
    jurisdiction: item.chunk.jurisdiction || "全国性",
    validityStatus: (item.chunk.validityStatus === "effective" || item.chunk.validityStatus === "amended") ? item.chunk.validityStatus : "unknown",
    publishedDate: item.chunk.publishedDate || null,
    retrievedAt: "2026-08-27",
    verificationStatus: ("unverified" as const),
    reviewStatus: (item.chunk.reviewStatus as "draft" | "source_verified" | "legal_reviewed") || "draft",
    url: item.chunk.officialUrl,
    title: item.chunk.title,
  };
  return {
    citationRef: item.ref,
    sourceId: item.chunk.docId,
    title: item.chunk.title,
    sourceType: meta.sourceType,
    sourceTypeLabel: SOURCE_TYPE_LABELS[meta.sourceType] ?? meta.sourceType,
    sourceLevel: meta.sourceLevel,
    sourceLevelLabel: SOURCE_LEVEL_LABELS[meta.sourceLevel] ?? meta.sourceLevel,
    group: meta.sourceGroup,
    issuingAuthority: meta.issuingAuthority || item.chunk.title,
    jurisdiction: meta.jurisdiction,
    locator: item.chunk.locator || "全文",
    officialUrl: item.chunk.officialUrl,
    validityStatus: meta.validityStatus,
    publishedDate: meta.publishedDate,
    retrievedAt: meta.retrievedAt,
    excerpt: clip(item.chunk.text, 300),
    reviewStatus: meta.reviewStatus,
    verificationStatus: meta.verificationStatus,
    topicIds: (item.chunk.topicIds ?? []).slice(0, 10) as TopicId[],
  };
}

export interface SearchUseDecision {
  shouldSearch: boolean;
  reasons: string[];
}

/**
 * 判断是否发起联网搜索（确定性；与“资料不足拒答”无关）：
 *  - 本地缺少 A 级规范证据；
 *  - 问题涉及地方规则/地方口径且给出地点；
 *  - 缺少相似官方案例且问题属于案例密集主题；
 *  - 新就业形态等新兴主题缺少本地案例。
 */
export function decideSearchUse(opts: {
  topicIds: readonly TopicId[];
  location?: string | undefined;
  hits: readonly QueryResult[];
  providerConfigured: boolean;
}): SearchUseDecision {
  if (!opts.providerConfigured) {
    return { shouldSearch: false, reasons: ["搜索服务未配置（本地知识库模式）"] };
  }
  const reasons: string[] = [];
  const topics = new Set<string>(opts.topicIds);
  const hasA = opts.hits.some((h) => h.sourceLevel === "A" && h.score >= MIN_RELEVANCE_SCORE);
  const hasCase = opts.hits.some((h) => h.kind === "case");
  const caseSensitive = [
    "new-employment-forms",
    "labor-dispatch",
    "work-injury",
    "probation-disputes",
    "unlawful-termination-compensation",
    "noncompete-confidentiality",
  ].some((t) => topics.has(t));
  if (!hasA) {
    reasons.push("本地A级规范证据不足");
  }
  if (!hasCase && caseSensitive) {
    reasons.push("缺少相似官方案例");
  }
  const localSensitive = ["social-insurance", "female-worker-protection", "work-injury", "arbitration-procedure", "compensation-and-damages"].some((t) => topics.has(t));
  if (opts.location !== undefined && localSensitive) {
    reasons.push(`涉及${opts.location}地方规则/口径`);
  }
  if (topics.has("new-employment-forms") && !hasCase) {
    reasons.push("新就业形态缺少本地案例");
  }
  return { shouldSearch: reasons.length > 0, reasons };
}

/** 构造联网搜索查询（优先官方线索；不直接透传用户原始指令）。 */
export function buildSearchQuery(opts: { focusPoints: string[]; location?: string | undefined }): string {
  const focus = opts.focusPoints[0] ?? "劳动争议";
  const base = `${opts.location !== undefined ? opts.location + " " : ""}${focus} 官方规定 案例`;
  return base.trim().slice(0, 120);
}

/** 把已校验的联网搜索结果转成证据项（C 级补充线索；绝不当作完整法条）。 */
export function toSearchEvidenceItem(item: { url: string; title: string; snippet: string; publishedAt?: string }, index: number): EvidenceItem {
  const docId = "web-link-" + sha16(item.url);
  return {
    chunk: {
      docId,
      chunkId: docId + "-c" + index,
      kind: "supplement",
      title: item.title.slice(0, 200),
      locator: "联网检索线索",
      text: item.snippet.slice(0, 500),
      officialUrl: item.url,
      validityStatus: "unknown",
      reviewStatus: "draft",
      verificationStatus: "unverified",
      sourceLevel: "C",
      jurisdiction: "待核验",
      publishedDate: item.publishedAt ?? "",
      topicIds: [],
      keywords: [],
      score: 0,
    } as QueryResult,
    ref: "",
  };
}

function sha16(input: string): string {
  // 确定性短哈希（用于生成 web-link- 前缀的稳定 docId；不改写 URL 内容）。
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** 组装答案字段（引用净化后的字符串数组）。 */
function cleanList(items: string[], valid: ReadonlySet<string>): string[] {
  return items
    .map((t) => sanitizeRefs(t, valid))
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 20);
}

/**
 * 执行一次问答（Phase 7A v2 流程）：
 * 1. 判断是否属于劳动争议（out_of_scope 不调用模型）；
 * 2. 提取地点、时间、劳动关系类型、解除原因、工资、工龄等事实；
 * 3. 将复合问题拆成多个争议焦点；
 * 4. 先查本地权威知识库；
 * 5. 若涉及新法规、地方规则、时效性问题或本地无高度相关案例 → 调用 SearchProvider（每次问题最多 2 次）；
 * 6. 按来源权威性、相关性、时效性、地域适用性重新排序；
 * 6.5 调用前确定分支：具体个案且缺关键事实 → 证据驱动 needs_clarification（不调用模型）；
 * 7. 组织证据交给 DeepSeek（只生成 answer 结构；只能引用本次证据集）；
 * 8. 服务端逐项校验 citation；
 * 9. 输出 answered；模型畸形/引用异常时回退到证据驱动 needs_clarification（绝不泛化“资料不足”）。
 */
export async function runAsk(question: string, requestId: string, ctx: AskContext): Promise<AskOutcome> {
  const now = ctx.now ?? new Date().toISOString().slice(0, 10);

  // 1. 领域判定（out_of_scope：固定文案，不调用 DeepSeek、不调用 WSA）。
  const scope = classifyScope(question);
  if (scope.scope === "out_of_scope") {
    return { status: 200, errorCode: null, payload: outOfScopePayload(requestId) };
  }

  // 2. 事实提取 + 焦点拆分 + 缺失事实。
  const facts = extractFacts(question);
  const deco = decomposeIssues(question);
  const missing = missingRequiredFacts(deco.topicIds, facts);
  const situationQ = isSituationQuestion(facts);

  // 3. 裸劳动词（工伤/年假/社保/加班/辞退怎么办 等）：不调用模型，
  //    通过 topic fallback 检索真实 A 级规范，返回证据驱动的 needs_clarification。
  if (isBareLaborQuery(question, facts)) {
    const bareTopics: TopicId[] = deco.topicIds.length > 0
      ? deco.topicIds
      : (inferTopicsFromText(question) as TopicId[]);
    const bareEvidence = retrieveByTopic(ctx.index, bareTopics)
      .map((chunk, i) => ({ chunk, ref: "S" + (i + 1) }));
    const bareMissing = missingRequiredFacts(bareTopics, facts);
    return {
      status: 200,
      errorCode: null,
      payload: fallbackClarification(requestId, question, bareTopics, bareEvidence, bareMissing, ctx.sourceMeta, ctx),
    };
  }

  // 4. 缺少 API Key → 503（在调用模型前检查；裸词/out_of_scope 不依赖模型，不受影响）。
  if (ctx.config.apiKey === "") {
    return { status: 503, errorCode: "SERVICE_NOT_READY", payload: errorBody(requestId, "SERVICE_NOT_READY", "问答服务未配置密钥，暂时无法使用", false) };
  }

  // 5. 本地检索（话题过滤 + 全局混合）。
  const pool = new Map<string, QueryResult>();
  const add = (r: QueryResult): void => {
    pool.set(r.docId + "\u0000" + r.chunkId, r);
  };
  for (const q of [question, ...deco.focusPoints]) {
    for (const r of queryIndex(ctx.index, q, 10)) {
      add(r);
    }
  }
  for (const topic of deco.topicIds.slice(0, 8)) {
    for (const r of queryIndex(ctx.index, question, 8, topic)) {
      add(r);
    }
  }
  let hits = [...pool.values()];

  // 5.1 证据兜底：本地 BM25 无 A 级命中时，按话题从索引确定性补充真实 A 级规范
  //     （保证 answered/needs_clarification 至少有一项 A 类来源；topic 映射确定性、可审计）。
  if (!hits.some((h) => h.sourceLevel === "A")) {
    const fbTopics = deco.topicIds.length > 0 ? deco.topicIds : (inferTopicsFromText(question) as TopicId[]);
    for (const r of retrieveByTopic(ctx.index, fbTopics)) {
      add(r);
    }
    hits = [...pool.values()];
  }

  // 5. 联网搜索（预算 ≤ 2；结果经 URL/域名/时间/文本校验后才进入证据集，且仅作为 C 级线索）。
  const searchDecision = decideSearchUse({
    topicIds: deco.topicIds,
    location: facts.location,
    hits,
    providerConfigured: ctx.searchProvider !== undefined && ctx.searchProvider.configured,
  });
  const searchRecords: { query: string; accepted: number; rejected: number }[] = [];
  if (searchDecision.shouldSearch && ctx.searchProvider !== undefined && ctx.searchProvider.configured) {
    let guard = 0;
    const queryCandidates = [
      buildSearchQuery({ focusPoints: deco.focusPoints, location: facts.location }),
      buildSearchQuery({ focusPoints: deco.topicLabels.length > 0 ? [deco.topicLabels[0] ?? "劳动争议"] : ["劳动争议"], location: facts.location }),
    ];
    for (const query of queryCandidates) {
      if (guard >= MAX_SEARCHES_PER_QUESTION) {
        break;
      }
      guard++;
      try {
        const items: SearchResultItem[] = await ctx.searchProvider.search({ query, limit: 8 });
        const { accepted, rejected } = validateSearchItems(items, {
          extraOfficialDomains: [],
          deniedDomains: ["mp.weixin.qq.com", "weixin.qq.com", "xiaohongshu.com", "douyin.com", "zhihu.com", "baidu.com", "sogou.com"],
          now,
        });
        searchRecords.push({ query, accepted: accepted.length, rejected: rejected.length });
        accepted.slice(0, 4).forEach((v, i) => {
          add(toSearchEvidenceItem(v.item, i).chunk);
        });
      } catch {
        // 联网搜索失败不阻断本地回答：记录并继续（绝不因搜索失败而拒绝回答）。
        searchRecords.push({ query, accepted: 0, rejected: 0 });
      }
    }
    hits = [...pool.values()];
  }

  // 6. 证据组织：权威性/相关性/时效性/地域适用性排序 + 选取；保证至少一条 A 级规范。
  let evidence = selectEvidence(hits).map((chunk, i) => ({ chunk, ref: "S" + (i + 1) }));
  if (!evidence.some((e) => e.chunk.sourceLevel === "A")) {
    const aHit = hits
      .filter((h) => h.sourceLevel === "A")
      .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))[0];
    if (aHit !== undefined) {
      evidence.push({ chunk: aHit, ref: "S" + (evidence.length + 1) });
    }
  }
  evidence = evidence.slice(0, MAX_EVIDENCE);

  // 6.2 Phase 7C-1：山东地方裁审参考（C 级）——仅当提问地点为山东（或地点未知）时收集；
  //     地点明确为其他省份时不得出现（避免把山东口径描述为当地/全国规则）。
  const askLocation = facts.location;
  const localGuidanceChunks =
    askLocation === undefined || isShandongLocation(askLocation)
      ? collectLocalGuidance(ctx.index, deco.topicIds, hits, ctx.sourceMeta)
      : [];
  if (localGuidanceChunks.length > 0) {
    const existing = new Set(evidence.map((e) => e.chunk.docId + "\u0000" + e.chunk.chunkId));
    for (const g of localGuidanceChunks) {
      const key = g.docId + "\u0000" + g.chunkId;
      if (!existing.has(key)) {
        evidence.push({ chunk: g, ref: "S" + (evidence.length + 1) });
        existing.add(key);
      }
    }
  }

  // 6.5 调用前确定分支：事实不足（具体个案 + 缺关键事实）→ 不调用 DeepSeek，
  //     直接使用证据驱动 clarification 生成路径（法律框架来自真实 A 级证据、可能结论来自话题框架、
  //     关键事实与证据清单来自确定性事实提取；绝不生成无意义的双份模型输出）。
  //     注意：isBareLaborQuery 已在第 3 步处理裸劳动词；此处处理“具体个案但关键事实缺失”。
  if (situationQ && missing.length > 0) {
    return {
      status: 200,
      errorCode: null,
      payload: fallbackClarification(requestId, question, deco.topicIds, evidence, missing, ctx.sourceMeta, ctx),
    };
  }

  const evidenceText = buildEvidenceText(evidence.map((e) => e.chunk), ctx.sourceMeta);
  const aCount = evidence.filter((e) => e.chunk.sourceLevel === "A").length;
  const caseCount = evidence.filter((e) => e.chunk.kind === "case").length;
  const factsLine = facts.raw.length > 0 ? facts.raw.map((f) => f.type + "=" + f.value).join("，") : "无（需要用户补充）";
  const missingLine = missing.length > 0 ? missing.map((m) => m.description).join("；") : "无明显缺失";
  const searchLine = searchDecision.shouldSearch
    ? (searchRecords.length > 0 ? "已执行 " + searchRecords.length + " 次（预算 " + MAX_SEARCHES_PER_QUESTION + "）" : "执行中无结果") + (searchDecision.reasons.length > 0 ? "；触发原因：" + searchDecision.reasons.join("；") : "")
    : "未触发（本地知识库足够或未配置联网搜索）";
  const analysisLines = [
    "- 领域判定：劳动争议（命中信号：详见分析）",
    "- 识别到的争议焦点：" + deco.focusPoints.join("；"),
    "- 命中的话题：" + deco.topicLabels.join("、"),
    "- 已识别事实：" + factsLine,
    "- 缺失关键事实：" + missingLine,
    "- 联网检索：" + searchLine,
    "- 证据数量：" + evidence.length + "（A级 " + aCount + "；官方案例 " + caseCount + "）",
    "- 山东地方裁审指引（C级）：" + (localGuidanceChunks.length > 0
      ? "证据包含山东地方裁审参考（仅作为山东地区裁审口径参考，不属于全国统一规则）"
      : askLocation !== undefined && !isShandongLocation(askLocation)
        ? "提问地点为" + askLocation + "，山东地方裁审指引不作为依据"
        : "未检索到山东地方裁审参考"),
  ];

  // 7. 调用模型（单次，不自动重试；成功返回 JSON 结构）。
  //     Phase 8：占用模型槽位（kill switch / 全局日额度 / 并发上限）；未获槽位不得调用 DeepSeek。
  let content: string;
  let heldModelSlot = false;
  if (ctx.guard !== undefined) {
    const slot = ctx.guard.tryModelSlot();
    if (!slot.allowed) {
      return limitPayload(requestId, slot);
    }
    heldModelSlot = true;
  }
  try {
    const result = await chatCompletion(ctx.config, buildMessages(question, analysisLines, evidenceText), {
      fetchFn: ctx.fetchFn,
      timeoutMs: ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxTokens: ctx.maxTokens ?? MAX_OUTPUT_TOKENS,
    });
    content = result.content;
  } catch (err) {
    if (err instanceof UpstreamError) {
      if (err.kind === "missing") {
        return { status: 503, errorCode: "SERVICE_NOT_READY", payload: errorBody(requestId, "SERVICE_NOT_READY", "问答服务未配置密钥，暂时无法使用", false) };
      }
      if (err.kind === "rate") {
        return { status: 503, errorCode: "RATE_LIMITED", payload: errorBody(requestId, "RATE_LIMITED", "请求过于频繁，请稍后再试", true) };
      }
      return { status: 502, errorCode: "UPSTREAM_ERROR", payload: errorBody(requestId, "UPSTREAM_ERROR", "上游模型服务暂时不可用，请稍后再试", true) };
    }
    return { status: 502, errorCode: "UPSTREAM_ERROR", payload: errorBody(requestId, "UPSTREAM_ERROR", "上游模型服务暂时不可用，请稍后再试", true) };
  } finally {
    if (heldModelSlot) {
      ctx.guard?.releaseModelSlot();
    }
  }

  // 8. 解析模型 JSON；畸形 → 证据驱动 fallback（不虚构任何内容）。
  const parsed = parseModelPayload(content);
  if (parsed === null) {
    return { status: 200, errorCode: null, payload: fallbackClarification(requestId, question, deco.topicIds, evidence, missing, ctx.sourceMeta, ctx) };
  }

  // 9. 引用校验（严格白名单）：
  //    - 模型输出中出现任何不在本次证据集内的 [S#] → 引用异常，直接返回证据驱动的
  //      needs_clarification（不得仅删除编号后保留未经支持的法律断言）；
  //    - 随后对“带第X条但无任何引用”的结论段同样拒绝（由 guards 处理）。
  const validRefs = new Set(evidence.map((e) => e.ref));
  const allModelTexts = [
    parsed.issueIdentification,
    parsed.preliminaryConclusion,
    ...parsed.applicableLaw,
    ...parsed.similarCases,
    ...parsed.nextSteps,
    ...parsed.evidenceChecklist,
    ...parsed.factsToConfirm,
    ...parsed.boundaries,
  ];
  const unknownRefs = extractCitationRefs(allModelTexts).filter((r) => !validRefs.has(r));
  if (unknownRefs.length > 0) {
    return { status: 200, errorCode: null, payload: fallbackClarification(requestId, question, deco.topicIds, evidence, missing, ctx.sourceMeta, ctx) };
  }

  // 11. Phase 7C-1 A/B/C 分区与声明清洗：
  //     - applicableLaw 等模型文本只保留 A 级引用（C 级引用一律剥离，不得冒充国家法律依据）；
  //     - similarCases 只接受 B 级案例引用（引用非 B 级案例的条目整条丢弃）；
  //     - localGuidance 由系统按证据确定性组装（见 6.2，不依赖模型输出）；
  //     - 最终的 similarCases 集合由系统确定性组装（见 9.5），模型输出仅作为候选引用。
  const levelByRef = new Map<string, string>();
  const isCaseByRef = new Map<string, boolean>();
  for (const e of evidence) {
    levelByRef.set(e.ref, e.chunk.sourceLevel);
    isCaseByRef.set(e.ref, e.chunk.kind === "case");
  }
  const keepOnlyA = (t: string): string =>
    t.replace(CITATION_RE, (m, n: string) => (levelByRef.get(`S${n}`) === "A" ? m : ""));

  const answer = {
    issueIdentification: keepOnlyA(sanitizeRefs(parsed.issueIdentification, validRefs)).trim() || (evidence[0]?.chunk.title ?? ""),
    preliminaryConclusion: keepOnlyA(sanitizeRefs(parsed.preliminaryConclusion, validRefs)).trim(),
    applicableLaw: cleanList(parsed.applicableLaw, validRefs).map(keepOnlyA),
    similarCases: cleanSimilarCases(parsed.similarCases, validRefs, levelByRef, isCaseByRef),
    nextSteps: cleanList(parsed.nextSteps, validRefs).map(keepOnlyA),
    evidenceChecklist: cleanList(parsed.evidenceChecklist, validRefs).map(keepOnlyA),
    factsToConfirm: cleanList(parsed.factsToConfirm, validRefs).map(keepOnlyA),
    boundaries: cleanList(parsed.boundaries, validRefs).map(keepOnlyA),
  };

  const guardedApplicableLaw = answer.applicableLaw.filter(
    (item) => !looksLikeArticleCitation(item) || extractCitationRefs([item]).length > 0,
  );
  // “初步结论/问题识别”中若出现“第X条”但无有效引用 → 视为无依据断言，拒绝保留。
  const guardedPreliminary = !looksLikeArticleCitation(answer.preliminaryConclusion) || extractCitationRefs([answer.preliminaryConclusion]).length > 0;
  const guardedIdentification = !looksLikeArticleCitation(answer.issueIdentification) || extractCitationRefs([answer.issueIdentification]).length > 0;
  if (guardedApplicableLaw.length === 0 || !guardedPreliminary || !guardedIdentification) {
    return { status: 200, errorCode: null, payload: fallbackClarification(requestId, question, deco.topicIds, evidence, missing, ctx.sourceMeta, ctx) };
  }

  // 9.5 Phase 7C-2：官方案例证据共现（确定性组装，不依赖模型是否主动引用案例）。
  //     - 模型 similarCases 条目已在步骤 11 按 B 级/case 验证；此处再按“与推断主题交集”复核；
  //     - 不足 MAX_SIMILAR_CASE_ITEMS 条时，按引擎排序确定性补充（优先主检索池，再按 topicIds 补充检索）；
  //     - 补充案例若不在证据集中则追加（引用编号延续），保证 citations 可解析；
  //     - 地域只是排序偏好：同地域 > 全国性 > 其他省份；外地案例一律带实际适用地域与“外地类案参考”边界说明；
  //     - 输出为引擎生成的确定性文案（要旨摘录来自索引文本，不虚构案号/法院/金额）。
  const queryForTopic = (t: string): string | undefined => TOPIC_QUERY_MAP[t] ?? undefined;
  const chosenCase = chooseSimilarCases({
    modelItems: answer.similarCases,
    evidence,
    index: ctx.index,
    topics: deco.topicIds,
    pool: hits,
    location: askLocation,
    queryForTopic,
  });
  const caseRefByKey = new Map(evidence.map((e) => [e.chunk.docId + "\u0000" + e.chunk.chunkId, e.ref]));
  const similarCaseItems: string[] = [];
  for (const chunk of chosenCase.chunks) {
    const key = chunk.docId + "\u0000" + chunk.chunkId;
    let ref = caseRefByKey.get(key);
    if (ref === undefined) {
      ref = "S" + (evidence.length + 1);
      evidence.push({ chunk, ref });
      caseRefByKey.set(key, ref);
    }
    similarCaseItems.push(buildSimilarCaseItem(chunk, ref, askLocation));
  }
  // 共现契约自检（answered + 已推断主题 + 存在合格 B 级候选 → 必须有案例；防御性保证不变量）。
  const qualifiedCases = collectSimilarCaseCandidates(ctx.index, deco.topicIds, hits, queryForTopic);
  const cpContract = evaluateCopresenceContract({
    outcome: "answered",
    topics: deco.topicIds,
    qualifiedCandidates: qualifiedCases,
  });
  if (cpContract.applied && similarCaseItems.length === 0) {
    const top = rankCaseCandidates(qualifiedCases, deco.topicIds, askLocation)[0];
    if (top !== undefined) {
      const key = top.chunk.docId + "\u0000" + top.chunk.chunkId;
      let ref = caseRefByKey.get(key);
      if (ref === undefined) {
        ref = "S" + (evidence.length + 1);
        evidence.push({ chunk: top.chunk, ref });
        caseRefByKey.set(key, ref);
      }
      similarCaseItems.push(buildSimilarCaseItem(top.chunk, ref, askLocation));
    }
  }

  // 10. 引用集合 → citations（含元数据），并保证至少一项 A 级来源（核心法律结论要求）。
  //     Phase 7C-1：localGuidance 的引用也纳入来源卡片（C 级地方指引单独展示）。
  const localGuidanceItems = buildLocalGuidanceItems(localGuidanceChunks, evidence, askLocation);
  const citedRefs = new Set([
    // 引用集合以最终确定的内容为准：similarCases 由系统确定性组装（9.5），
    // 其引用（含补充案例）必须在 sources 中可解析。
    ...extractCitationRefs([...guardedApplicableLaw, ...similarCaseItems, ...localGuidanceItems]),
  ]);
  const citations: SourceCitation[] = [];
  for (const e of evidence) {
    if (citedRefs.has(e.ref)) {
      citations.push(buildCitation(e, ctx.sourceMeta.get(e.chunk.docId)));
    }
  }
  if (!citations.some((c) => c.sourceLevel === "A")) {
    const aItem = evidence.find((e) => e.chunk.sourceLevel === "A");
    if (aItem !== undefined) {
      citations.push(buildCitation(aItem, ctx.sourceMeta.get(aItem.chunk.docId)));
    }
  }
  if (citations.length === 0) {
    return { status: 200, errorCode: null, payload: fallbackClarification(requestId, question, deco.topicIds, evidence, missing, ctx.sourceMeta, ctx) };
  }

  // 11. 组装响应：调用前已确定分支（situationQ && missing>0 → needs_clarification，见 6.5），
  //     到达此处必然为 answered。
  const topicIds = ([...new Set([...deco.topicIds, ...evidence.flatMap((e) => e.chunk.topicIds)])] as TopicId[]).slice(0, 10);

  const baseBoundaries = answer.boundaries.length > 0
    ? answer.boundaries
    : ["本回答基于已收录的公开资料生成，不是律师意见；不预测胜诉率；不保证个案结果；地方政策与完整案情可能影响结论；请以官方发布的法律文本为准并核验来源。"];
  const boundariesOut = [...baseBoundaries];
  if (localGuidanceItems.length > 0 && !boundariesOut.some((b) => b.includes("山东地区裁审") || b.includes("如争议发生在山东"))) {
    boundariesOut.push(localGuidanceNotice(askLocation));
  }
  const finalAnswer: Answer = {
    issueIdentification: answer.issueIdentification || "劳动争议问题",
    preliminaryConclusion: answer.preliminaryConclusion || "初步结论：请见相关依据。",
    applicableLaw: guardedApplicableLaw,
    localGuidance: localGuidanceItems,
    similarCases: similarCaseItems.length > 0 ? similarCaseItems : ["未找到可核验的高度相似官方案例。"],
    nextSteps: answer.nextSteps.length > 0 ? answer.nextSteps : ["建议先收集并整理证据材料（工资流水、考勤、解除通知等）。"],
    evidenceChecklist: answer.evidenceChecklist.length > 0 ? answer.evidenceChecklist : ["劳动合同、工资流水、考勤记录、解除/辞退证明"],
    factsToConfirm: dedupe([...missing.map((m) => m.description), ...answer.factsToConfirm]).slice(0, 8),
    boundaries: boundariesOut,
    aiNotice: AI_NOTICE,
  };
  const response: AskSuccessResponse = {
    ok: true,
    apiVersion: API_VERSION,
    requestId,
    outcome: "answered",
    topicIds,
    coverage: { scope: "全国性规则", localRulesCovered: false },
    answer: finalAnswer,
    clarification: null,
    outOfScope: null,
    sources: citations,
  };
  const parsedResp = parseAskSuccessResponse(response);
  if (!parsedResp.success) {
    return { status: 200, errorCode: null, payload: fallbackClarification(requestId, question, deco.topicIds, evidence, missing, ctx.sourceMeta, ctx) };
  }
  return { status: 200, errorCode: null, payload: parsedResp.data };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.trim();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function errorBody(
  requestId: string,
  code: "SERVICE_NOT_READY" | "RATE_LIMITED" | "UPSTREAM_ERROR",
  message: string,
  retryable: boolean,
): unknown {
  return {
    ok: false,
    apiVersion: API_VERSION,
    requestId,
    error: { code, message, retryable },
  };
}

/** Phase 8：限流/kill switch 响应（HTTP 429；友好文案 + 建议等待秒数；不含内部细节）。 */
function limitPayload(requestId: string, decision: LimitDecision): { status: 429; errorCode: "RATE_LIMITED"; payload: unknown; retryAfter: number } {
  return {
    status: 429,
    errorCode: "RATE_LIMITED",
    retryAfter: decision.retryAfterSeconds,
    payload: {
      ok: false,
      apiVersion: API_VERSION,
      requestId,
      error: {
        code: "RATE_LIMITED",
        message: limitMessage(decision.code),
        retryable: true,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    },
  };
}