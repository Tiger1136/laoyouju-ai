import { isAllowedOfficialHost } from "@laoyouju/retrieval";
import type { SearchResultItem } from "./types.js";

/** 搜索结果的拒绝原因（绝对不允许进入证据集的理由）。 */
export type SearchRejectReason =
  | "NOT_HTTPS"
  | "NOT_OFFICIAL_DOMAIN"
  | "FUTURE_PUBLISHED_AT"
  | "MISSING_TEXT"
  | "OVERSIZED_TEXT";

export interface ValidatedSearchItem {
  item: SearchResultItem;
  /** 依据官方域名白名单判断的官方性（true=官方域名）。非官方的结果归为 C 级线索（若进入证据集需标记为 C 且注明线索性质）。 */
  official: boolean;
}

export interface ValidateSearchOptions {
  /** 额外允许的官方域名（如地方高院/地方人社部门官方域；服务端白名单维护）。 */
  extraOfficialDomains?: string[];
  /** 绝对禁止的域名（如微信公众号、微博、抖音等社会内容的默认拒绝由 NOT_OFFICIAL 覆盖；此处可加硬性黑名单）。 */
  deniedDomains?: string[];
  /** 当前日期（ISO），用于未来发布日期检查。 */
  now: string;
  /** 单条摘要最大长度（超过则拒绝；摘要不得作为完整法条）。 */
  maxSnippetChars?: number;
}

/**
 * 校验搜索结果是否可进入证据集：URL(HTTPS+域名)、来源等级、发布时间、内容一致性（长度/完整性）。
 * 规则（Phase 7A）：
 *  - 仅官方域名（白名单+额外官方域）的结果可作为 A/B 级证据候选；
 *  - 非官方域名结果一律拒绝进入证据集（C 级线索由白名单另行管理，本阶段不写入回答）；
 *  - 发布日期在未来、超长/缺失文本、非 HTTPS 的结果拒绝；
 *  - 摘要只能作为“线索/摘录”，不得当作完整法条（由编排层在使用时声明）。
 */
export function validateSearchItems(
  items: SearchResultItem[],
  options: ValidateSearchOptions,
): { accepted: ValidatedSearchItem[]; rejected: { url: string; reason: SearchRejectReason }[] } {
  const extra = options.extraOfficialDomains ?? [];
  const denied = options.deniedDomains ?? [];
  const maxSnippet = options.maxSnippetChars ?? 600;
  const accepted: ValidatedSearchItem[] = [];
  const rejected: { url: string; reason: SearchRejectReason }[] = [];

  for (const item of items) {
    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      rejected.push({ url: item.url, reason: "NOT_HTTPS" });
      continue;
    }
    if (url.protocol !== "https:") {
      rejected.push({ url: item.url, reason: "NOT_HTTPS" });
      continue;
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (denied.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase()))) {
      rejected.push({ url: item.url, reason: "NOT_OFFICIAL_DOMAIN" });
      continue;
    }
    const official = isAllowedOfficialHost(host) || extra.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase()));
    if (!official) {
      rejected.push({ url: item.url, reason: "NOT_OFFICIAL_DOMAIN" });
      continue;
    }
    const title = item.title.trim();
    const snippet = item.snippet.trim();
    if (title === "" || snippet === "") {
      rejected.push({ url: item.url, reason: "MISSING_TEXT" });
      continue;
    }
    if (snippet.length > maxSnippet) {
      rejected.push({ url: item.url, reason: "OVERSIZED_TEXT" });
      continue;
    }
    if (item.publishedAt !== undefined) {
      const m = /^\d{4}-\d{2}-\d{2}$/.exec(item.publishedAt.trim());
      if (m !== null) {
        if (item.publishedAt.trim() > options.now) {
          rejected.push({ url: item.url, reason: "FUTURE_PUBLISHED_AT" });
          continue;
        }
      }
    }
    accepted.push({ item: { ...item, title, snippet }, official: true });
  }
  return { accepted, rejected };
}