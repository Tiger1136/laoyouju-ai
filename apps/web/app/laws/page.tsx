import type { Metadata } from "next";
import { TOPIC_LABELS } from "@laoyouju/shared";
import { buildCatalog } from "@laoyouju/retrieval";

export const metadata: Metadata = {
  title: "法律法规库",
  description:
    "劳有据 AI 收录的全国性法律、行政法规、部门规章、司法解释与仲裁程序文件，均标注官方来源、文号、效力状态与核验状态；已核对官方来源、尚待专业复核。",
};

export default function LawsPage() {
  const { laws } = buildCatalog();
  return (
    <div className="container prose">
      <h1>法律法规与仲裁程序库</h1>
      <p>
        以下收录全国性法律、行政法规、部门规章、司法解释与仲裁程序文件（现行有效或经修正），每条来源均标注发文机关、文号、公布/施行日期、效力状态、适用地区与官方链接；内容状态为“已核对官方来源、尚待专业复核”。本页面不构成法律结论。
      </p>
      {laws.length === 0 ? (
        <p>暂无收录的法律法规。</p>
      ) : (
        <ul className="law-list">
          {laws.map((law) => (
            <li key={law.sourceId}>
              <h2>{law.title}</h2>
              <p>
                <strong>文件类型：</strong>
                {law.sourceTypeLabel}
                <br />
                <strong>发文机关：</strong>
                {law.issuingAuthority}
                {law.documentNumber ? `（${law.documentNumber}）` : ""}
                <br />
                <strong>效力状态：</strong>
                {law.validityStatusLabel}
                <br />
                <strong>公布日期：</strong>
                {law.promulgationDate}
                <br />
                <strong>施行日期：</strong>
                {law.effectiveDate}
                <br />
                <strong>适用地区：</strong>
                {law.jurisdiction}
                <br />
                <strong>覆盖主题：</strong>
                {law.topicIds.map((t) => TOPIC_LABELS[t as keyof typeof TOPIC_LABELS] ?? t).join("、")}
                <br />
                <strong>内容状态：</strong>
                {law.reviewStatusLabel}
                <br />
                <strong>核验状态：</strong>
                {law.verificationStatusLabel}
                <br />
                <strong>核对日期：</strong>
                {law.retrievedAt}
                <br />
                {law.supersededBy.length > 0 && (<><br /><strong>替代关系：</strong>{law.supersededBy.join("、")}</>)}
                <br />
                <strong>官方来源：</strong>
                <a href={law.officialUrl} target="_blank" rel="noopener noreferrer">
                  查看官方文本
                </a>
              </p>
              {law.provisions.length > 0 && (
                <p>
                  <strong>收录条文（完整拆分）：</strong>
                  {law.provisions.map((p) => p.locator).join("、")}
                </p>
              )}
            </li>
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