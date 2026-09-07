import type { Metadata } from "next";
import Link from "next/link";
import { SITE_POSITIONING, SITE_TAGLINE, TOPICS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "劳动问题，回答有依据",
  description: `${SITE_POSITIONING}：面向中国劳动争议场景，回答基于检索到的资料并附可核验来源。`
};

const EVIDENCE_PATH = [
  {
    title: "提出问题",
    detail: "先判断是否属于劳动争议，识别涉及的问题场景。",
  },
  {
    title: "检索资料",
    detail: "在已与官方来源核对的全国性法规与官方案例中检索相关资料。",
  },
  {
    title: "分级整理",
    detail: "按 A 级全国性法律、B 级官方案例、C 级地方参考整理证据。",
  },
  {
    title: "核对引用",
    detail: "逐条校验来源编号，回答中每个引用都可展开核对。",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <h1>{SITE_TAGLINE}</h1>
            <p className="hero-lead">
              先检索已与官方来源核对的法规、官方案例和地方参考，再依据这些材料生成回答，并逐条附可核验来源。
            </p>
            <div className="hero-actions">
              <Link href="/ask" className="cta-button">
                开始提问
              </Link>
              <Link href="/laws" className="link-button">
                查看收录资料
              </Link>
            </div>
          </div>
          <aside className="hero-path" aria-label="回答生成步骤示意">
            <h2>一条回答如何形成</h2>
            <p className="hero-path-note">步骤示意：说明工作方式，不代表实时处理进度。</p>
            <ol className="path-steps">
              {EVIDENCE_PATH.map((step, index) => (
                <li key={step.title} className="path-step">
                  <span className="path-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
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
          <h2>回答遵循的三条原则</h2>
          <ol className="steps">
            <li>
              <h3>检索先行</h3>
              <p>回答只依据已与官方来源核对的资料生成，不依赖模型记忆，不凭空作答。</p>
            </li>
            <li>
              <h3>分级呈现</h3>
              <p>A 级全国性法律是结论依据，B 级官方案例供类案参考，C 级地方参考注明适用地域。</p>
            </li>
            <li>
              <h3>引用可核验</h3>
              <p>每条引用带编号、官方链接与条号；无法核验的引用不会出现在回答中。</p>
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
