import Link from "next/link";
import { NAV_LINKS, SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span className="brand-name">{SITE_NAME}</span>
          <span className="brand-tagline">{SITE_TAGLINE}</span>
        </Link>
        <div className="header-right">
          <nav aria-label="主导航" className="site-nav">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="nav-link">
                {link.label}
              </Link>
            ))}
          </nav>
          <Link href="/ask" className="nav-cta">
            开始提问
          </Link>
        </div>
      </div>
    </header>
  );
}
