import type { MetadataRoute } from "next";
import { ASK_PATH, SITE_URL } from "@/lib/constants";

// 静态导出要求：robots 必须在构建期固定生成。
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [ASK_PATH, `${ASK_PATH}/`],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
