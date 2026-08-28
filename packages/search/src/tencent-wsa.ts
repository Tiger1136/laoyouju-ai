import {
  SearchError,
  type SearchProvider,
  type SearchQuery,
  type SearchResultItem,
} from "./types.js";

/**
 * 腾讯云联网搜索（WSA）“服务 API KEY”方式实现。
 *
 * 协议依据（唯一官方文档）：
 *   https://cloud.tencent.com/document/product/1806/130615
 * - 接口请求域名：api.wsa.cloud.tencent.com；接口路径：/SearchPro；方法：POST；
 * - Header：Authorization: Bearer ${WSA_API_KEY}；Content-Type: application/json; charset=UTF-8；
 * - Body(JSON) 至少包含 Query；数量参数仅使用官方允许的 Cnt（10/20/30/40/50）；
 * - 返回结果来自 Response.Pages；Pages 中每个元素是 JSON 字符串（title/url/passage/content/date/site 等），需逐项安全解析；
 * - 字段映射：title→title、url→url、passage|content→snippet、date→publishedAt、site→siteName。
 *
 * 注意：WSA_API_KEY 只从服务端环境变量读取；未配置时 provider 为 undefined（本地知识库仍工作）；
 * 本阶段仅通过 mock fixture 测试，不进行任何真实联网调用。
 */
export const WSA_API_DOC_URL = "https://cloud.tencent.com/document/product/1806/130615";

/** 腾讯云联网搜索（WSA）默认服务地址（官方文档：api.wsa.cloud.tencent.com）。 */
export const DEFAULT_WSA_BASE_URL = "https://api.wsa.cloud.tencent.com";

/** 官方接口路径（文档：/SearchPro）。 */
export const DEFAULT_WSA_URI = "/SearchPro";

/** 腾讯云联网搜索 WSA API KEY 方式的默认超时（毫秒）。 */
export const DEFAULT_WSA_TIMEOUT_MS = 10_000;

/** 每次搜索默认结果数（官方 Cnt 最小值为 10）。 */
export const DEFAULT_WSA_MAX_RESULTS = 10;

/** Cnt 官方允许值（仅尊享版可自定义数量；其余版本生效值以腾讯云为准）。 */
export const WSA_CNT_OPTIONS = [10, 20, 30, 40, 50] as const;

/** 将请求数量规格化为官方允许的 Cnt 值（最近官方值；取整规则：半数向上）。 */
export function normalizeWsaCnt(limit: number): number {
  const n = Math.max(1, Math.min(limit, 50));
  return Math.min(50, Math.max(10, Math.round(n / 10) * 10));
}

export interface WsaProviderOptions {
  /** 服务 API KEY（仅服务端读取；未配置时 configured=false）。 */
  apiKey: string;
  /** WSA 服务地址（默认官方 DEFAULT_WSA_BASE_URL；可用环境变量覆盖，仅测试使用）。 */
  baseUrl?: string;
  timeoutMs?: number;
  maxResults?: number;
  /** 注入 fetch 以便 mock 测试（默认 globalThis.fetch）。 */
  fetchFn?: typeof fetch;
}

/** 从环境变量解析 WSA 配置（Key 只从 WSA_API_KEY 读取，绝不出现在默认值/日志中）。 */
export function resolveWsaOptions(env: NodeJS.ProcessEnv = process.env): WsaProviderOptions {
  return {
    apiKey: env.WSA_API_KEY ?? "",
    baseUrl: (env.WSA_API_BASE_URL ?? DEFAULT_WSA_BASE_URL).replace(/\/+$/, ""),
    timeoutMs: Number(env.WSA_TIMEOUT_MS ?? DEFAULT_WSA_TIMEOUT_MS),
    maxResults: Number(env.WSA_MAX_RESULTS ?? DEFAULT_WSA_MAX_RESULTS),
  };
}

/**
 * TencentWSASearchProvider：腾讯云联网搜索（WSA）的“服务 API KEY”方式实现。
 * - 鉴权：Authorization: Bearer ${WSA_API_KEY}（官方文档；服务端专用）。
 * - 原生 fetch + AbortController 超时；不引入 SDK。
 * - 错误类型化：missing_config / timeout / rate_limited / upstream_status / malformed / network。
 * - 结果仅作“线索/摘录”返回，进入证据集前必须经过 validateSearchItems 校验，
 *   摘要一律不得当作完整法条（见 validation 规则）。
 * - 本阶段（Phase 7A）不进行任何真实调用：测试使用 mock fetch fixture。
 */
export class TencentWSASearchProvider implements SearchProvider {
  readonly name = "tencent-wsa";
  private readonly opts: WsaProviderOptions;

  constructor(options: WsaProviderOptions) {
    this.opts = {
      baseUrl: DEFAULT_WSA_BASE_URL,
      timeoutMs: DEFAULT_WSA_TIMEOUT_MS,
      maxResults: DEFAULT_WSA_MAX_RESULTS,
      fetchFn: globalThis.fetch,
      ...options,
    };
  }

  get configured(): boolean {
    return this.opts.apiKey.trim() !== "";
  }

  async search(query: SearchQuery): Promise<SearchResultItem[]> {
    if (!this.configured) {
      throw new SearchError("missing_config");
    }
    const fetchFn = this.opts.fetchFn ?? globalThis.fetch;
    const baseUrl = this.opts.baseUrl ?? DEFAULT_WSA_BASE_URL;
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_WSA_TIMEOUT_MS;
    const limit = Math.max(1, Math.min(query.limit ?? this.opts.maxResults ?? DEFAULT_WSA_MAX_RESULTS, 50));

    // 官方请求参数：Query 必填；数量仅使用官方允许的 Cnt（10/20/30/40/50；不再使用自造的 SearchType/Limit/ResultItems）。
    const body: Record<string, unknown> = { Query: query.query, Cnt: normalizeWsaCnt(limit) };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetchFn(baseUrl + DEFAULT_WSA_URI, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (
        controller.signal.aborted ||
        (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))
      ) {
        throw new SearchError("timeout");
      }
      throw new SearchError("network");
    }
    clearTimeout(timer);

    if (res.status === 429) {
      throw new SearchError("rate_limited", res.status);
    }
    if (!res.ok) {
      throw new SearchError("upstream_status", res.status);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new SearchError("malformed");
    }

    return normalizeWsaResponse(data, limit);
  }
}

/**
 * 归一化官方 WSA 响应（Response.Pages，元素为 JSON 字符串）为 SearchResultItem[]。
 * 结构异常抛 malformed；Pages 内单个元素解析失败时跳过（逐项安全解析），
 * 但整批都无法解析时抛 malformed（绝不把结构性失败伪装成空结果）。
 */
export function normalizeWsaResponse(data: unknown, limit: number): SearchResultItem[] {
  if (data === null || typeof data !== "object") {
    throw new SearchError("malformed");
  }
  const record = data as Record<string, unknown>;
  // 官方输出：{ "Response": { "Pages": [...] } }；兼容个别环境直接返回 Pages 顶层。
  const response = record.Response as Record<string, unknown> | undefined;
  const pages = Array.isArray(response?.Pages) ? response.Pages : Array.isArray(record.Pages) ? record.Pages : undefined;
  if (pages === undefined) {
    throw new SearchError("malformed");
  }
  const respError =
    (record.Error as Record<string, unknown> | undefined)?.Code ??
    (response?.Error as Record<string, unknown> | undefined)?.Code;
  if (typeof respError === "string" && respError !== "") {
    throw new SearchError("upstream_status");
  }

  const out: SearchResultItem[] = [];
  let parsedCount = 0;
  for (const entry of pages) {
    if (typeof entry !== "string" || entry.trim() === "") {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry);
    } catch {
      continue; // 单个元素畸形：跳过，不中断整批
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      continue;
    }
    parsedCount++;
    const r = parsed as Record<string, unknown>;
    // 官方字段映射：title/url/passage|content/date/site
    const url = firstString(r.url);
    const title = firstString(r.title);
    const snippet = firstString(r.passage, r.content);
    if (url === undefined || title === undefined || snippet === undefined) {
      continue;
    }
    const publishedAt = typeof r.date === "string" && r.date.trim() !== "" ? r.date.trim() : undefined;
    const siteName = firstString(r.site);
    const item: SearchResultItem = {
      url,
      title,
      snippet,
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(siteName !== undefined ? { siteName } : {}),
    };
    out.push(item);
    if (out.length >= limit) {
      break;
    }
  }
  if (pages.length > 0 && parsedCount === 0) {
    throw new SearchError("malformed");
  }
  return out;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") {
      return v.trim();
    }
  }
  return undefined;
}
