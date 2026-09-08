import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SOURCE_LEVEL_LABELS, TOPIC_LABELS } from "@laoyouju/shared";
import { buildCatalog, type CatalogCaseView } from "@laoyouju/retrieval";

export const metadata: Metadata = {
  title: "权威案例库",
  description: "劳有据 AI 收录的最高人民法院、人力资源和社会保障部等全国性官方渠道以及山东省高级人民法院等地方官方渠道发布的劳动争议指导案例与典型案例（B 级，仅供类案参考，无普遍约束力）；案例摘要不等于对用户个案的结论。已核对官方来源、尚待专业复核。",
};

export default function CasesPage() {
  const { cases } = buildCatalog();
  const shandongCases = cases.filter((c) => c.jurisdiction === "山东省");
  const otherCases = cases.filter((c) => c.jurisdiction !== "山东省");
  return (
    <div className="container prose">
      <h1>权威案例库</h1>
      <p className="page-lead">
        以下案例来自最高人民法院、人力资源和社会保障部等全国性官方渠道及山东省等地方官方渠道，已核对官方来源、尚待专业复核；本库不包含任何虚构案例。
      </p>
      <div className="evidence-legend" aria-label="证据等级图例">
        <span className="legend-chip legend-a">A · 全国性法律依据</span>
        <span className="legend-chip legend-b">B · 官方案例参考</span>
        <span className="legend-chip legend-c">C · 地方裁审参考</span>
      </div>
      <p className="case-disclaimer">
        <strong>提示</strong>：所有案例均为 B 级 · 官方案例参考，仅供类案参考，不具有普遍约束力；案例摘要不等于对用户个案的结论，个案适用需由专业人员结合具体事实判断。
      </p>

      <div className="group-head">
        <h2>全国性及其他地区官方案例（B 级 · 类案参考）</h2>
        <span className="count-note">{otherCases.length} 个</span>
      </div>
      {otherCases.length === 0 ? (
        <p>暂无收录的案例。</p>
      ) : (
        <ul className="case-list">
          {otherCases.map((c) => (
            <CaseCard key={c.sourceId} c={c} isShandong={false} />
          ))}
        </ul>
      )}

      <div className="group-head">
        <h2>山东省官方案例（B 级 · 类案参考，仅适用山东地区口径）</h2>
        <span className="count-note">{shandongCases.length} 个</span>
      </div>
      <p className="notice-box notice-box-b">
        <strong>重要提示</strong>：以下为山东省高级人民法院、山东省人社厅等发布的官方典型案例，标注发布机关与适用地域（山东省）；案例仅供类案参考，不构成全国统一规则。
      </p>
      {shandongCases.length === 0 ? (
        <p>暂无收录的山东官方案例。</p>
      ) : (
        <ul className="case-list">
          {shandongCases.map((c) => (
            <CaseCard key={c.sourceId} c={c} isShandong />
          ))}
        </ul>
      )}
    </div>
  );
}

function CaseCard({ c, isShandong }: { c: CatalogCaseView; isShandong: boolean }) {
  const levelLabel = SOURCE_LEVEL_LABELS[c.authorityLevel as keyof typeof SOURCE_LEVEL_LABELS] ?? c.authorityLevel;
  const meta: Array<[string, ReactNode]> = [
    ["发布机关：", c.publishingAuthority],
    ["权威层级：", levelLabel + (isShandong ? "（山东省官方案例，仅作为山东地区类案参考）" : "（类案参考，无普遍约束力）")],
    ["案例类型：", c.caseTypeLabel],
    ["发布日期：", c.publicationDate],
    ["适用地域：", c.jurisdiction],
    ["争议焦点：", c.issues.join("；")],
    ["覆盖主题：", c.topicIds.map((t) => TOPIC_LABELS[t as keyof typeof TOPIC_LABELS] ?? t).join("、")],
    ["内容状态：", c.reviewStatusLabel],
    ["核对日期：", c.sourceCheckedAt],
  ];
  return (
    <li className="case-card">
      <div className="card-head">
        <h2>{c.title}</h2>
        {isShandong ? (
          <span className="level-tag level-tag-b">山东省官方案例 · B级 · 类案参考（仅山东地区口径）</span>
        ) : (
          <span className="level-tag level-tag-b">B级 · 官方案例参考（类案参考）</span>
        )}
      </div>
      <div>
        <div className="meta-list">
          {meta.map(([label, value]) => (
            <p key={label} className="meta-row">
              <span className="meta-label">{label}</span>
              <span className="meta-value">{value}</span>
            </p>
          ))}
          <p className="meta-row">
            <span className="meta-label">官方链接：</span>
            <span className="meta-value"><a href={c.officialUrl} target="_blank" rel="noopener noreferrer">查看官方案例</a></span>
          </p>
        </div>
        <details className="case-summary-details">
          <summary>规则要点（摘要）</summary>
          <p className="case-summary">{c.reasoning.length > 400 ? c.reasoning.slice(0, 400) + "…" : c.reasoning}</p>
        </details>
      </div>
    </li>
  );
}
