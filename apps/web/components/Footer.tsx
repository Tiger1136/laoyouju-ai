import Link from "next/link";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p className="footer-brand">
          {SITE_NAME} · {SITE_TAGLINE}
        </p>
        <nav aria-label="页脚导航" className="footer-nav">
          <Link href="/topics">问题场景</Link>
          <Link href="/laws">法律法规</Link>
          <Link href="/cases">权威案例</Link>
          <Link href="/about/methodology">回答方法</Link>
          <Link href="/about/sources">资料来源</Link>
          <Link href="/privacy">隐私政策</Link>
          <Link href="/terms">使用条款</Link>
          <Link href="/ai-notice">AI 内容提示</Link>
          <Link href="/ask">开始提问</Link>
        </nav>
        <p className="footer-note">
          项目尚未上线。本站内容由 AI 辅助生成，不构成法律意见，不提供诉讼代理，不承诺案件结果。
        </p>
        <p className="footer-copy">© 2026 {SITE_NAME} · 建设中</p>
      </div>
    </footer>
  );
}
