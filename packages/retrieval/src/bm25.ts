import { canonicalize } from "./normalize.js";
import { detectInjection, detectLaborDomain, laborTermGrams } from "./domain.js";
import type { CaseSource, LawSource } from "./schemas.js";

/** BM25 参数（命名常量，便于统一调整并保证可复现）。 */
export const BM25_K1 = 1.5;
export const BM25_B = 0.75;
export const BM25_IDF_SMOOTHING = 0.5;
export const NGRAM_SIZES = [2, 3] as const;

/** 确定性字段/意图加权常量（用于改善“主题正确但关键法条排序不理想”的问题）。 */
export const KEYWORD_BOOST = 3.0; // 命中该 provision 的关键词（keywords 字段）时附加分
export const TOPIC_BOOST = 1.6; // 查询意图命中该 topic 时对该 topic 内文档的乘数
export const AUTHORITY_BOOST = 1.45; // A 级法条（kind=provision）权威加权：防 B 级官方案例（长文本、关键词密集）挤占核心法条；
// 系数为确定性常量（与产品证据分级 A>B 一致）；只乘在 kind=provision 且 sourceLevel=A 且已达到相关性阈值的候选上。
export const MIN_RELEVANCE_SCORE = 8.0; // 得分低于该值视为“相关性弱”（用于决定是否发起联网搜索/是否追问补充，不再用于泛化 insufficient）
export const MIN_MATCH_TERMS = 2; // 单条文档至少命中 2 个不同查询词项才算“证据”（防单个稀有词项巧合命中短条文）
export const MIN_MATCH_TERMS_STRONG = 3; // 无关键词加权时至少命中 3 个词项（防“手续费→手续”类 2 词项弱重合被当作可靠证据）

/** 劳动领域术语 n-gram 集合（领域术语单命中豁免用；见 scoreCandidates）。 */
const LABOR_TERM_GRAMS: ReadonlySet<string> = laborTermGrams();

/**
 * 手工维护的确定性同义词表（同义组）。
 * 不调用任何模型：只在查询端做确定性子串匹配，把同组词语的 n-gram 一并加入查询词集。
 */
export const SYNONYM_GROUPS: readonly string[][] = [
  ["辞退", "解除", "开除", "解雇"],
  ["补偿金", "赔偿金", "经济补偿"],
  ["怎么赔", "赔偿", "赔付", "索赔", "赔偿金", "补偿金", "经济补偿"],
  ["欠薪", "拖欠工资", "拖欠"],
  ["没发工资", "没发", "未发工资", "不发工资", "没给工资"],
  ["双倍工资", "二倍工资"],
  ["社保", "社会保险", "五险"],
  ["竞业协议", "竞业限制", "竞业"],
  ["加班工资", "加班费", "加班"],
  ["没签合同", "未签合同", "没签劳动合同", "未签劳动合同", "不签合同", "不签",
    "未订立书面劳动合同", "未订立书面合同", "没有签劳动合同"],
  ["发工资", "支付工资"],
  ["裁员", "辞退", "解除劳动合同", "解聘"],
  // 未签劳动合同 → 二倍工资（把口语表述链接到法条关键词）
  ["没有签劳动合同", "没签劳动合同", "未签劳动合同", "没签合同", "未签合同", "没签", "未签",
    "不签劳动合同", "不签合同", "未订立书面劳动合同", "二倍工资", "双倍工资", "支付二倍工资"],
  // 周末/休息日/法定节假日 → 加班工资标准（链接到 150%/200%/300% 标准条文）。
  // 该组由 SYNONYM_GROUP_REQUIRES 限定：须同时出现劳动语境词才扩展，
  // 否则“周末去哪里爬山”这类非劳动争议查询会被扩成加班词（过度扩展）。
  ["周末", "休息日", "法定休假日", "延长工作时间", "加班费标准",
    "百分之二百", "百分之三百", "百分之一百五十", "200%", "300%", "150%"],
  // 试用期 → 录用条件/不符合录用条件（试用期解除的唯一法定法定理由；把口语意图链接到 §21/§39 等条文）
  ["试用期", "试用", "录用条件", "不符合录用条件"],
  // 口语“调岗” → 法律表述“变更劳动合同/协商一致”（劳动合同法 §35 等）
  ["调岗", "调整岗位", "岗位调整", "变更劳动合同", "协商一致"],
  // 怀孕/三期 → 女职工保护（孕期、产期、哺乳期不得解除等，劳动合同法 §42、劳动法 §29、女职工保护特别规定 §5）
  ["怀孕", "孕期", "产期", "哺乳期", "三期", "女职工"],
  // 提成/奖金/绩效工资 → 劳动报酬/工资（把“克扣提成奖金”类口语查询链接到劳动报酬支付条文）
  ["提成", "奖金", "绩效工资", "绩效", "劳动报酬", "工资", "报酬"],
];

/** 条件触发：第 N 组同义词仅当查询同时命中其“语境词”（requires）之一时才扩展。
 *  防止裸口语词（如“周末”“休息”）把无关问题扩成劳动语义。null = 无条件。 */
export const SYNONYM_GROUP_REQUIRES: readonly (string[] | null)[] = [
  null, // 辞退
  null, // 补偿金
  null, // 怎么赔
  null, // 欠薪
  null, // 没发工资
  null, // 双倍工资
  null, // 社保
  null, // 竞业
  null, // 加班
  null, // 没签合同
  null, // 发工资
  null, // 裁员
  null, // 未签→二倍工资
  ["加班", "加班费", "加班工资", "上班", "工资", "报酬", "值班", "工作", "工时", "休息", "调休"], // 休息日 → 加班标准
  null, // 试用期
  null, // 调岗
  ["辞退", "解除", "劳动合同", "工资", "公司", "上班", "劳动", "裁员", "补偿", "保险", "产假", "休假", "假期", "女职工", "单位", "老板", "加班"], // 怀孕/三期 → 女职工保护
  null, // 提成/奖金 → 劳动报酬/工资（本身即劳动报酬语义；无需额外语境要求）
];

/** 每个 topic 的意图词（查询命中任一子串即视为该场景的意图）。
 *  覆盖全部 19 个劳动争议主题（与 packages/shared TOPIC_IDS 一致）。 */
export const TOPIC_INTENT: Record<string, string[]> = {
  "unlawful-termination-compensation": ["辞退", "被辞", "开除", "解雇", "解聘", "裁员", "违法解除", "非法解除", "无故辞退", "违法辞退", "赔偿金", "经济补偿", "补偿金", "怎么赔", "赔钱", "赔多少", "辞退赔偿", "N+1", "2N"],
  "wage-arrears": ["工资", "拖欠", "欠薪", "欠工资", "没发工资", "未发工资", "不发工资", "克扣", "发工资", "不给工资", "没给工资", "工钱", "提成", "奖金", "劳动报酬", "讨薪"],
  "overtime-pay": ["加班", "加班费", "加班工资", "超时", "双休", "单休", "休息日", "节假日", "调休", "补休", "夜班", "拖班", "延长工作时间"],
  "no-written-contract": ["签劳动合同", "没签", "未签", "不签", "签合同", "签订合同", "没签合同", "未订立书面", "书面劳动合同", "不签合同", "没签劳动合同", "未签劳动合同", "不签劳动合同", "没有签"],
  "probation-disputes": ["试用期", "试用", "转正", "录用条件", "见习期"],
  "work-injury": ["工伤", "职业病", "工亡", "停工留薪", "工伤保险", "劳动能力鉴定", "伤残", "工伤认定", "工伤待遇"],
  "social-insurance-noncompete": ["社保", "社会保险", "五险", "社保费", "社保基数", "断缴", "补缴", "竞业限制", "竞业协议", "竞业", "保密协议"],
  "social-insurance": ["社保", "社会保险", "五险", "五险一金", "社保费", "社保基数", "社保缴纳", "断缴", "补缴", "公积金"],
  "noncompete-confidentiality": ["竞业", "竞业限制", "竞业协议", "竞业禁止", "商业秘密", "保密协议", "保密义务", "离职后竞业"],
  "labor-relationship-recognition": ["劳动关系", "事实劳动关系", "劳务关系", "劳动关系认定", "确认劳动关系", "是否劳动关系", "用工关系", "劳动关系还是"],
  "contract-performance": ["劳动合同", "合同到期", "续签", "无固定期限", "调岗", "降薪", "调薪", "转岗", "变更劳动合同", "劳动合同解除", "终止劳动合同", "合同终止", "合同期满", "不续签", "调整岗位", "合同变更"],
  "double-wage-notice": ["二倍工资", "双倍工资", "两倍工资", "未签合同二倍", "二倍工资差额"],
  "compensation-and-damages": ["经济补偿", "赔偿金", "补偿金", "赔偿标准", "怎么赔", "赔多少", "赔钱", "N+1", "2N", "代通知金", "经济补偿与赔偿金", "赔偿", "补偿"],
  "working-hours-leave": ["工作时间", "工时", "标准工时", "综合计算", "不定时", "双休", "单休", "休息日", "法定节假日", "节假日", "年休假", "年假", "带薪休假", "调休", "补休", "探亲假", "婚假", "丧假", "休假"],
  "female-worker-protection": ["产假", "哺乳", "孕期", "妊娠", "三期", "女职工", "生育", "陪产假", "产检", "保胎"],
  "labor-dispatch": ["劳务派遣", "派遣", "外包用工", "派遣工", "派遣单位", "用工单位", "派遣合同", "外包"],
  "new-employment-forms": ["新就业形态", "平台用工", "网约车", "外卖骑手", "外卖员", "骑手", "主播", "直播带货", "带货", "众包", "灵活用工", "灵活就业", "平台经济"],
  "arbitration-limitation": ["仲裁时效", "时效", "过了时效", "一年内", "仲裁时效期间", "时效中断", "时效中止"],
  "arbitration-procedure": ["仲裁管辖", "仲裁委", "劳动仲裁", "仲裁申请", "仲裁证据", "裁诉衔接", "仲裁前置", "起诉", "诉讼", "劳动监察", "仲裁裁决", "仲裁开庭", "劳动人事争议", "仲裁程序"],
};

export interface IndexChunk {
  docId: string;
  chunkId: string;
  kind: "provision" | "case" | "supplement";
  title: string;
  locator: string;
  text: string;
  officialUrl: string;
  validityStatus: string;
  reviewStatus: string;
  verificationStatus: string;
  sourceLevel: string;
  jurisdiction: string;
  publishedDate: string;
  topicIds: string[];
  keywords: string[];
}

export interface IndexDocument extends IndexChunk {
  len: number;
  tf: [string, number][]; // 确定性排序的 term -> 频次
}

export interface BuiltIndex {
  format: "laoyouju-bm25";
  version: number;
  params: { k1: number; b: number; ngram: number[]; idfSmoothing: number };
  corpus: { n: number; avgdl: number };
  docs: IndexDocument[];
  dfs: [string, number][]; // term -> document frequency
}

export interface QueryResult extends IndexChunk {
  score: number;
  /** 证据多样化重排原因（仅被 composeEvidence 提升的条目携带；原始 score 不变）。 */
  composition?: string | null;
}

/** 字符 n-gram（2-gram 与 3-gram）。 */
export function generateNGrams(text: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= text.length - n; i++) {
    out.push(text.slice(i, i + n));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 中文虚词停用规则（确定性、通用，非针对具体查询）。
// 目标：n-gram 检索对“关于/我们/怎么了/天气的”等无信息量虚词片段过度敏感，
// 会让无关问题（如“帮我写一首关于春天的诗”）仅凭“天的”“关于”等片段命中
// 短条法律条文（短文 BM25 长度归一化放大权重），从而产生“可靠”假象。
// 规则作用于索引与查询两侧（tokenize 内），不影响 canonicalize/contentHash
// （哈希可审计性不受影响）。
// 注意：不得把“不/没/未/无/非”等否定词或“劳动/合同/工资/保险”等实词列入停用。
// ---------------------------------------------------------------------------

/** 虚词字符（整 gram 全由虚词组成时丢弃，如“关于/怎么/我们/帮我/应该”）。 */
export const STOP_FUNC_CHARS: ReadonlySet<string> = new Set([
  "的", "了", "着", "和", "与", "及", "或", "在", "是", "为", "有", "之",
  "这", "那", "哪", "什", "么", "怎", "样",
  "我", "你", "他", "她", "它", "们", "吗", "呢", "吧", "啊", "哦", "嗯", "呀",
  "请", "帮", "让", "把", "被", "于", "关", "问", "比", "较",
  "也", "都", "就", "还", "再", "很", "更", "最", "而", "且",
  "能", "会", "要", "可", "以", "该", "应", "对", "到", "由", "从", "向", "给",
  "但", "若", "如", "则", "因", "所", "当", "过",
]);

/** 词尾虚词（“X的/X了/X吗”）：跨词边界片段，无检索价值；保留“土地/超过/目的”等做取舍时以实词优先。 */
export const STOP_PARTICLE_TAIL: ReadonlySet<string> = new Set([
  "的", "了", "着", "吗", "呢", "吧", "啊", "呀", "嗯", "哦",
]);

/** 词首虚词（“我X/你X/于X”等词边界片段）。保守集合：不包含“在/是/能/会/要/从/到”等可能与实词成词的字。 */
export const STOP_PREFIX_CHARS: ReadonlySet<string> = new Set([
  "我", "你", "他", "她", "它", "们",
  "这", "那", "哪", "什", "么", "怎", "于", "关", "让", "把", "被",
  "还", "再", "很", "更", "最", "也", "都", "就", "又",
]);

/** 判断单个 n-gram 是否为虚词片段（isStopGram）。 */
export function isStopGram(gram: string): boolean {
  if (gram.length < 2) {
    return false;
  }
  // R1：整 gram 全为虚词字符（关于/怎么/我们/帮我/应该…）
  let allFunc = true;
  for (const ch of gram) {
    if (!STOP_FUNC_CHARS.has(ch)) {
      allFunc = false;
      break;
    }
  }
  if (allFunc) {
    return true;
  }
  // R2：词尾虚词（X的/X了/X吗/X着…）
  const last = gram.charAt(gram.length - 1);
  if (STOP_PARTICLE_TAIL.has(last)) {
    return true;
  }
  // R3：仅词首为保守虚词（我X/你X/于X/么X…），且词首不属于“在/是/能/会/要/从/到”等
  if (STOP_PREFIX_CHARS.has(gram.charAt(0))) {
    return true;
  }
  return false;
}

/** 将文本切分为索引项：先规范化，再生成 2-gram 与 3-gram，并剔除虚词片段。 */
export function tokenize(text: string): string[] {
  const c = canonicalize(text);
  const out: string[] = [];
  for (const n of NGRAM_SIZES) {
    for (const g of generateNGrams(c, n)) {
      if (!isStopGram(g)) {
        out.push(g);
      }
    }
  }
  return out;
}

/** 从 law 来源生成 provision 索引块。 */
export function lawChunks(law: LawSource): IndexChunk[] {
  return law.provisions.map((p) => ({
    docId: law.sourceId,
    chunkId: p.provisionId,
    kind: "provision" as const,
    title: law.title,
    locator: p.locator,
    text: p.sourceText,
    officialUrl: law.officialUrl,
    validityStatus: law.validityStatus,
    reviewStatus: law.reviewStatus,
    verificationStatus: law.verificationStatus,
    sourceLevel: law.authorityLevel,
    jurisdiction: law.jurisdiction,
    publishedDate: law.promulgationDate,
    topicIds: p.topicIds.length > 0 ? p.topicIds : law.topicIds,
    keywords: p.keywords,
  }));
}

/** 从案例来源生成案例规则索引块（检索文本 = 标题 + 基本案情 + 处理结果 + 裁判要旨；
 *  若仅索引 reasoning，涉及案情细节（工资、提成、时间、金额等）的自然语言查询将无法召回案例。 */
export function caseChunks(c: CaseSource): IndexChunk[] {
  return [
    {
      docId: c.sourceId,
      chunkId: c.sourceId,
      kind: "case" as const,
      title: c.title,
      locator: "案例要旨",
      text: `${c.title}。${c.keyFacts}。${c.holding}。${c.reasoning}`,
      officialUrl: c.officialUrl,
      validityStatus: "not_applicable",
      reviewStatus: c.reviewStatus,
      verificationStatus: c.verificationStatus,
      sourceLevel: c.authorityLevel,
      jurisdiction: c.jurisdiction,
      publishedDate: c.publicationDate,
      topicIds: c.topicIds,
      keywords: [],
    },
  ];
}

function termFrequency(terms: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of terms) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

/** 由内容库构建确定性索引（相同输入 -> 字节一致输出）。
 *  已废止/效力不明的 law 不会进入可用索引（内容校验也应阻止其入库）。 */
export function buildIndex(laws: LawSource[], cases: CaseSource[]): BuiltIndex {
  const chunks: IndexChunk[] = [];
  for (const law of laws) {
    if (law.validityStatus === "repealed" || law.validityStatus === "unknown") {
      continue;
    }
    chunks.push(...lawChunks(law));
  }
  for (const c of cases) {
    chunks.push(...caseChunks(c));
  }
  // 确定性：先按 docId/chunkId 排序，再对每块生成 term 频率并排序
  chunks.sort((a, b) =>
    a.docId === b.docId ? a.chunkId.localeCompare(b.chunkId) : a.docId.localeCompare(b.docId),
  );

  const docs: IndexDocument[] = [];
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const chunk of chunks) {
    const terms = tokenize(chunk.text);
    const tf = termFrequency(terms);
    const sortedTf = [...tf.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const len = terms.length;
    for (const t of tf.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
    totalLen += len;
    docs.push({
      ...chunk,
      len,
      tf: sortedTf,
    });
  }

  const n = docs.length;
  const avgdl = n > 0 ? totalLen / n : 0;
  const dfs = [...df.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return {
    format: "laoyouju-bm25",
    version: 1,
    params: { k1: BM25_K1, b: BM25_B, ngram: [...NGRAM_SIZES], idfSmoothing: BM25_IDF_SMOOTHING },
    corpus: { n, avgdl },
    docs,
    dfs,
  };
}

/** 查询端同义词扩展：规范化查询，若命中任一子串则把同组各词的 n-gram 并入查询词集。
 *  命中同义词组的语境词要求（SYNONYM_GROUP_REQUIRES）也满足时才扩展。 */
export function expandQueryTerms(query: string): string[] {
  const q = canonicalize(query);
  const terms = tokenize(query);
  const seen = new Set(terms);
  for (let gi = 0; gi < SYNONYM_GROUPS.length; gi++) {
    const group = SYNONYM_GROUPS[gi]!;
    const hit = group.some((v) => q.includes(canonicalize(v)));
    if (!hit) {
      continue;
    }
    const requires = SYNONYM_GROUP_REQUIRES[gi];
    if (requires && !requires.some((v) => q.includes(canonicalize(v)))) {
      continue;
    }
    for (const v of group) {
      for (const t of tokenize(v)) {
        seen.add(t);
      }
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** 查询模型：规范化词集 + 同义词扩展后词集 + 由意图词推断的目标 topic 集合。确定性。 */
export interface QueryModel {
  baseTerms: string[];
  terms: string[]; // 同义词扩展后（用于与文档关键词匹配）
  termSet: Set<string>;
  topics: Set<string>;
  raw: string; // 规范化后的原始查询（用于关键词“独立词组”边界判断）
}

export function buildQueryModel(query: string): QueryModel {
  const q = canonicalize(query);
  const baseTerms = tokenize(query);
  const terms = expandQueryTerms(query);
  const topics = new Set<string>();
  for (const [topic, phrases] of Object.entries(TOPIC_INTENT)) {
    if (phrases.some((p) => q.includes(canonicalize(p)))) {
      topics.add(topic);
    }
  }
  return { baseTerms, terms, termSet: new Set(terms), topics, raw: q };
}

/** 文档关键词命中（同义词扩展后词集与关键词 n-gram 有交集则计一次）。 */
export function keywordBoostForDoc(doc: IndexDocument, model: QueryModel): number {
  let boost = 0;
  for (const kw of doc.keywords) {
    if (tokenize(kw).some((t) => model.termSet.has(t))) {
      boost += KEYWORD_BOOST;
    }
  }
  return boost;
}

/** 查询打分明细（可审计：关键词/主题/权威加值、命中词项、组成原因）。 */
export interface ScoredCandidate {
  result: QueryResult;
  /** BM25 原始分（未加任何加权）。 */
  baseScore: number;
  /** 关键词加分（KEYWORD_BOOST 之和）。 */
  keywordBoost: number;
  /** 命中的查询词项（用于 min-match 审计）。 */
  matchedTerms: string[];
  /** 是否应用主题乘数（TOPIC_BOOST）。 */
  topicBoostApplied: boolean;
  /** 是否应用权威乘数（AUTHORITY_BOOST）。 */
  authorityBoostApplied: boolean;
}

export interface ExplainedQuery {
  /** 领域判定结果（无任何劳动领域信号 → 不进入可靠检索）。 */
  domain: { isLabor: boolean; signals: string[] };
  /** 注入/伪造标记（命中时不执行证据多样化重排）。 */
  injected: { injected: boolean; mark: string | null };
  model: QueryModel;
  /** 全部通过候选过滤的文档，按 score 降序（同分按 chunkId 稳定升序）。 */
  ranked: ScoredCandidate[];
}

/** 对全部候选打分（与 queryIndex 单一实现；不做 topK 截断、不做重排）。 */
function scoreCandidates(
  index: BuiltIndex,
  query: string,
  topicFilter?: string | string[],
): ExplainedQuery {
  const model = buildQueryModel(query);
  const domain = detectLaborDomain(query);
  const injected = detectInjection(query);
  if (model.terms.length === 0) {
    return { domain, injected, model, ranked: [] };
  }
  const n = index.corpus.n;
  const avgdl = index.corpus.avgdl;
  const k1 = index.params.k1;
  const b = index.params.b;
  const idfSmoothing = index.params.idfSmoothing;

  const topicSet = topicFilter
    ? new Set(Array.isArray(topicFilter) ? topicFilter : [topicFilter])
    : new Set<string>();

  // 文档频率查找表
  const dfMap = new Map(index.dfs);
  // 过滤词集（若为 -1 命中率归零的问题，直接排除 term 影响）
  const filtered = model.terms.filter((t) => dfMap.has(t));

  const results: ScoredCandidate[] = [];
  for (const doc of index.docs) {
    if (topicSet.size > 0 && !doc.topicIds.some((t) => topicSet.has(t))) {
      continue;
    }
    const tfMap = new Map(doc.tf);
    let score = 0;
    const matched: string[] = [];
    for (const term of filtered) {
      const tf = tfMap.get(term);
      if (tf === undefined) {
        continue;
      }
      matched.push(term);
      const df = dfMap.get(term) ?? 0;
      if (df <= 0) {
        continue;
      }
      const idf = Math.log(1 + (n - df + idfSmoothing) / (df + idfSmoothing));
      const dl = doc.len;
      const denom = tf + k1 * (1 - b + b * (dl / (avgdl > 0 ? avgdl : 1)));
      score += idf * ((tf * (k1 + 1)) / denom);
    }
    if (score <= 0) {
      continue;
    }
    // 确定性字段/意图加权：关键词命中加分；查询意图命中 topic 则对 topic 内文档加乘数。
    const kwBoost = keywordBoostForDoc(doc, model);
    // 单词项巧合防护：仅命中 1 个查询词项且无关键词加权的文档不视为证据
    // （防止“怀孕/比较”等单一词项恰好出现在某条短条文中被放大成“可靠”结果）。
    // 例外：命中的词项本身属于劳动领域术语（克扣/提成/奖金/辞退…），单领域术语命中即为
    // 有相关性的候选（仍需经过可靠性阈值成为可靠结果；“手续/支付/支付宝”等非领域词不获豁免）。
    const domainGramHit = matched.some((t) => LABOR_TERM_GRAMS.has(t));
    if (matched.length < MIN_MATCH_TERMS && kwBoost <= 0 && !domainGramHit) {
      continue;
    }
    let finalScore = score + kwBoost;
    const topicHit = model.topics.size > 0 && doc.topicIds.some((t) => model.topics.has(t));
    if (topicHit) {
      finalScore *= TOPIC_BOOST;
    }
    // A 级权威法条加权（可解释、确定性）：案例（B 级）文本长、关键词密集，
    // BM25 原始分数会系统性高于单条法条；与产品“证据分级 A>B”一致，让核心法条在 top3 内不被
    // 密集的官方案例挤占。仅对已达到相关性阈值（≥MIN_RELEVANCE_SCORE）的候选放大——弱相关
    // （如“手续”类偶合命中）不会被放大为“可靠证据”，避免无关查询越过阈值（负向测试约束）。
    const authorityHit = doc.kind === "provision" && doc.sourceLevel === "A" && finalScore >= MIN_RELEVANCE_SCORE;
    if (authorityHit) {
      finalScore *= AUTHORITY_BOOST;
    }
    results.push({
      result: {
        docId: doc.docId,
        chunkId: doc.chunkId,
        kind: doc.kind,
        title: doc.title,
        locator: doc.locator,
        text: doc.text,
        officialUrl: doc.officialUrl,
        validityStatus: doc.validityStatus,
        reviewStatus: doc.reviewStatus,
        verificationStatus: doc.verificationStatus,
        sourceLevel: doc.sourceLevel,
        jurisdiction: doc.jurisdiction,
        publishedDate: doc.publishedDate,
        topicIds: doc.topicIds,
        keywords: doc.keywords,
        score: finalScore,
      },
      baseScore: score,
      keywordBoost: kwBoost,
      matchedTerms: matched,
      topicBoostApplied: topicHit,
      authorityBoostApplied: authorityHit,
    });
  }

  results.sort((a, b) => {
    if (b.result.score !== a.result.score) {
      return b.result.score - a.result.score;
    }
    // 同分使用稳定 ID 排序
    return a.result.chunkId.localeCompare(b.result.chunkId) || a.result.docId.localeCompare(b.result.docId);
  });
  return { domain, injected, model, ranked: results };
}

/**
 * 证据多样化重排（确定性、小范围、可审计）：
 * - 目标 1：劳动争议有效查询的 top3 至少包含一条与推断主题相关的 A 级法条；
 * - 目标 2：top5 至少包含一条与推断主题匹配的 B 级官方案例；
 * - 只从「原本已命中（达到候选门槛）、得分达到 MIN_RELEVANCE_SCORE、topicIds 与推断主题有交集」
 *   的候选中提升；不把无关法条/案例硬塞进结果；保持原始 score 与稳定 ID 排序作为主序；
 * - 提升统一采用最小位移插入（目标槽位 rank N 的元素下移一位），并在 result.composition
 *   记录可审计原因；topicFilter 明确指定时仍遵守过滤语义。
 */
export function composeEvidence(
  ranked: readonly ScoredCandidate[],
  model: QueryModel,
  topK: number,
  topicFilter?: string | string[],
  injected?: boolean,
): ScoredCandidate[] {
  const out = [...ranked];
  // 注入/伪造类输入不做证据多样化重排（编造请求不应把真实案例提升为可模仿模板）。
  if (injected === true || out.length === 0 || topK < 3 || model.topics.size === 0) {
    return out;
  }
  const topicSet = topicFilter
    ? new Set(Array.isArray(topicFilter) ? topicFilter : [topicFilter])
    : new Set<string>();
  const targetTopics = [...model.topics].filter((t) => topicSet.size === 0 || topicSet.has(t));
  if (targetTopics.length === 0) {
    return out;
  }
  const topicMatch = (c: ScoredCandidate): boolean => c.result.topicIds.some((t) => targetTopics.includes(t));
  const reliable = (c: ScoredCandidate): boolean => c.result.score >= MIN_RELEVANCE_SCORE;
  const best = (pred: (c: ScoredCandidate) => boolean): number => {
    for (let i = 0; i < out.length; i++) {
      if (pred(out[i]!)) {
        return i;
      }
    }
    return -1;
  };
  // 目标 1：top3 内至少一条相关 A 级法条。
  const aSlot = Math.min(topK - 1, 2);
  const aIdx = best((c) => c.result.kind === "provision" && c.result.sourceLevel === "A" && topicMatch(c) && reliable(c));
  if (aIdx > aSlot) {
    const [c] = out.splice(aIdx, 1);
    out.splice(aSlot, 0, c!);
    const topics = targetTopics.filter((t) => c!.result.topicIds.includes(t));
    c!.result.composition = `evidence-composition: 主题匹配 A 级法条（${c!.result.docId} ${c!.result.locator}，topic ${topics.join(",")}）提升至 top${aSlot + 1}`;
  }
  // 目标 2：top5 内至少一条相关 B 级官方案例；对推断主题集合中“当前窗口毫无案例覆盖”的主题
  // （gap）进行覆盖：选择与 gap 主题匹配数最多、再按分数最高的可靠案例（证据多样化，不硬塞）。
  const bSlot = Math.min(topK - 1, 4);
  if (topK >= 5) {
    const windowCaseTopics = new Set<string>();
    for (const c of out.slice(0, bSlot + 1)) {
      if (c.result.kind === "case") {
        for (const t of c.result.topicIds) windowCaseTopics.add(t);
      }
    }
    const gapped = targetTopics.filter((t) => !windowCaseTopics.has(t));
    if (gapped.length > 0) {
      let bestIdx = -1;
      let bestCoverage = -1;
      let bestScore = -1;
      for (let i = 0; i < out.length; i++) {
        const c = out[i]!;
        if (c.result.kind !== "case" || c.result.score < MIN_RELEVANCE_SCORE) continue;
        const cov = gapped.filter((t) => c.result.topicIds.includes(t)).length;
        if (cov === 0) continue;
        if (cov > bestCoverage || (cov === bestCoverage && c.result.score > bestScore)) {
          bestIdx = i;
          bestCoverage = cov;
          bestScore = c.result.score;
        }
      }
      if (bestIdx > bSlot) {
        const [c] = out.splice(bestIdx, 1);
        out.splice(bSlot, 0, c!);
        const topics = targetTopics.filter((t) => c!.result.topicIds.includes(t));
        c!.result.composition = `evidence-composition: 主题匹配官方案例（${c!.result.docId}，topic ${topics.join(",")}；覆盖窗口缺失主题 ${gapped.join(",")}）提升至 top${bSlot + 1}`;
      }
    }
  }
  return out;
}

/** 可解释检索：领域判定 + 主题推断 + 全部候选 + 组成后排序（含重排原因），供测试与审计脚本使用。 */
export function explainQuery(
  index: BuiltIndex,
  query: string,
  topK: number,
  topicFilter?: string | string[],
): ExplainedQuery {
  const { domain, injected, model, ranked } = scoreCandidates(index, query, topicFilter);
  return { domain, injected, model, ranked: composeEvidence(ranked, model, topK, topicFilter, injected.injected).slice(0, topK) };
}

/** 查询返回项：score 降序、同分按 chunkId 稳定升序；领域无关问题（无劳动信号）返回空结果。 */
export function queryIndex(index: BuiltIndex, query: string, topK: number, topicFilter?: string | string[]): QueryResult[] {
  // 领域门控：无任何劳动领域信号（且未显式指定 topicFilter）→ 空结果（供 API 返回 out_of_scope）。
  const domain = detectLaborDomain(query);
  if (topicFilter === undefined && !domain.isLabor) {
    return [];
  }
  return explainQuery(index, query, topK, topicFilter).ranked.map((c) => c.result);
}