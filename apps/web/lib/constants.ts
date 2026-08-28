import { TOPIC_IDS, TOPIC_LABELS, type TopicId } from "@laoyouju/shared";

export const SITE_NAME = "劳有据 AI";
export const SITE_TAGLINE = "劳动问题，回答有依据";
export const SITE_POSITIONING = "劳动争议法律信息检索与行动辅助工具";

/** 公开变量：构建期用于 SEO metadata（metadataBase / sitemap / robots）。不是密钥。 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export const NAV_LINKS = [
  { href: "/", label: "首页" },
  { href: "/topics", label: "问题场景" },
  { href: "/laws", label: "法律法规" },
  { href: "/cases", label: "权威案例" },
  { href: "/about/methodology", label: "回答方法" },
  { href: "/about/sources", label: "资料来源" },
] as const;

export type Topic = {
  id: TopicId;
  title: string;
  description: string;
};

/** 各话题的中文说明（仅描述覆盖范围，不构成法律结论）。标题/ID 以 @laoyouju/shared 为单一来源。 */
const TOPIC_DESCRIPTIONS: Readonly<Record<TopicId, string>> = {
  "unlawful-termination-compensation": "围绕劳动合同违法解除、经济补偿与赔偿金的常见疑问与资料指引。",
  "wage-arrears": "围绕工资支付、拖欠工资与欠薪追讨的常见疑问与资料指引。",
  "overtime-pay": "围绕加班认定、加班费计算与超时加班的常见疑问与资料指引。",
  "no-written-contract": "围绕未订立书面劳动合同情形的常见疑问与资料指引。",
  "probation-disputes": "围绕试用期约定、试用期工资与试用期解除的常见疑问与资料指引。",
  "social-insurance-noncompete": "围绕社会保险缴纳与竞业限制的常见疑问与资料指引（两项分别收录）。",
  "labor-relationship-recognition": "围绕劳动关系认定（是否构成劳动关系、事实劳动关系等）的常见疑问与资料指引。",
  "contract-performance": "围绕劳动合同订立、履行、变更、解除与终止的常见疑问与资料指引。",
  "double-wage-notice": "围绕未签书面劳动合同二倍工资的常见疑问与资料指引。",
  "compensation-and-damages": "围绕经济补偿与违法解除赔偿金计算与区分的常见疑问与资料指引。",
  "working-hours-leave": "围绕工作时间、休息休假与年休假的常见疑问与资料指引。",
  "social-insurance": "围绕社会保险参保、缴费与断缴补缴的常见疑问与资料指引。",
  "work-injury": "围绕工伤认定、工伤待遇与职业病保障的常见疑问与资料指引。",
  "female-worker-protection": "围绕女职工及孕期、产期、哺乳期（三期）保护的常见疑问与资料指引。",
  "noncompete-confidentiality": "围绕竞业限制与保密义务的常见疑问与资料指引。",
  "labor-dispatch": "围绕劳务派遣用工关系的常见疑问与资料指引。",
  "new-employment-forms": "围绕平台用工、网约配送员、网络主播等新就业形态的常见疑问与资料指引。",
  "arbitration-limitation": "围绕劳动仲裁时效的常见疑问与资料指引。",
  "arbitration-procedure": "围绕仲裁管辖、庭审、证据与裁诉衔接的常见疑问与资料指引。",
};

/** 全部问题场景。仅描述覆盖范围，不构成法律结论。 */
export const TOPICS: readonly Topic[] = TOPIC_IDS.map((id) => ({
  id,
  title: TOPIC_LABELS[id],
  description: TOPIC_DESCRIPTIONS[id],
}));

/** 允许搜索引擎收录的公开路径（不含 /ask）。 */
export const PUBLIC_PATHS: readonly string[] = [
  "/",
  "/topics",
  "/laws",
  "/cases",
  "/about/methodology",
  "/about/sources",
  "/privacy",
  "/terms",
  "/ai-notice",
];

export const ASK_PATH = "/ask";