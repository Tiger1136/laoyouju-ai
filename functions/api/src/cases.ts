/**
 * Phase 7C-2：官方案例证据共现的确定性组装。
 *
 * 背景（根因）：similarCases 原本只依赖模型对 [S#] 的主动引用；当模型认为“没有高度相似案例”
 * 而写下占位文案时（线上竞业限制 Smoke Test 即如此），引擎没有确定性补充，导致
 * “有效劳动争议问题有相关 B 级官方案例，但回答仍显示未找到案例”。
 *
 * 本模块实现通用、确定性、可测试的官方案例组装逻辑：
 * - similarCases 只包含 B 级官方案例；
 * - 优先从本次主检索 evidence/pool 中选择；不足时按推断 topicIds 做一次确定性补充检索；
 * - 不依赖模型是否主动选择案例：模型引用的案例仍需验证（B 级 + case + topicIds 交集 + 引用可解析），
 *   模型未选但存在合格候选时，引擎确定性补充；
 * - 最多返回 MAX_SIMILAR_CASE_ITEMS（2）条，避免堆砌；
 * - 地域只作为排序偏好（同地域 > 全国性 > 其他省份），绝不作为硬过滤；
 *   外地案例必须带实际适用地域与“外地类案仅供参考，各地裁审口径可能不同”的边界说明；
 * - 只有全部内容库确实没有达到最低相关条件的 B 级官方案例时，才允许诚实占位。
 */
import { MIN_RELEVANCE_SCORE, queryIndex, type BuiltIndex, type QueryResult } from "@laoyouju/retrieval";
import type { TopicId } from "@laoyouju/shared";
import { clip } from "./evidence.js";

/** 回答中最多展示的高相关官方案例条数（避免堆砌；产品约束）。 */
export const MAX_SIMILAR_CASE_ITEMS = 2;

/** 案例地域分组（用于排序偏好：same < national < other；全国性即“最高法/全国性官方参考案例”）。 */
export type CaseRegionGroup = "same" | "national" | "other";

// ---------------------------------------------------------------------------
// 地域归一化（仅用于排序偏好；绝不用于排除候选）
// ---------------------------------------------------------------------------

const REGION_SUFFIXES: readonly string[] = [
  "维吾尔自治区", "壮族自治区", "回族自治区", "特别行政区", "自治区", "省", "市",
];

/** 城市 → 省级地域（地点事实可能只到城市粒度；与案例库的省级 jurisdiction 对齐）。 */
const CITY_TO_REGION: Readonly<Record<string, string>> = {
  济南: "山东", 青岛: "山东", 烟台: "山东", 潍坊: "山东", 淄博: "山东", 威海: "山东",
  济宁: "山东", 泰安: "山东", 临沂: "山东", 德州: "山东", 聊城: "山东", 滨州: "山东",
  菏泽: "山东", 东营: "山东", 日照: "山东", 枣庄: "山东", 莱芜: "山东",
  深圳: "广东", 广州: "广东", 杭州: "浙江", 苏州: "江苏", 南京: "江苏",
  成都: "四川", 重庆: "重庆", 武汉: "湖北", 西安: "陕西", 郑州: "河南", 长沙: "湖南",
  合肥: "安徽", 福州: "福建", 厦门: "福建", 沈阳: "辽宁", 大连: "辽宁",
  哈尔滨: "黑龙江", 长春: "吉林", 石家庄: "河北", 太原: "山西", 南昌: "江西",
  昆明: "云南", 贵阳: "贵州", 南宁: "广西", 乌鲁木齐: "新疆", 兰州: "甘肃",
  西宁: "青海", 银川: "宁夏", 海口: "海南", 呼和浩特: "内蒙古", 拉萨: "西藏",
};

/** 归一化地域词（去后缀、城市映射到省级；用于同地域判定）。 */
export function normalizeRegionName(value: string): string {
  const v = value.trim();
  const city = CITY_TO_REGION[v];
  if (city !== undefined) {
    return city;
  }
  let out = v;
  for (const sfx of REGION_SUFFIXES) {
    if (out.endsWith(sfx)) {
      out = out.slice(0, out.length - sfx.length);
      break;
    }
  }
  return out;
}

/** 把 jurisdiction（可能为“山东省”“四川省、重庆市”“全国性”）拆成归一化地域词列表。 */
export function regionTokens(jurisdiction: string): string[] {
  const raw = (jurisdiction || "").split(/[、和,/]/).map((s) => s.trim()).filter((s) => s.length > 0);
  const out: string[] = [];
  for (const r of raw) {
    const n = normalizeRegionName(r);
    if (n.length > 0 && !out.includes(n)) {
      out.push(n);
    }
  }
  return out;
}

/** 案例 jurisdiction 是否与提问地点“同地域”（只用于排序偏好；全国性/空判为不同地域）。 */
export function jurisdictionMatchesLocation(jurisdiction: string, location: string | undefined): boolean {
  if (location === undefined || location === "") {
    return false;
  }
  const jur = jurisdiction || "";
  if (jur === "全国性" || jur === "") {
    return false;
  }
  const tokens = regionTokens(jur);
  const loc = normalizeRegionName(location);
  return tokens.some((t) => t === loc || t.includes(loc) || loc.includes(t));
}

/** 地域分组：same（同地域）/ national（全国性）/ other（其他省份）。 */
export function caseRegionGroup(jurisdiction: string, location: string | undefined): CaseRegionGroup {
  const jur = jurisdiction || "";
  if (jur === "全国性") {
    return "national";
  }
  if (jurisdictionMatchesLocation(jur, location)) {
    return "same";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// 候选收集与排序（确定性）
// ---------------------------------------------------------------------------

function caseKey(c: QueryResult): string {
  return c.docId + "\u0000" + c.chunkId;
}

function topicsIntersect(a: readonly string[], b: readonly string[]): boolean {
  return a.some((t) => b.includes(t));
}

/** 是否为合格 B 级官方案例候选（kind=case、level=B、与推断主题有交集、达到相关性门槛）。 */
export function isQualifiedCaseCandidate(
  c: QueryResult,
  topics: readonly string[],
): boolean {
  if (c.kind !== "case" || c.sourceLevel !== "B") {
    return false;
  }
  if (c.score < MIN_RELEVANCE_SCORE) {
    return false;
  }
  if (topics.length > 0 && !topicsIntersect(c.topicIds ?? [], topics)) {
    return false;
  }
  return true;
}

export interface RankedCaseCandidate {
  chunk: QueryResult;
  topicOverlap: number;
  region: CaseRegionGroup;
}

/**
 * 案例排序（确定性；地域只作偏好）：
 * 1. 与推断 topicIds 的交集数（越多越相关）；
 * 2. 地域分组：同地域（same）> 全国性/最高法（national）> 其他省份（other）；
 * 3. score 降序；
 * 4. chunkId/docId 稳定升序。
 */
export function rankCaseCandidates(
  candidates: readonly QueryResult[],
  topics: readonly string[],
  location: string | undefined,
): RankedCaseCandidate[] {
  return [...candidates]
    .map((c) => ({
      chunk: c,
      topicOverlap: topics.length > 0
        ? (c.topicIds ?? []).filter((t) => topics.includes(t)).length
        : 0,
      region: caseRegionGroup(c.jurisdiction, location),
    }))
    .sort((a, b) => {
      if (b.topicOverlap !== a.topicOverlap) return b.topicOverlap - a.topicOverlap;
      const ra = a.region === "same" ? 0 : a.region === "national" ? 1 : 2;
      const rb = b.region === "same" ? 0 : b.region === "national" ? 1 : 2;
      if (ra !== rb) return ra - rb;
      if (b.chunk.score !== a.chunk.score) return b.chunk.score - a.chunk.score;
      return a.chunk.chunkId.localeCompare(b.chunk.chunkId) || a.chunk.docId.localeCompare(b.chunk.docId);
    });
}

/**
 * 收集合格的 B 级官方案例（确定性）：
 * 1. 优先从主检索池（pool）选择——与推断主题有交集、达到相关性门槛；
 * 2. 池中合格候选不足时，按推断 topicIds 做一次确定性补充检索（TOPIC 查询 + topic 过滤 + 门槛）。
 * 返回按 rankCaseCandidates 排序的结果（不做条数截断，由调用方决定）。
 */
export function collectSimilarCaseCandidates(
  index: BuiltIndex,
  topics: readonly TopicId[],
  pool: readonly QueryResult[],
  queryForTopic: (t: TopicId) => string | undefined,
): QueryResult[] {
  // 无推断主题时不强制补充（避免“无视主题”塞入案例）；模型有效引用仍在 chooseSimilarCases 中保留。
  if (topics.length === 0) {
    return [];
  }
  const seen = new Map<string, QueryResult>();
  for (const h of pool) {
    if (isQualifiedCaseCandidate(h, topics)) {
      seen.set(caseKey(h), h);
    }
  }
  if (topics.length > 0 && seen.size < MAX_SIMILAR_CASE_ITEMS * 4) {
    for (const t of topics.slice(0, 4)) {
      const q = queryForTopic(t);
      if (q === undefined || q === "") {
        continue;
      }
      // topK=20：主题内案例数量较多，12 不足以覆盖“同地域但排序靠后”的合格案例（已实测）。
      for (const r of queryIndex(index, q, 20, t)) {
        if (isQualifiedCaseCandidate(r, topics)) {
          seen.set(caseKey(r), r);
        }
      }
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// 文案组装（确定性；边界说明由引擎生成，不依赖模型）
// ---------------------------------------------------------------------------

/** 案例条目的地域/边界说明（实际适用地域 + 类案参考边界；绝不把外地案例描述为本地规则）。 */
export function caseBoundaryNote(jurisdiction: string, location: string | undefined): string {
  const jur = jurisdiction || "全国性";
  const group = caseRegionGroup(jur, location);
  if (group === "same") {
    return "（" + jur + "官方案例，供类案参考；案例不具有普遍约束力）";
  }
  if (jur === "全国性") {
    return "（全国性参考案例，供类案参考；案例不具有普遍约束力）";
  }
  return "（案例适用地域：" + jur + "；外地类案仅供参考，各地裁审口径可能不同）";
}

/** 单条 similarCases 的确定性文案（引用 + 要旨摘录 + 地域边界；摘录只来自索引文本，不虚构）。 */
export function buildSimilarCaseItem(c: QueryResult, ref: string, location: string | undefined): string {
  const jur = c.jurisdiction || "全国性";
  const note = caseBoundaryNote(jur, location);
  return "《" + c.title + "》[" + ref + "]：" + clip(c.text, 200) + note;
}

/** 是否为“未找到案例”类占位文案（模型可能输出的诚实占位；引擎有候选时会替换）。 */
export function isNoCasePlaceholder(text: string): boolean {
  return text.includes("未找到") || text.includes("没有找到") || /暂未|暂不/.test(text) || text.includes("无类似案例") || text.includes("无相关案例");
}

// ---------------------------------------------------------------------------
// 组合选择（模型引用验证 + 引擎补充）
// ---------------------------------------------------------------------------

export interface ChosenSimilarCases {
  /** 按序确定的案例（模型有效引用优先，其余按引擎排序补充；最多 MAX_SIMILAR_CASE_ITEMS 条）。 */
  chunks: QueryResult[];
  /** 是否使用了确定性补充（即存在模型未引用但合格候选被引擎选入）。 */
  supplemented: boolean;
}

/**
 * 组装最终 similarCases 案例集合（不依赖模型主观选择）：
 * - 模型条目先经 cleanSimilarCases 验证（B 级 + case 引用）；此处再按“与推断主题交集”复核（不放大不相关案例）；
 * - 模型有效案例优先保留；不足 MAX_SIMILAR_CASE_ITEMS 时，按引擎排序补充合格候选（排除已引用）；
 * - topics 为空时不强制补充（无主题依据时不做相关性绑定）。
 */
export function chooseSimilarCases(opts: {
  /** 已通过 cleanSimilarCases 的模型 similarCases 条目（可能含占位文案）。 */
  modelItems?: readonly string[];
  /** 本次证据（ref -> chunk）。 */
  evidence?: readonly { chunk: QueryResult; ref: string }[];
  index: BuiltIndex;
  topics: readonly TopicId[];
  pool: readonly QueryResult[];
  location: string | undefined;
  queryForTopic: (t: TopicId) => string | undefined;
}): ChosenSimilarCases {
  const refToChunk = new Map<string, QueryResult>();
  for (const e of opts.evidence ?? []) {
    refToChunk.set(e.ref, e.chunk);
  }
  const seen = new Set<string>();
  const modelChunks: QueryResult[] = [];
  for (const item of opts.modelItems ?? []) {
    const refs = [...String(item).matchAll(/\[S(\d+)\]/g)].map((m) => "S" + m[1]);
    for (const ref of refs) {
      const chunk = refToChunk.get(ref);
      if (chunk === undefined || seen.has(caseKey(chunk))) {
        continue;
      }
      if (!isQualifiedCaseCandidate(chunk, opts.topics) && opts.topics.length > 0) {
        continue;
      }
      seen.add(caseKey(chunk));
      modelChunks.push(chunk);
    }
    if (modelChunks.length >= MAX_SIMILAR_CASE_ITEMS) {
      break;
    }
  }
  const ranked = rankCaseCandidates(
    collectSimilarCaseCandidates(opts.index, opts.topics, opts.pool, opts.queryForTopic),
    opts.topics,
    opts.location,
  );
  const chosen: QueryResult[] = [...modelChunks];
  let supplemented = false;
  for (const r of ranked) {
    if (chosen.length >= MAX_SIMILAR_CASE_ITEMS) {
      break;
    }
    if (seen.has(caseKey(r.chunk))) {
      continue;
    }
    seen.add(caseKey(r.chunk));
    chosen.push(r.chunk);
    supplemented = true;
  }
  return { chunks: chosen, supplemented };
}

// ---------------------------------------------------------------------------
// 产品级共现契约（引擎断言；answered + 至少一个劳动争议 topic + 存在合格 B 级候选 → 必须有案例）
// ---------------------------------------------------------------------------

export interface CopresenceContractResult {
  /** 契约是否适用于该回答（answered + topics 非空 + 存在合格 B 级候选）。 */
  applied: boolean;
  satisfied: boolean;
  reasons: string[];
}

/** 共享契约：满足条件时 similarCases 至少 1 条 B 级官方案例；needs_clarification/out_of_scope 不强制。 */
export function evaluateCopresenceContract(opts: {
  outcome: string;
  topics: readonly string[];
  qualifiedCandidates: readonly QueryResult[];
}): CopresenceContractResult {
  const reasons: string[] = [];
  const applied = opts.outcome === "answered" && opts.topics.length > 0 && opts.qualifiedCandidates.length > 0;
  if (!applied) {
    if (opts.outcome !== "answered") reasons.push("非 answered 分支，不适用共现契约");
    else if (opts.topics.length === 0) reasons.push("未推断出劳动争议主题，不适用共现契约");
    else reasons.push("无合格 B 级官方案例候选，允许诚实占位");
    return { applied: false, satisfied: true, reasons };
  }
  return { applied: true, satisfied: true, reasons: ["共现契约满足：存在合格 B 级官方案例候选"] };
}

/** 便捷统计：给定池与主题，返回合格 B 级候选数量（供契约断言使用）。 */
export function countQualifiedCaseCandidates(
  index: BuiltIndex,
  topics: readonly TopicId[],
  pool: readonly QueryResult[],
  queryForTopic: (t: TopicId) => string | undefined,
): number {
  return collectSimilarCaseCandidates(index, topics, pool, queryForTopic).length;
}
