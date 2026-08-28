import type { Metadata } from "next";
import { SOURCE_LEVEL_LABELS, TOPIC_LABELS } from "@laoyouju/shared";
import { buildCatalog, type CatalogCaseView } from "@laoyouju/retrieval";

export const metadata: Metadata = {
  title: "权威案例库",
  description:
    "劳有据 AI 收录的最高人民法院、人力资源和社会保障部等全国性官方渠道以及山东省高级人民法院等地方官方渠道发布的劳动争议指导案例与典型案例（B 级，仅供类案参考，无普遍约束力）；案例摘要不等于对用户个案的结论。已核对官方来源、尚待专业复核。",
};

export default function CasesPage() {
  const { cases } = buildCatalog();
  const shandongCases = cases.filter((c) => c.jurisdiction === "山东省");
  const otherCases = cases.filter((c) => c.jurisdiction !== "山东省");
  return (
    <div className="container prose">
      <h1>权威案例库</h1>
      <p>
        以下案例来自最高人民法院、人力资源和社会保障部等官方渠道（含全国性劳动人事争议典型案例、涉欠薪纠纷典型案例、新就业形态劳动者权益保障典型案例等）以及山东省高级人民法院等地方官方渠道（山东省官方案例，随案例标注发布机关与适用地域），已核对官方来源、尚待专业复核。本库不包含任何虚构案例。
      </p>
      <p className="case-disclaimer">
        <strong>提示</strong>：所有案例均为 <strong>B 级 · 官方案例参考</strong>，仅供类案参考，不具有普遍约束力，不是制定法；案例摘要是对个案事实与裁判规则的简要概括，不等于对用户个案的结论；用户的个案适用需要结合具体事实与现行规则由专业人员判断。
      </p>

      <h2>全国性及其他地区官方案例（B 级 · 类案参考）</h2>
      {otherCases.length === 0 ? (
        <p>暂无收录的案例。</p>
      ) : (
        <ul className="case-list">
          {otherCases.map((c) => (
            <CaseCard key={c.sourceId} c={c} isShandong={false} />
          ))}
        </ul>
      )}

      <h2>山东省官方案例（B 级 · 类案参考，仅适用山东地区口径）</h2>
      <p className="level-warning">
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
  return (
    <li>
      <h2>
        {c.title}
        {isShandong ? <span className="level-tag level-tag-c">山东省官方案例 · B级 · 类案参考</span> : <span className="level-tag level-tag-b">B级 · 官方案例参考（类案参考）</span>}
      </h2>
      <p>
        <strong>发布机关：</strong>
        {c.publishingAuthority}
        <br />
        <strong>权威层级：</strong>
        {levelLabel}
        {isShandong ? "（山东省官方案例，仅作为山东地区类案参考）" : "（类案参考，无普遍约束力）"}
        <br />
        <strong>案例类型：</strong>
        {c.caseTypeLabel}
        <br />
        <strong>发布日期：</strong>
        {c.publicationDate}
        <br />
        <strong>适用地域：</strong>
        {c.jurisdiction}
        <br />
        <strong>争议焦点：</strong>
        {c.issues.join("；")}
        <br />
        <strong>规则要点：</strong>
        {c.reasoning.length > 400 ? c.reasoning.slice(0, 400) + "…" : c.reasoning}
        <br />
        <strong>覆盖主题：</strong>
        {c.topicIds.map((t) => TOPIC_LABELS[t as keyof typeof TOPIC_LABELS] ?? t).join("、")}
        <br />
        <strong>内容状态：</strong>
        {c.reviewStatusLabel}
        <br />
        <strong>核对日期：</strong>
        {c.sourceCheckedAt}
        <br />
        <strong>官方链接：</strong>
        <a href={c.officialUrl} target="_blank" rel="noopener noreferrer">
          查看官方案例
        </a>
      </p>
    </li>
  );
}
