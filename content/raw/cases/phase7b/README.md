# phase7b/raw 说明（Phase 7B，2026-08-28）

- `content/raw/cases/phase7b/*.txt`：官方页面结构化批次文本（====CASE:N==== 分节块），由 `scripts/extract-case-batch.mjs` 生成或经人工整理；
- 与 `content/sources/probe/cases-phase7b-*.json`（批次清单）一一对应的批次已导入 `content/cases/*.json`；
- **hun-2025-01.txt（湖南 5 案例）未入库**：官方页面 hngy.hunancourt.gov.cn 仅 HTTP 可用且 HTTPS 证书无效（CDN 证书不匹配），不满足 schema“HTTPS 官方 URL”要求，未加入 host 白名单；按“宁缺毋滥”原则弃用（湖南日报/湖南在线等转载页为非官方来源，不使用）。保留原始文本仅作审计记录。
