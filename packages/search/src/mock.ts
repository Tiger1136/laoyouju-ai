import type { SearchProvider, SearchQuery, SearchResultItem } from "./types.js";
import { SearchError } from "./types.js";

export type MockSearchBehavior =
  | { kind: "results"; results: SearchResultItem[] }
  | { kind: "error"; error: "missing_config" | "timeout" | "rate_limited" | "upstream_status" | "malformed" | "network" }
  | { kind: "keyword"; byKeyword: Record<string, SearchResultItem[]> };

/**
 * MockSearchProvider：Phase 7A 联网检索测试专用（绝不调用真实 WSA，不产生费用）。
 * - 支持固定结果 / 关键字路由 / 注入类型化错误；
 * - 记录被调用次数与查询词，便于验证“每个问题最多两次搜索”的预算约束。
 */
export class MockSearchProvider implements SearchProvider {
  readonly name = "mock-wsa";
  readonly configured = true;
  readonly calls: { query: string; at: number }[] = [];
  private readonly behavior: MockSearchBehavior;

  constructor(behavior: MockSearchBehavior = { kind: "results", results: [] }) {
    this.behavior = behavior;
  }

  async search(query: SearchQuery): Promise<SearchResultItem[]> {
    this.calls.push({ query: query.query, at: Date.now() });
    if (this.behavior.kind === "error") {
      throw new SearchError(this.behavior.error);
    }
    if (this.behavior.kind === "keyword") {
      for (const [k, results] of Object.entries(this.behavior.byKeyword)) {
        if (query.query.includes(k)) {
          return results;
        }
      }
      return [];
    }
    return this.behavior.results.slice(0, query.limit ?? this.behavior.results.length);
  }
}