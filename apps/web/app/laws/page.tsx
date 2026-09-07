import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SOURCE_LEVEL_LABELS, TOPIC_LABELS } from "@laoyouju/shared";
import { buildCatalog, type CatalogLawView } from "@laoyouju/retrieval";

export const metadata: Metadata = {
  title: "法律法规库",
  description: "劳有据 AI 收录的全国性法律、行政法规、部门规章、司法解释与仲裁程序文件（A 级），以及山东省高级人民法院、山东省人社厅发布的地方裁审指引（C 级，仅适用于山东省，不属于全国统一法律依据）；均标注官方来源、文号、效力状态、权威层级与核验状态。",
};

export default function LawsPage() {
  const { laws } = buildCatalog();
  const nationalLaws = laws.filter((law) => law.authorityLevel === "A");
  const localGuides = laws.filter((law) => law.authorityLevel === "C");
  return (
    <div className="container prose">
      <h1>法律法规库</h1>
      <p className="page-lead">
        按权威层级分区展示：<strong>A 级·全国性法律规范</strong>（法律、行政法规、部门规章、司法解释与仲裁程序文件，现行有效或经修正）与 <strong>C 级·地方裁审参考</strong>（山东省高级人民法院、山东省人社厅发布的地方裁审会议纪要/诉讼指引，仅适用山东省）。每条来源均标注发文机关、文号、公布/施行日期、效力状态、适用地区与官方链接；内容状态为“已核对官方来源、尚待专业复核”。本页面不构成法律结论。
      </p>

      <div className="group-head">
        <h2>国家法律法规与司法解释（A 级 · 全国性规则）</h2>
        <span className="count-note">{nationalLaws.length} 份</span>
      </div>
      {nationalLaws.length === 0 ? (
        <p>暂无收录的全国性法律法规。</p>
      ) : (
        <ul className="law-list">
          {nationalLaws.map((law) => (
            <LawCard key={law.sourceId} law={law} showLocalWarning={false} />
          ))}
        </ul>
      )}

      <div className="group-head">
        <h2>地方裁审参考（C 级 · 仅山东省）</h2>
        <span className="count-note">{localGuides.length} 份</span>
      </div>
      <p className="notice-box notice-box-c">
        <strong>重要提示</strong>：以下为山东省高级人民法院、山东省人力资源社会保障厅发布的地方裁审会议纪要/诉讼指引，属于 C 级地方裁审口径参考，<strong>仅适用于山东省裁审实践，不属于全国统一法律依据</strong>；全国性法律结论应以 A 级全国性规范为准，其他地区裁审口径可能不同。
      </p>
      {localGuides.length === 0 ? (
        <p>暂无收录的地方裁审参考。</p>
      ) : (
        <ul className="law-list">
          {localGuides.map((law) => (
            <LawCard key={law.sourceId} law={law} showLocalWarning />
          ))}
        </ul>
      )}

      <h2>参考资料状态</h2>
      <p>
        “已核对官方来源，尚待专业复核”表示该资料已与官方来源逐条核对（含程序化抓取核验），但尚未经过律师等专业人员复核；正式开放 AI 个案问答前需要专业复核。已废止/被替代的旧解释仅保留在来源登记表中用于效力追溯，不作为现行依据。
      </p>
    </div>
  );
}

function LawCard({ law, showLocalWarning }: { law: CatalogLawView; showLocalWarning: boolean }) {
  const levelLabel = SOURCE_LEVEL_LABELS[law.authorityLevel as keyof typeof SOURCE_LEVEL_LABELS] ?? law.authorityLevel;
  const meta: Array<[string, ReactNode]> = [
    ["文件类型：", law.sourceTypeLabel],
    ["权威层级：", levelLabel + (showLocalWarning ? "（仅适用于山东省，非全国统一规则）" : "（全国性规则）")],
    ["发文机关：", law.issuingAuthority + (law.documentNumber ? "（" + law.documentNumber + "）" : "")],
    ["效力状态：", law.validityStatusLabel],
    ["公布日期：", law.promulgationDate],
    ["施行日期：", law.effectiveDate],
    ["适用地区：", law.jurisdiction],
    ["覆盖主题：", law.topicIds.map((t) => TOPIC_LABELS[t as keyof typeof TOPIC_LABELS] ?? t).join("、")],
    ["内容状态：", law.reviewStatusLabel],
    ["核验状态：", law.verificationStatusLabel],
    ["核对日期：", law.retrievedAt],
  ];
  if (law.supersededBy.length > 0) {
    meta.push(["替代关系", law.supersededBy.join("、")]);
  }
  return (
    <li className="law-card">
      <div className="card-head">
        <h2>{law.title}</h2>
        {showLocalWarning ? (
          <span className="level-tag level-tag-c">山东省 · C级 · 地方裁审参考 · 不属于全国统一法律依据</span>
        ) : (
          <span className="level-tag level-tag-a">A级 · 全国性法律规范</span>
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
            <span className="meta-label">官方来源：</span>
            <span className="meta-value"><a href={law.officialUrl} target="_blank" rel="noopener noreferrer">查看官方文本</a></span>
          </p>
        </div>
        {law.provisions.length > 0 && (
          <p className="provisions-line">
            <strong>收录条文（完整拆分）：</strong>
            {law.provisions.map((p) => p.locator).join("、")}
          </p>
        )}
      </div>
    </li>
  );
}
