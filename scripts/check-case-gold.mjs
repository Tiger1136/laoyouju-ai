// CASE_GOLD 断言复算器：逐一检查“top5 同时含 A 级法条与主题匹配案例”，输出全部失败项（不停在首个）。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, loadContent, queryIndex } from "../packages/retrieval/dist/index.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOADED = loadContent(join(REPO_ROOT, "content"));
const index = buildIndex(LOADED.laws, LOADED.cases);
const known = new Set(LOADED.documents.map((d) => d.sourceId));

const GOLD = [
  { q: "公司违法解除劳动合同，我能要多少赔偿金", topic: "unlawful-termination-compensation" },
  { q: "单位拖欠我两个月工资没发", topic: "wage-arrears" },
  { q: "周末加班公司不给加班费", topic: "overtime-pay" },
  { q: "入职一个月了公司一直不签劳动合同", topic: "no-written-contract" },
  { q: "试用期被辞退有赔偿吗", topic: "probation-disputes" },
  { q: "单位没缴社保还让我签了竞业限制协议", topic: "social-insurance-noncompete" },
  { q: "平台骑手和公司之间算不算劳动关系", topic: "labor-relationship-recognition" },
  { q: "劳动合同到期公司不续签，有经济补偿吗", topic: "contract-performance" },
  { q: "没签合同可以主张二倍工资吗", topic: "double-wage-notice" },
  { q: "被辞退的经济补偿和赔偿金怎么区分", topic: "compensation-and-damages" },
  { q: "年休假没休完离职时能要工资吗", topic: "working-hours-leave" },
  { q: "公司一直不给我缴社保怎么办", topic: "social-insurance" },
  { q: "上班途中受伤算工伤吗", topic: "work-injury" },
  { q: "怀孕期间被公司调岗降薪合法吗", topic: "female-worker-protection" },
  { q: "竞业限制协议没约定补偿金还有效吗", topic: "noncompete-confidentiality" },
  { q: "劳务派遣工被退回能要补偿吗", topic: "labor-dispatch" },
  { q: "外卖骑手平台不给缴保险", topic: "new-employment-forms" },
  { q: "离职一年后还能申请劳动仲裁吗", topic: "arbitration-limitation" },
  { q: "劳动仲裁应该去哪里申请", topic: "arbitration-procedure" },
  { q: "公司调岗降薪我不同意怎么办", topic: "contract-performance" },
  { q: "未签书面合同被辞退能要赔偿金吗", topic: "unlawful-termination-compensation" },
  { q: "老板克扣提成奖金怎么追讨", topic: "wage-arrears" },
  { q: "每天加班到晚上十一点没有加班费", topic: "overtime-pay" },
  { q: "劳动合同到期没续签还在上班", topic: "contract-performance" },
  { q: "试用期工资能低于转正工资吗", topic: "probation-disputes" },
  { q: "社保断缴了还能补缴吗", topic: "social-insurance" },
  { q: "工伤停工留薪期工资谁付", topic: "work-injury" },
  { q: "哺乳期被安排加班合法吗", topic: "female-worker-protection" },
  { q: "保密协议和竞业限制有什么区别", topic: "noncompete-confidentiality" },
  { q: "劳务派遣单位没签合同怎么办", topic: "labor-dispatch" },
  { q: "仲裁不服可以向法院起诉吗", topic: "arbitration-procedure" },
  { q: "网约车司机与平台确认劳动关系", topic: "new-employment-forms" },
];

let fails = 0;
for (const { q, topic } of GOLD) {
  const hits = queryIndex(index, q, 5);
  const issues = [];
  if (hits.length === 0) issues.push("无结果");
  const lawHit = hits.find((h) => h.kind === "provision" && h.sourceLevel === "A");
  if (!lawHit) issues.push("top5 无 A 级法条");
  const caseHit = hits.find((h) => h.kind === "case" && h.topicIds.includes(topic));
  if (!caseHit) issues.push("top5 无主题(" + topic + ")匹配案例");
  for (const h of hits) if (!known.has(h.docId)) issues.push("非法 sourceId " + h.docId);
  if (issues.length > 0) {
    fails++;
    console.log("FAIL: " + q + " :: " + issues.join("; ") + " :: top5=" + JSON.stringify(hits.map((h) => h.kind + ":" + h.docId + ":" + (h.topicIds ?? []).join("|"))));
  }
}
console.log("TOTAL_FAILS=" + fails + "/" + GOLD.length);
