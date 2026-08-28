// Source Registry 构建脚本（Phase 7A）。
// 从 content/laws/*.json 与 content/cases/*.json 汇总为 content/sources/registry.json，
// 并纳入“已废止/被替代”档案条目（loaded=false）与 C/D 级研究线索条目（不得作为法律依据）。
// 运行：node scripts/import-registry.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_DIR = join(REPO, "content", "sources");
const GENERATED_AT = "2026-08-27";

/** 被替代的旧司法解释（档案记录；不得作为现行依据）。依据：法释〔2020〕26号 废止目录。 */
const SUPERSEDED_ARCHIVE = [
  { sourceId: "jie-laodong-zhengyi-2001", title: "最高人民法院关于审理劳动争议案件适用法律若干问题的解释（2001）", documentNumber: "法释〔2001〕14号", repealedBy: "jie-laodong-zhengyi-1", note: "已被《最高人民法院关于审理劳动争议案件适用法律问题的解释（一）》（法释〔2020〕26号）合并废止；仅供效力追溯档案，不作为现行依据。" },
  { sourceId: "jie-laodong-zhengyi-2-2006", title: "最高人民法院关于审理劳动争议案件适用法律若干问题的解释（二）（2006）", documentNumber: "法释〔2006〕6号", repealedBy: "jie-laodong-zhengyi-1", note: "已被法释〔2020〕26号 合并废止；仅供效力追溯档案，不作为现行依据。" },
  { sourceId: "jie-laodong-zhengyi-3-2010", title: "最高人民法院关于审理劳动争议案件适用法律若干问题的解释（三）（2010）", documentNumber: "法释〔2010〕12号", repealedBy: "jie-laodong-zhengyi-1", note: "已被法释〔2020〕26号 合并废止；仅供效力追溯档案，不作为现行依据。" },
  { sourceId: "jie-laodong-zhengyi-4-2013", title: "最高人民法院关于审理劳动争议案件适用法律若干问题的解释（四）（2013）", documentNumber: "法释〔2013〕24号", repealedBy: "jie-laodong-zhengyi-1", note: "已被法释〔2020〕26号 合并废止；仅供效力追溯档案，不作为现行依据。" },
  // 现行规范对应的被修订/被替代旧版本（档案记录；不得作为现行依据；依据各自官方修订/废止决定）。
  { sourceId: "reg-gongshangbaoxian-tiaoli-2003", title: "工伤保险条例（2003年 国务院令第375号）", documentNumber: "国务院令第375号", repealedBy: "reg-gongshangbaoxian-tiaoli", note: "2003-04-27 公布；已被 2010年12月20日 国务院令第586号 修订后的《工伤保险条例》替代；仅效力追溯档案。" },
  { sourceId: "reg-nvzhigong-tebieguiding-1988", title: "女职工劳动保护规定（1988年）", documentNumber: "国务院令第9号", repealedBy: "reg-nvzhigong-tebieguiding", note: "1988-07-21 发布；已被《女职工劳动保护特别规定》（国务院令第619号）废止；仅效力追溯档案。" },
  { sourceId: "reg-quanguonianjie-fangjia-2013", title: "全国年节及纪念日放假办法（2013年修订，国务院令第644号）", documentNumber: "国务院令第644号", repealedBy: "reg-quanguonianjie-fangjia", note: "2013修订版；已被《全国年节及纪念日放假办法》（2024修订，国务院令第795号）替代；仅效力追溯档案。" },
  { sourceId: "reg-guowuyuan-gongzuoshijian-1994", title: "国务院关于职工工作时间的规定（1994年，国务院令第146号）", documentNumber: "国务院令第146号", repealedBy: "reg-guowuyuan-gongzuoshijian", note: "1994-02-03 发布；1995-03-25 被国务院令第174号修订（现行版本）；仅效力追溯档案。" },
  { sourceId: "rule-laodongrenshi-zhongcai-banankuigu-2009", title: "劳动人事争议仲裁办案规则（2009年，人社部令第2号）", documentNumber: "人社部令第2号", repealedBy: "rule-laodongrenshi-zhongcai-banankuigu", note: "2009-01-01 施行；已被人社部令第33号《劳动人事争议仲裁办案规则》（2017）替代；仅效力追溯档案。" },
  { sourceId: "rule-zhongcai-zuzhiguize-2010", title: "劳动人事争议仲裁组织规则（2010年，人社部令第5号）", documentNumber: "人社部令第5号", repealedBy: "rule-zhongcai-zuzhiguize", note: "2010-01-20 施行；已被人社部令第34号《劳动人事争议仲裁组织规则》（2017）替代；仅效力追溯档案。" },
  { sourceId: "rule-zuidigongzi-1993", title: "企业最低工资规定（1993年，劳动部劳部发〔1993〕333号）", documentNumber: "劳部发〔1993〕333号", repealedBy: "rule-zuidigongzi", note: "1993-11-24 发布；已被《最低工资规定》（劳动和社会保障部令第21号）替代；仅效力追溯档案。" },
  { sourceId: "rule-gongshang-rending-banfa-2003", title: "工伤认定办法（2003年，劳动和社会保障部令第17号）", documentNumber: "劳动和社会保障部令第17号", repealedBy: "rule-gongshang-rending-banfa", note: "2003-09-23 发布；已被人社部令第8号《工伤认定办法》（2010）替代；仅效力追溯档案。" },
  { sourceId: "rule-feifa-yonggong-peichang-2003", title: "非法用工单位伤亡人员一次性赔偿办法（2003年，劳动和社会保障部令第19号）", documentNumber: "劳动和社会保障部令第19号", repealedBy: "rule-feifa-yonggong-peichang", note: "2003-09-23 发布；已被人社部令第9号（2010）替代；仅效力追溯档案。" },
  { sourceId: "rule-gongzi-zhesuan-2008", title: "关于职工全年月平均工作时间和工资折算问题的通知（劳社部发〔2008〕3号）", documentNumber: "劳社部发〔2008〕3号", repealedBy: "rule-gongzi-zhesuan-2022", note: "2008-01-03 发布；已被人社部发〔2025〕2号《关于职工全年月平均工作时间和工资折算问题的通知》废止（原文明确“同时废止”）；仅效力追溯档案。" },
];

/** D 级研究线索（仅选题/检索线索；本阶段不得作为法律依据写入回答）。 */
const RESEARCH_HINTS = [
  { sourceId: "d-hint-new-employment-forms-2024", title: "（线索）2024年新就业形态劳动者权益保障相关社会讨论文章", note: "D级·仅作为选题或联网检索线索；未核验、不得作为法律依据写入回答。" },
  { sourceId: "d-hint-wage-arrears-labor-law-2025", title: "（线索）2025年讨薪维权类社会内容（公众号/短视频）", note: "D级·仅作为选题或联网检索线索；未核验、不得作为法律依据写入回答。" },
];

/** 读取全部 law/case 文档，构造 registry 记录。 */
function loadDocs(dir, contentType) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (doc.contentType !== contentType) continue;
    out.push(doc);
  }
  return out;
}

function main() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
  const laws = loadDocs(join(REPO, "content", "laws"), "law");
  const cases = loadDocs(join(REPO, "content", "cases"), "case");
  const sources = [];
  for (const law of laws) {
    sources.push({
      sourceId: law.sourceId,
      title: law.title,
      contentType: "law",
      sourceType: law.sourceType,
      authorityLevel: "A",
      issuingAuthority: law.issuingAuthority,
      documentNumber: law.documentNumber,
      jurisdiction: law.jurisdiction,
      officialUrl: law.officialUrl,
      promulgationDate: law.promulgationDate,
      effectiveDate: law.effectiveDate,
      expiryDate: law.expiryDate,
      validityStatus: law.validityStatus,
      supersedes: law.supersedes,
      supersededBy: law.supersededBy,
      retrievedAt: law.retrievedAt,
      contentHash: law.contentHash,
      verificationStatus: law.verificationStatus,
      reviewStatus: law.reviewStatus,
      loaded: true,
      note: null,
    });
  }
  for (const c of cases) {
    sources.push({
      sourceId: c.sourceId,
      title: c.title,
      contentType: "case",
      sourceType: "case",
      authorityLevel: "B",
      issuingAuthority: c.publishingAuthority,
      documentNumber: c.documentNumber,
      jurisdiction: c.jurisdiction,
      officialUrl: c.officialUrl,
      promulgationDate: c.publicationDate,
      effectiveDate: null,
      expiryDate: null,
      validityStatus: null,
      supersedes: [],
      supersededBy: [],
      retrievedAt: c.retrievedAt,
      contentHash: null,
      verificationStatus: c.verificationStatus,
      reviewStatus: c.reviewStatus,
      loaded: true,
      note: null,
    });
  }
  // 被替代档案
  for (const arch of SUPERSEDED_ARCHIVE) {
    sources.push({
      sourceId: arch.sourceId,
      title: arch.title,
      contentType: "law",
      sourceType: "judicial_interpretation",
      authorityLevel: "A",
      issuingAuthority: "最高人民法院",
      documentNumber: arch.documentNumber,
      jurisdiction: "全国性",
      officialUrl: null,
      promulgationDate: null,
      effectiveDate: null,
      expiryDate: null,
      validityStatus: "repealed",
      supersedes: [],
      supersededBy: [arch.repealedBy],
      retrievedAt: GENERATED_AT,
      contentHash: null,
      verificationStatus: "official_source_verified",
      reviewStatus: "source_verified",
      loaded: false,
      note: arch.note,
    });
  }
  for (const hint of RESEARCH_HINTS) {
    sources.push({
      sourceId: hint.sourceId,
      title: hint.title,
      contentType: "research_hint",
      sourceType: null,
      authorityLevel: "D",
      issuingAuthority: null,
      documentNumber: null,
      jurisdiction: null,
      officialUrl: null,
      promulgationDate: null,
      effectiveDate: null,
      expiryDate: null,
      validityStatus: null,
      supersedes: [],
      supersededBy: [],
      retrievedAt: GENERATED_AT,
      contentHash: null,
      verificationStatus: "unverified",
      reviewStatus: "draft",
      loaded: false,
      note: hint.note,
    });
  }

  const registry = {
    schemaVersion: "2.0.0",
    registryVersion: 1,
    generatedAt: GENERATED_AT,
    sources,
  };
  writeFileSync(join(OUT_DIR, "registry.json"), JSON.stringify(registry, null, 2) + "\n", "utf8");
  console.log("[import-registry] laws=", laws.length, "cases=", cases.length, "archives=", SUPERSEDED_ARCHIVE.length, "hints=", RESEARCH_HINTS.length, "total=", sources.length);
}

main();