import type { Metadata } from "next";
import { buildCatalog } from "@laoyouju/retrieval";
import { TOPICS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "问题场景",
  description: "劳有据 AI 覆盖的劳动争议主题：劳动关系认定、劳动合同、二倍工资、工资与加班、经济补偿与赔偿金、社会保险、工伤、女职工保护、竞业限制、劳务派遣、新就业形态与劳动仲裁等。",
};

export default function TopicsPage() {
  const { topics } = buildCatalog();
  const countByTopic = new Map(topics.map((t) => [t.id, t]));
  return (
    <div className="container prose">
      <h1>问题场景</h1>
      <p className="page-lead">
        以下为产品覆盖的劳动争议主题（全国性规则）。每个主题提供：基于本地权威知识库与联网检索线索的问答、可核验的法律依据、相似官方案例与行动建议。以下说明覆盖范围与已收录资料情况，不构成具体法律结论。
      </p>
      <ul className="topic-list">
        {TOPICS.map((topic) => {
          const stat = countByTopic.get(topic.id);
          return (
            <li key={topic.id}>
              <h2>{topic.title}</h2>
              <p>{topic.description}</p>
              <p>
                <strong>已收录有效条文：</strong>
                {stat?.provisionCount ?? 0} 条
                <br />
                <strong>已收录官方指导/典型案例：</strong>
                {stat?.caseCount ?? 0} 个
              </p>
              {stat && <p>{stat.boundaryNote}</p>}
            </li>
          );
        })}
      </ul>
      <h2>资料边界与地方规则提示</h2>
      <p>
        本地知识库只覆盖全国性法律、行政法规、部门规章、司法解释、仲裁程序文件与官方指导/典型案例；涉及地方性法规、地方工资标准、地方仲裁口径时，将通过联网检索线索提示并以地方官方来源核验，不会用全国规则代替地方规则，也不会把未核验内容写入法律结论。
      </p>
      <p>
        所有已收录的法规与案例均标注“已核对官方来源，尚待专业复核”，尚未经过专业复核；已废止或被替代的旧司法解释仅保留在来源登记表中用于效力追溯。
      </p>
    </div>
  );
}
