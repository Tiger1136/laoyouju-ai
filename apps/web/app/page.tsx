import type { Metadata } from "next";
import Link from "next/link";
import { SITE_POSITIONING, SITE_TAGLINE, TOPICS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "劳动问题，回答有依据",
  description: `${SITE_POSITIONING}：面向中国劳动争议场景，回答基于检索到的资料并附可核验来源。`,
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>{SITE_TAGLINE}</h1>
          <p className="hero-lead">
            {SITE_POSITIONING}。面向中国劳动争议场景，回答基于已与官方来源核对的资料生成，并逐条附可核验来源。
          </p>
          <Link href="/ask" className="cta-button">
            开始提问
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>首版问题场景</h2>
          <ul className="topic-grid">
            {TOPICS.map((topic) => (
              <li key={topic.id} className="topic-card">
                <h3>{topic.title}</h3>
                <p>{topic.description}</p>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/topics">查看问题场景说明</Link>
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2>回答如何形成</h2>
          <ol className="steps">
            <li>
              <h3>理解问题</h3>
              <p>先判断问题属于哪个劳动争议场景，确认需要哪些资料。</p>
            </li>
            <li>
              <h3>检索依据</h3>
              <p>在已与官方来源核对的全国性法律法规与权威案例中检索相关资料。</p>
            </li>
            <li>
              <h3>给出带来源的行动建议</h3>
              <p>基于检索资料生成回答，逐条附可核验来源；事实不足时追问关键信息并给出已确定的法律框架，非劳动问题则给出领域引导。</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>官方资料来源</h2>
          <p>
            回答引用的资料来自国家法律法规数据库、最高人民法院、人力资源和社会保障部与人民法院案例库等官方渠道，经与官方来源逐条核对后入库（尚待专业复核）。
            详见 <Link href="/about/sources">资料来源说明</Link>。
          </p>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2>产品边界与 AI 提醒</h2>
          <p>
            本站是信息检索与行动辅助工具，不是律师，不提供诉讼代理，不承诺案件结果；内容由 AI 辅助生成。
            详见 <Link href="/ai-notice">AI 内容提示</Link> 与 <Link href="/terms">使用条款</Link>。
          </p>
        </div>
      </section>
    </>
  );
}
