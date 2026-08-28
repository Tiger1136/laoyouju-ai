/**
 * SearchProvider：联网检索抽象（Phase 7A）。
 * 产品目标：本地权威知识库为主，联网检索为辅（新法规、地方规则、时效性、相似案例线索）。
 * 实现约束：
 *  - 每个问题最多调用两次联网搜索（由编排层负责预算）；
 *  - 搜索 Key 只从服务端环境变量读取（WSA_API_KEY），绝不进入客户端/日志/报告；
 *  - 未配置 Key 时本地知识库仍可工作（provider 缺省为“未配置”）；
 *  - 使用原生 fetch，不引入 SDK；
 *  - 超时、限流与上游错误必须类型化（SearchError.kind）。
 */

/** 类型化搜索错误。 */
export type SearchErrorKind =
  | "missing_config" // WSA_API_KEY 未配置
  | "timeout" // 超时/中止
  | "rate_limited" // 上游限流（429）
  | "upstream_status" // 上游 4xx/5xx
  | "malformed" // 上游响应结构异常
  | "network"; // 网络错误

export class SearchError extends Error {
  readonly kind: SearchErrorKind;
  readonly status: number | undefined;
  constructor(kind: SearchErrorKind, status?: number) {
    super("search upstream error: " + kind + (status !== undefined ? " (" + status + ")" : ""));
    this.name = "SearchError";
    this.kind = kind;
    this.status = status;
  }
}

export function isSearchError(err: unknown): err is SearchError {
  return err instanceof SearchError;
}

/** 一条原始搜索结果（来自上游，尚未经过 evidence 校验）。 */
export interface SearchResultItem {
  /** 结果 URL（必须 HTTPS，后续由 validate 校验）。 */
  url: string;
  /** 结果标题。 */
  title: string;
  /** 摘要（不得被当作完整法条/全文使用）。 */
  snippet: string;
  /** 发布时间（ISO 日期，可缺失）。 */
  publishedAt?: string;
  /** 站点名称（可缺失）。 */
  siteName?: string;
}

export interface SearchQuery {
  /** 检索词（服务端由问题/焦点派生，不直接透传用户原始指令）。 */
  query: string;
  /** 期望结果数上限。 */
  limit?: number;
}

/** SearchProvider 抽象：本地知识库之外的联网检索入口。 */
export interface SearchProvider {
  readonly name: string;
  /** 是否已配置（未配置时编排层不应调用）。 */
  readonly configured: boolean;
  search(query: SearchQuery): Promise<SearchResultItem[]>;
}
