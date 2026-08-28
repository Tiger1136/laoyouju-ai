import type { Metadata } from "next";
import { TOPIC_LABELS } from "@laoyouju/shared";
import { buildCatalog } from "@laoyouju/retrieval";

export const metadata: Metadata = {
  title: "权威案例库",
  description:
    "劳有据 AI 收录的最高人民法院、人力资源和社会保障部等官方渠道发布的劳动争议指导案例与典型案例；案例摘要不等于对用户个案的结论。已核对官方来源、尚待专业复核。",
};

export default function CasesPage() {
  const { cases } = buildCatalog();
  return (
    <div className="container prose">
      <h1>权威案例库</h1>
      <p>
        以下案例来自最高人民法院、人力资源和社会保障部等官方渠道（含全国性劳动人事争议典型案例、涉欠薪纠纷典型案例、新就业形态劳动者权益保障典型案例等），已核对官方来源、尚待专业复核。本库不包含任何虚构案例。
      </p>
      <p className="case-disclaimer">
        <strong>提示</strong>：案例摘要是对个案事实与裁判规则的简要概括，不等于对用户个案的结论；用户的个案适用需要结合具体事实与现行规则由专业人员判断。
      </p>
      {cases.length === 0 ? (
        <p>暂无收录的案例。</p>
      ) : (
        <ul className="case-list">
          {cases.map((c) => (
            <li key={c.sourceId}>
              <h2>{c.title}</h2>
              <p>
                <strong>发布机关：</strong>
                {c.publishingAuthority}
                <br />
                <strong>案例类型：</strong>
                {c.caseTypeLabel}
                <br />
                <strong>发布日期：</strong>
                {c.publicationDate}
                <br />
                <strong>适用地区：</strong>
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
          ))}
        </ul>
      )}
    </div>
  );
}