import type { Metadata } from "next";

const SOURCES = [
  {
    name: "国家法律法规数据库",
    url: "https://flk.npc.gov.cn/",
    note: "法律法规文本",
  },
  {
    name: "最高人民法院",
    url: "https://www.court.gov.cn/",
    note: "司法解释与权威裁判观点",
  },
  {
    name: "人力资源和社会保障部",
    url: "https://www.mohrss.gov.cn/",
    note: "劳动关系相关政策文件",
  },
  {
    name: "人民法院案例库",
    url: "https://rmfyalk.court.gov.cn/",
    note: "权威案例",
  },
] as const;

export const metadata: Metadata = {
  title: "资料来源",
  description: "回答引用的资料来源类别：国家法律法规数据库、最高人民法院、人力资源和社会保障部、人民法院案例库。",
};

export default function SourcesPage() {
  return (
    <div className="container prose">
      <h1>资料来源</h1>
      <p>回答引用的资料只来自以下官方渠道，经与官方来源逐条核对后入库（尚待专业复核）。以下为官方首页链接，本站不会自动抓取任何网站内容。</p>
      <ul>
        {SOURCES.map((source) => (
          <li key={source.name}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.name}
            </a>
            <span> —— {source.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
