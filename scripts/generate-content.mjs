// 内容生成器：从已核对的官方现行文本生成 content/laws 与 content/cases 下的 JSON。
// 运行方式：node scripts/generate-content.mjs
// 注意：本脚本仅为内容入库的可复现工具；入库后的 content/*.json 才是真源。
// 所有 sourceText 均逐字取自官方现行文本（见 docs/CONTENT_REVIEW.md 的来源与核对记录）。
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTENT_ROOT = join(ROOT, "content");

const SCHEMA_VERSION = "1.0.0";
const SOURCE_CHECKED_AT = "2026-08-27";

function canonicalize(text) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000\u200b\u00a0]+/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}
function sha(text) {
  return createHash("sha256").update(canonicalize(text), "utf8").digest("hex");
}

function provisions(items) {
  return items.map(([provisionId, locator, sourceText, topicIds, keywords]) => ({
    provisionId,
    locator,
    sourceText,
    topicIds,
    keywords,
    textSha256: sha(sourceText),
  }));
}

function law(spec) {
  return {
    schemaVersion: SCHEMA_VERSION,
    contentType: "law",
    sourceId: spec.sourceId,
    title: spec.title,
    sourceType: spec.sourceType,
    issuingAuthority: spec.authority,
    documentNumber: spec.documentNumber ?? null,
    promulgationDate: spec.promulgationDate,
    effectiveDate: spec.effectiveDate,
    validityStatus: spec.validity,
    jurisdiction: "全国性",
    officialUrl: spec.officialUrl,
    sourceCheckedAt: SOURCE_CHECKED_AT,
    reviewStatus: "source_verified",
    topicIds: spec.topicIds,
    provisions: provisions(spec.provisions),
    validityNotes: spec.validityNotes ?? [],
  };
}

function ccase(spec) {
  return {
    schemaVersion: SCHEMA_VERSION,
    contentType: "case",
    sourceId: spec.sourceId,
    title: spec.title,
    sourceType: "case",
    issuingAuthority: spec.authority,
    documentNumber: null,
    officialUrl: spec.officialUrl,
    sourceCheckedAt: SOURCE_CHECKED_AT,
    reviewStatus: "source_verified",
    topicIds: spec.topicIds,
    keyIssue: spec.keyIssue,
    factsSummary: spec.factsSummary,
    decisionSummary: spec.decisionSummary,
    ruleSummary: spec.ruleSummary,
    citedSourceIds: spec.citedSourceIds,
  };
}

const docs = [];

// ---------------------------------------------------------------------------
// 1. 中华人民共和国劳动法（2018修正）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "law-laodongfa-2018",
    title: "中华人民共和国劳动法（2018修正）",
    sourceType: "law",
    authority: "全国人民代表大会常务委员会",
    documentNumber: "中华人民共和国主席令第二十八号",
    promulgationDate: "1994-07-05",
    effectiveDate: "1995-01-01",
    validity: "amended",
    officialUrl:
      "https://flk.npc.gov.cn/detail?title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%8A%B3%E5%8A%A8%E6%B3%95&id=ff8080816f135f46016f20f16ee11737",
    topicIds: [
      "overtime-pay",
      "wage-arrears",
      "unlawful-termination-compensation",
      "probation-disputes",
      "social-insurance-noncompete",
    ],
    validityNotes: [
      "1994-07-05 主席令第28号公布；2018-12-29 全国人大常委会《关于修改〈中华人民共和国劳动法〉等七部法律的决定》修正。现行文本为2018修正版本，全文现行有效。",
    ],
    provisions: [
      [
        "laodongfa-36",
        "第三十六条",
        "国家实行劳动者每日工作时间不超过八小时、平均每周工作时间不超过四十四小时的工时制度。",
        ["overtime-pay"],
        ["标准工时", "工作时间"],
      ],
      [
        "laodongfa-41",
        "第四十一条",
        "用人单位由于生产经营需要，经与工会和劳动者协商后可以延长工作时间，一般每日不得超过一小时；因特殊原因需要延长工作时间的，在保障劳动者身体健康的条件下延长工作时间每日不得超过三小时，但是每月不得超过三十六小时。",
        ["overtime-pay"],
        ["延长工作时间", "加班", "加班时间上限"],
      ],
      [
        "laodongfa-44",
        "第四十四条",
        "有下列情形之一的，用人单位应当按照下列标准支付高于劳动者正常工作时间工资的工资报酬：（一）安排劳动者延长工作时间的，支付不低于工资的百分之一百五十的工资报酬；（二）休息日安排劳动者工作又不能安排补休的，支付不低于工资的百分之二百的工资报酬；（三）法定休假日安排劳动者工作的，支付不低于工资的百分之三百的工资报酬。",
        ["overtime-pay"],
        ["加班费", "加班工资", "加班"],
      ],
      [
        "laodongfa-50",
        "第五十条",
        "工资应当以货币形式按月支付给劳动者本人。不得克扣或者无故拖欠劳动者的工资。",
        ["wage-arrears"],
        ["工资", "拖欠工资", "欠薪", "工资支付"],
      ],
      [
        "laodongfa-25",
        "第二十五条",
        "劳动者有下列情形之一的，用人单位可以解除劳动合同：（一）在试用期间被证明不符合录用条件的；（二）严重违反劳动纪律或者用人单位规章制度的；（三）严重失职，营私舞弊，对用人单位利益造成重大损害的；（四）被依法追究刑事责任的。",
        ["unlawful-termination-compensation", "probation-disputes"],
        ["试用期", "解除劳动合同", "辞退"],
      ],
      [
        "laodongfa-21",
        "第二十一条",
        "劳动合同可以约定试用期。试用期最长不得超过六个月。",
        ["probation-disputes"],
        ["试用期"],
      ],
      [
        "laodongfa-28",
        "第二十八条",
        "用人单位依据本法第二十四条、第二十六条、第二十七条的规定解除劳动合同的，应当依照国家有关规定给予经济补偿。",
        ["unlawful-termination-compensation"],
        ["经济补偿", "解除劳动合同", "补偿金"],
      ],
      [
        "laodongfa-72",
        "第七十二条",
        "社会保险基金按照保险类型确定资金来源，逐步实行社会统筹。用人单位和劳动者必须依法参加社会保险，缴纳社会保险费。",
        ["social-insurance-noncompete"],
        ["社会保险", "社保", "缴费"],
      ],
      [
        "laodongfa-91",
        "第九十一条",
        "用人单位有下列侵害劳动者合法权益情形之一的，由劳动行政部门责令支付劳动者的工资报酬、经济补偿，并可以责令支付赔偿金：（一）克扣或者无故拖欠劳动者工资的；（二）拒不支付劳动者延长工作时间工资报酬的；（三）低于当地最低工资标准支付劳动者工资的；（四）解除劳动合同后，未依照本法规定给予劳动者经济补偿的。",
        ["wage-arrears", "overtime-pay", "unlawful-termination-compensation"],
        ["赔偿金", "拖欠工资", "加班费", "经济补偿"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 2. 中华人民共和国劳动合同法（2012修正）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "law-laodonghetongfa-2012",
    title: "中华人民共和国劳动合同法（2012修正）",
    sourceType: "law",
    authority: "全国人民代表大会常务委员会",
    documentNumber: "中华人民共和国主席令第六十五号",
    promulgationDate: "2007-06-29",
    effectiveDate: "2008-01-01",
    validity: "amended",
    officialUrl:
      "https://flk.npc.gov.cn/detail?title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%8A%B3%E5%8A%A8%E5%90%88%E5%90%8C%E6%B3%95&id=2c909fdd678bf17901678bf74d7106b3",
    topicIds: [
      "no-written-contract",
      "probation-disputes",
      "unlawful-termination-compensation",
      "wage-arrears",
      "overtime-pay",
      "social-insurance-noncompete",
    ],
    validityNotes: [
      "2007-06-29 主席令第65号公布；2012-12-28 全国人大常委会《关于修改〈中华人民共和国劳动合同法〉的决定》修正，自2013-07-01施行。本章所收录的条款未被2012修正案改动，与现行文本一致。",
    ],
    provisions: [
      [
        "laodonghetongfa-10",
        "第十条",
        "建立劳动关系，应当订立书面劳动合同。已建立劳动关系，未同时订立书面劳动合同的，应当自用工之日起一个月内订立书面劳动合同。用人单位与劳动者在用工前订立劳动合同的，劳动关系自用工之日起建立。",
        ["no-written-contract"],
        ["书面劳动合同", "订立劳动合同"],
      ],
      [
        "laodonghetongfa-19",
        "第十九条",
        "劳动合同期限三个月以上不满一年的，试用期不得超过一个月；劳动合同期限一年以上不满三年的，试用期不得超过二个月；三年以上固定期限和无固定期限的劳动合同，试用期不得超过六个月。同一用人单位与同一劳动者只能约定一次试用期。以完成一定工作任务为期限的劳动合同或者劳动合同期限不满三个月的，不得约定试用期。试用期包含在劳动合同期限内。劳动合同仅约定试用期的，试用期不成立，该期限为劳动合同期限。",
        ["probation-disputes"],
        ["试用期", "试用期期限"],
      ],
      [
        "laodonghetongfa-20",
        "第二十条",
        "劳动者在试用期的工资不得低于本单位相同岗位最低档工资或者劳动合同约定工资的百分之八十，并不得低于用人单位所在地的最低工资标准。",
        ["probation-disputes"],
        ["试用期工资", "试用期"],
      ],
      [
        "laodonghetongfa-21",
        "第二十一条",
        "在试用期中，除劳动者有本法第三十九条和第四十条第一项、第二项规定的情形外，用人单位不得解除劳动合同。用人单位在试用期解除劳动合同的，应当向劳动者说明理由。",
        ["probation-disputes", "unlawful-termination-compensation"],
        ["试用期", "解除劳动合同", "违法解除"],
      ],
      [
        "laodonghetongfa-23",
        "第二十三条",
        "用人单位与劳动者可以在劳动合同中约定保守用人单位的商业秘密和与知识产权相关的保密事项。对负有保密义务的劳动者，用人单位可以在劳动合同或者保密协议中与劳动者约定竞业限制条款，并约定在解除或者终止劳动合同后，在竞业限制期限内按月给予劳动者经济补偿。劳动者违反竞业限制约定的，应当按照约定向用人单位支付违约金。",
        ["social-insurance-noncompete"],
        ["竞业限制", "竞业协议", "商业秘密"],
      ],
      [
        "laodonghetongfa-24",
        "第二十四条",
        "竞业限制的人员限于用人单位的高级管理人员、高级技术人员和其他负有保密义务的人员。竞业限制的范围、地域、期限由用人单位与劳动者约定，竞业限制的约定不得违反法律、法规的规定。在解除或者终止劳动合同后，前款规定的人员到与本单位生产或者经营同类产品、从事同类业务的有竞争关系的其他用人单位，或者自己开业生产或者经营同类产品、从事同类业务的竞业限制期限，不得超过二年。",
        ["social-insurance-noncompete"],
        ["竞业限制", "竞业期限"],
      ],
      [
        "laodonghetongfa-30",
        "第三十条",
        "用人单位应当按照劳动合同约定和国家规定，向劳动者及时足额支付劳动报酬。用人单位拖欠或者未足额支付劳动报酬的，劳动者可以依法向当地人民法院申请支付令，人民法院应当依法发出支付令。",
        ["wage-arrears"],
        ["工资", "劳动报酬", "拖欠工资", "欠薪"],
      ],
      [
        "laodonghetongfa-31",
        "第三十一条",
        "用人单位应当严格执行劳动定额标准，不得强迫或者变相强迫劳动者加班。用人单位安排加班的，应当按照国家有关规定向劳动者支付加班费。",
        ["overtime-pay"],
        ["加班", "加班费", "劳动定额"],
      ],
      [
        "laodonghetongfa-38",
        "第三十八条",
        "用人单位有下列情形之一的，劳动者可以解除劳动合同：（一）未按照劳动合同约定提供劳动保护或者劳动条件的；（二）未及时足额支付劳动报酬的；（三）未依法为劳动者缴纳社会保险费的；（四）用人单位的规章制度违反法律、法规的规定，损害劳动者权益的；（五）因本法第二十六条第一款规定的情形致使劳动合同无效的；（六）法律、行政法规规定劳动者可以解除劳动合同的其他情形。用人单位以暴力、威胁或者非法限制人身自由的手段强迫劳动者劳动的，或者用人单位违章指挥、强令冒险作业危及劳动者人身安全的，劳动者可以立即解除劳动合同，不需事先告知用人单位。",
        ["unlawful-termination-compensation", "social-insurance-noncompete"],
        ["解除劳动合同", "经济补偿", "社会保险", "社保"],
      ],
      [
        "laodonghetongfa-39",
        "第三十九条",
        "劳动者有下列情形之一的，用人单位可以解除劳动合同：（一）在试用期间被证明不符合录用条件的；（二）严重违反用人单位的规章制度的；（三）严重失职，营私舞弊，给用人单位造成重大损害的；（四）劳动者同时与其他用人单位建立劳动关系，对完成本单位的工作任务造成严重影响，或者经用人单位提出，拒不改正的；（五）因本法第二十六条第一款第一项规定的情形致使劳动合同无效的；（六）被依法追究刑事责任的。",
        ["unlawful-termination-compensation", "probation-disputes"],
        ["试用期", "解除劳动合同", "不符合录用条件"],
      ],
      [
        "laodonghetongfa-46",
        "第四十六条",
        "有下列情形之一的，用人单位应当向劳动者支付经济补偿：（一）劳动者依照本法第三十八条规定解除劳动合同的；（二）用人单位依照本法第三十六条规定向劳动者提出解除劳动合同并与劳动者协商一致解除劳动合同的；（三）用人单位依照本法第四十条规定解除劳动合同的；（四）用人单位依照本法第四十一条第一款规定解除劳动合同的；（五）除用人单位维持或者提高劳动合同约定条件续订劳动合同，劳动者不同意续订的情形外，依照本法第四十四条第一项规定终止固定期限劳动合同的；（六）依照本法第四十四条第四项、第五项规定终止劳动合同的；（七）法律、行政法规规定的其他情形。",
        ["unlawful-termination-compensation"],
        ["经济补偿", "解除劳动合同"],
      ],
      [
        "laodonghetongfa-47",
        "第四十七条",
        "经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资的标准向劳动者支付。六个月以上不满一年的，按一年计算；不满六个月的，向劳动者支付半个月工资的经济补偿。劳动者月工资高于用人单位所在直辖市、设区的市级人民政府公布的本地区上年度职工月平均工资三倍的，向其支付经济补偿的标准按职工月平均工资三倍的数额支付，向其支付经济补偿的年限最高不超过十二年。本条所称月工资是指劳动者在劳动合同解除或者终止前十二个月的平均工资。",
        ["unlawful-termination-compensation"],
        ["经济补偿", "月工资", "补偿金"],
      ],
      [
        "laodonghetongfa-48",
        "第四十八条",
        "用人单位违反本法规定解除或者终止劳动合同，劳动者要求继续履行劳动合同的，用人单位应当继续履行；劳动者不要求继续履行劳动合同或者劳动合同已经不能继续履行的，用人单位应当依照本法第八十七条规定支付赔偿金。",
        ["unlawful-termination-compensation"],
        ["违法解除", "继续履行", "赔偿金"],
      ],
      [
        "laodonghetongfa-82",
        "第八十二条",
        "用人单位自用工之日起超过一个月不满一年未与劳动者订立书面劳动合同的，应当向劳动者每月支付二倍的工资。用人单位违反本法规定不与劳动者订立无固定期限劳动合同的，自应当订立无固定期限劳动合同之日起向劳动者每月支付二倍的工资。",
        ["no-written-contract"],
        ["二倍工资", "双倍工资", "书面劳动合同"],
      ],
      [
        "laodonghetongfa-85",
        "第八十五条",
        "用人单位有下列情形之一的，由劳动行政部门责令限期支付劳动报酬、加班费或者经济补偿；劳动报酬低于当地最低工资标准的，应当支付其差额部分；逾期不支付的，责令用人单位按应付金额百分之五十以上百分之一百以下的标准向劳动者加付赔偿金：（一）未按照劳动合同的约定或者国家规定及时足额支付劳动者劳动报酬的；（二）低于当地最低工资标准支付劳动者工资的；（三）安排加班不支付加班费的；（四）解除或者终止劳动合同，未依照本法规定向劳动者支付经济补偿的。",
        ["wage-arrears", "overtime-pay"],
        ["加付赔偿金", "拖欠工资", "加班费"],
      ],
      [
        "laodonghetongfa-87",
        "第八十七条",
        "用人单位违反本法规定解除或者终止劳动合同的，应当依照本法第四十七条规定的经济补偿标准的二倍向劳动者支付赔偿金。",
        ["unlawful-termination-compensation"],
        ["违法解除", "赔偿金", "二倍"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 3. 中华人民共和国劳动合同法实施条例（国务院令第535号）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "reg-laodonghetongfa-shishitiaoli",
    title: "中华人民共和国劳动合同法实施条例",
    sourceType: "administrative_regulation",
    authority: "国务院",
    documentNumber: "国务院令第535号",
    promulgationDate: "2008-09-18",
    effectiveDate: "2008-09-18",
    validity: "effective",
    officialUrl: "https://www.gov.cn/zhengce/2008-09/19/content_2602519.htm",
    topicIds: ["no-written-contract", "probation-disputes", "unlawful-termination-compensation"],
    validityNotes: [],
    provisions: [
      [
        "shishitiaoli-5",
        "第五条",
        "自用工之日起一个月内，经用人单位书面通知后，劳动者不与用人单位订立书面劳动合同的，用人单位应当书面通知劳动者终止劳动关系，无需向劳动者支付经济补偿，但是应当依法向劳动者支付其实际工作时间的劳动报酬。",
        ["no-written-contract"],
        ["书面劳动合同", "终止劳动关系"],
      ],
      [
        "shishitiaoli-6",
        "第六条",
        "用人单位自用工之日起超过一个月不满一年未与劳动者订立书面劳动合同的，应当依照劳动合同法第八十二条的规定向劳动者每月支付两倍的工资，并与劳动者补订书面劳动合同；劳动者不与用人单位订立书面劳动合同的，用人单位应当书面通知劳动者终止劳动关系，并依照劳动合同法第四十七条的规定支付经济补偿。",
        ["no-written-contract"],
        ["两倍工资", "二倍工资", "书面劳动合同"],
      ],
      [
        "shishitiaoli-15",
        "第十五条",
        "劳动者在试用期的工资不得低于本单位相同岗位最低档工资的80%或者不得低于劳动合同约定工资的80%，并不得低于用人单位所在地的最低工资标准。",
        ["probation-disputes"],
        ["试用期工资", "试用期"],
      ],
      [
        "shishitiaoli-18",
        "第十八条",
        "有下列情形之一的，依照劳动合同法规定的条件、程序，劳动者可以与用人单位解除固定期限劳动合同、无固定期限劳动合同或者以完成一定工作任务为期限的劳动合同：（一）劳动者与用人单位协商一致的；（二）劳动者提前30日以书面形式通知用人单位的；（三）劳动者在试用期内提前3日通知用人单位的；（四）用人单位未按照劳动合同约定提供劳动保护或者劳动条件的；（五）用人单位未及时足额支付劳动报酬的；（六）用人单位未依法为劳动者缴纳社会保险费的；（七）用人单位的规章制度违反法律、法规的规定，损害劳动者权益的；（八）用人单位以欺诈、胁迫的手段或者乘人之危，使劳动者在违背真实意思的情况下订立或者变更劳动合同的；（九）用人单位在劳动合同中免除自己的法定责任、排除劳动者权利的；（十）用人单位违反法律、行政法规强制性规定的；（十一）用人单位以暴力、威胁或者非法限制人身自由的手段强迫劳动者劳动的；（十二）用人单位违章指挥、强令冒险作业危及劳动者人身安全的；（十三）法律、行政法规规定劳动者可以解除劳动合同的其他情形。",
        ["unlawful-termination-compensation", "wage-arrears"],
        ["解除劳动合同", "单方解除"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 4. 中华人民共和国劳动争议调解仲裁法
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "law-laodong-zhengyi-tiaojie-zhongcai",
    title: "中华人民共和国劳动争议调解仲裁法",
    sourceType: "law",
    authority: "全国人民代表大会常务委员会",
    documentNumber: "中华人民共和国主席令第八十号",
    promulgationDate: "2007-12-29",
    effectiveDate: "2008-05-01",
    validity: "effective",
    officialUrl:
      "https://flk.npc.gov.cn/detail?title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E5%8A%B3%E5%8A%A8%E4%BA%89%E8%AE%AE%E8%B0%83%E8%A7%A3%E4%BB%B2%E8%A3%81%E6%B3%95&id=2c909fdd678bf17901678bf64f28039d",
    topicIds: ["wage-arrears", "overtime-pay", "unlawful-termination-compensation"],
    validityNotes: [],
    provisions: [
      [
        "tiaojiezhongcai-2",
        "第二条",
        "中华人民共和国境内的用人单位与劳动者发生的下列劳动争议，适用本法：（一）因确认劳动关系发生的争议；（二）因订立、履行、变更、解除和终止劳动合同发生的争议；（三）因除名、辞退和辞职、离职发生的争议；（四）因工作时间、休息休假、社会保险、福利、培训以及劳动保护发生的争议；（五）因劳动报酬、工伤医疗费、经济补偿或者赔偿金等发生的争议；（六）法律、法规规定的其他劳动争议。",
        ["unlawful-termination-compensation", "overtime-pay", "wage-arrears", "social-insurance-noncompete"],
        ["劳动争议", "适用范围"],
      ],
      [
        "tiaojiezhongcai-6",
        "第六条",
        "发生劳动争议，当事人对自己提出的主张，有责任提供证据。与争议事项有关的证据属于用人单位掌握管理的，用人单位应当提供；用人单位不提供的，应当承担不利后果。",
        ["overtime-pay", "wage-arrears"],
        ["举证责任", "证据", "加班费"],
      ],
      [
        "tiaojiezhongcai-27",
        "第二十七条",
        "劳动争议申请仲裁的时效期间为一年。仲裁时效期间从当事人知道或者应当知道其权利被侵害之日起计算。前款规定的仲裁时效，因当事人一方向对方当事人主张权利，或者向有关部门请求权利救济，或者对方当事人同意履行义务而中断。从中断时起，仲裁时效期间重新计算。因不可抗力或者有其他正当理由，当事人不能在本条第一款规定的仲裁时效期间申请仲裁的，仲裁时效中止。从中止时效的原因消除之日起，仲裁时效期间继续计算。劳动关系存续期间因拖欠劳动报酬发生争议的，劳动者申请仲裁不受本条第一款规定的仲裁时效期间的限制；但是，劳动关系终止的，应当自劳动关系终止之日起一年内提出。",
        ["wage-arrears"],
        ["仲裁时效", "拖欠工资"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 5. 中华人民共和国社会保险法（2018修正）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "law-shehuibaoxian-2018",
    title: "中华人民共和国社会保险法（2018修正）",
    sourceType: "law",
    authority: "全国人民代表大会常务委员会",
    documentNumber: "中华人民共和国主席令第三十五号",
    promulgationDate: "2010-10-28",
    effectiveDate: "2011-07-01",
    validity: "amended",
    officialUrl:
      "https://flk.npc.gov.cn/detail?title=%E4%B8%AD%E5%8D%8E%E4%BA%BA%E6%B0%91%E5%85%B1%E5%92%8C%E5%9B%BD%E7%A4%BE%E4%BC%9A%E4%BF%9D%E9%99%A9%E6%B3%95&id=ff8080816f135f46016f210989b9179a",
    topicIds: ["social-insurance-noncompete", "wage-arrears"],
    validityNotes: [
      "2010-10-28 主席令第35号公布；2018-12-29 全国人大常委会《关于修改〈中华人民共和国社会保险法〉的决定》修正。现行文本为2018修正版本，全文现行有效。",
    ],
    provisions: [
      [
        "shehuibaoxian-58",
        "第五十八条",
        "用人单位应当自用工之日起三十日内为其职工向社会保险经办机构申请办理社会保险登记。未办理社会保险登记的，由社会保险经办机构核定其应当缴纳的社会保险费。自愿参加社会保险的无雇工的个体工商户、未在用人单位参加社会保险的非全日制从业人员以及其他灵活就业人员，应当向社会保险经办机构申请办理社会保险登记。国家建立全国统一的个人社会保障号码。个人社会保障号码为公民身份号码。",
        ["social-insurance-noncompete"],
        ["社会保险", "社保", "社保登记"],
      ],
      [
        "shehuibaoxian-60",
        "第六十条",
        "用人单位应当自行申报、按时足额缴纳社会保险费，非因不可抗力等法定事由不得缓缴、减免。职工应当缴纳的社会保险费由用人单位代扣代缴，用人单位应当按月将缴纳社会保险费的明细情况告知本人。无雇工的个体工商户、未在用人单位参加社会保险的非全日制从业人员以及其他灵活就业人员，可以直接向社会保险费征收机构缴纳社会保险费。",
        ["social-insurance-noncompete"],
        ["社会保险", "社保", "缴费"],
      ],
      [
        "shehuibaoxian-63",
        "第六十三条",
        "用人单位未按时足额缴纳社会保险费的，由社会保险费征收机构责令其限期缴纳或者补足。用人单位逾期仍未缴纳或者补足社会保险费的，社会保险费征收机构可以向银行和其他金融机构查询其存款账户；并可以申请县级以上有关行政部门作出划拨社会保险费的决定，书面通知其开户银行或者其他金融机构划拨社会保险费。用人单位账户余额少于应当缴纳的社会保险费的，社会保险费征收机构可以要求该用人单位提供担保，签订延期缴费协议。用人单位未足额缴纳社会保险费且未提供担保的，社会保险费征收机构可以申请人民法院扣押、查封、拍卖其价值相当于应当缴纳社会保险费的财产，以拍卖所得抵缴社会保险费。",
        ["social-insurance-noncompete"],
        ["社会保险", "社保", "欠缴"],
      ],
      [
        "shehuibaoxian-84",
        "第八十四条",
        "用人单位不办理社会保险登记的，由社会保险行政部门责令限期改正；逾期不改正的，对用人单位处应缴社会保险费数额一倍以上三倍以下的罚款，对其直接负责的主管人员和其他直接责任人员处五百元以上三千元以下的罚款。",
        ["social-insurance-noncompete"],
        ["社会保险", "社保", "法律责任"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 6. 最高人民法院关于审理劳动争议案件适用法律问题的解释（一）（法释〔2020〕26号）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "jie-laodong-zhengyi-1",
    title: "最高人民法院关于审理劳动争议案件适用法律问题的解释（一）",
    sourceType: "judicial_interpretation",
    authority: "最高人民法院",
    documentNumber: "法释〔2020〕26号",
    promulgationDate: "2020-12-29",
    effectiveDate: "2021-01-01",
    validity: "effective",
    officialUrl: "https://www.court.gov.cn/zixun/xiangqing/282121.html",
    topicIds: ["overtime-pay", "unlawful-termination-compensation", "wage-arrears", "social-insurance-noncompete", "no-written-contract"],
    validityNotes: [
      "最高人民法院审判委员会第1825次会议2020-12-25通过，自2021-01-01施行。注意：《解释（二）》（法释〔2025〕12号）自2025-09-01起废止本解释第三十二条第一款；本解释其余条文继续有效。",
    ],
    provisions: [
      [
        "jie1-34",
        "第三十四条",
        "劳动合同期满后，劳动者仍在原用人单位工作，原用人单位未表示异议的，视为双方同意以原条件继续履行劳动合同。一方提出终止劳动关系的，人民法院应予支持。根据劳动合同法第十四条规定，用人单位应当与劳动者签订无固定期限劳动合同而未签订的，人民法院可以视为双方之间存在无固定期限劳动合同关系，并以原劳动合同确定双方的权利义务关系。",
        ["no-written-contract", "unlawful-termination-compensation"],
        ["无固定期限劳动合同", "续订劳动合同"],
      ],
      [
        "jie1-36",
        "第三十六条",
        "当事人在劳动合同或者保密协议中约定了竞业限制，但未约定解除或者终止劳动合同后给予劳动者经济补偿，劳动者履行了竞业限制义务，要求用人单位按照劳动者在劳动合同解除或者终止前十二个月平均工资的30%按月支付经济补偿的，人民法院应予支持。前款规定的月平均工资的30%低于劳动合同履行地最低工资标准的，按照劳动合同履行地最低工资标准支付。",
        ["social-insurance-noncompete"],
        ["竞业限制", "经济补偿", "竞业协议"],
      ],
      [
        "jie1-40",
        "第四十条",
        "劳动者违反竞业限制约定，向用人单位支付违约金后，用人单位要求劳动者按照约定继续履行竞业限制义务的，人民法院应予支持。",
        ["social-insurance-noncompete"],
        ["竞业限制", "违约金"],
      ],
      [
        "jie1-42",
        "第四十二条",
        "劳动者主张加班费的，应当就加班事实的存在承担举证责任。但劳动者有证据证明用人单位掌握加班事实存在的证据，用人单位不提供的，由用人单位承担不利后果。",
        ["overtime-pay"],
        ["加班费", "举证责任", "加班"],
      ],
      [
        "jie1-44",
        "第四十四条",
        "因用人单位作出的开除、除名、辞退、解除劳动合同、减少劳动报酬、计算劳动者工作年限等决定而发生的劳动争议，用人单位负举证责任。",
        ["unlawful-termination-compensation"],
        ["解除劳动合同", "辞退", "举证责任"],
      ],
      [
        "jie1-45",
        "第四十五条",
        "用人单位有下列情形之一，迫使劳动者提出解除劳动合同的，用人单位应当支付劳动者的劳动报酬和经济补偿，并可支付赔偿金：（一）以暴力、威胁或者非法限制人身自由的手段强迫劳动的；（二）未按照劳动合同约定支付劳动报酬或者提供劳动条件的；（三）克扣或者无故拖欠劳动者工资的；（四）拒不支付劳动者延长工作时间工资报酬的；（五）低于当地最低工资标准支付劳动者工资的。",
        ["unlawful-termination-compensation", "wage-arrears", "overtime-pay"],
        ["解除劳动合同", "赔偿金", "拖欠工资", "加班费"],
      ],
      [
        "jie1-46",
        "第四十六条",
        "劳动者非因本人原因从原用人单位被安排到新用人单位工作，原用人单位未支付经济补偿，劳动者依据劳动合同法第三十八条规定与新用人单位解除劳动合同，或者新用人单位向劳动者提出解除、终止劳动合同，在计算支付经济补偿或赔偿金的工作年限时，劳动者请求把在原用人单位的工作年限合并计算为新用人单位工作年限的，人民法院应予支持。",
        ["unlawful-termination-compensation"],
        ["经济补偿", "工作年限"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 7. 最高人民法院关于审理劳动争议案件适用法律问题的解释（二）（法释〔2025〕12号）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "jie-laodong-zhengyi-2",
    title: "最高人民法院关于审理劳动争议案件适用法律问题的解释（二）",
    sourceType: "judicial_interpretation",
    authority: "最高人民法院",
    documentNumber: "法释〔2025〕12号",
    promulgationDate: "2025-07-31",
    effectiveDate: "2025-09-01",
    validity: "effective",
    officialUrl: "https://gongbao.court.gov.cn/Details/bb72019c45453f84d920bd6375573e.html",
    topicIds: ["no-written-contract", "unlawful-termination-compensation", "social-insurance-noncompete"],
    validityNotes: [
      "最高人民法院审判委员会第1942次会议2025-02-17通过，自2025-09-01施行。本解释自施行之日起废止《解释（一）》（法释〔2020〕26号）第三十二条第一款；先前司法解释与本解释不一致的，以本解释为准。",
    ],
    provisions: [
      [
        "jie2-6",
        "第六条",
        "用人单位未依法与劳动者订立书面劳动合同，应当支付劳动者的二倍工资按月计算；不满一个月的，按该月实际工作日计算。",
        ["no-written-contract"],
        ["二倍工资", "双倍工资", "书面劳动合同"],
      ],
      [
        "jie2-7",
        "第七条",
        "劳动者以用人单位未订立书面劳动合同为由，请求用人单位支付二倍工资的，人民法院依法予以支持，但用人单位举证证明存在下列情形之一的除外：（一）因不可抗力导致未订立的；（二）因劳动者本人故意或者重大过失未订立的；（三）法律、行政法规规定的其他情形。",
        ["no-written-contract"],
        ["二倍工资", "双倍工资", "书面劳动合同"],
      ],
      [
        "jie2-13",
        "第十三条",
        "劳动者未知悉、接触用人单位的商业秘密和与知识产权相关的保密事项，劳动者请求确认竞业限制条款不生效的，人民法院依法予以支持。竞业限制条款约定的竞业限制范围、地域、期限等内容与劳动者知悉、接触的商业秘密和与知识产权相关的保密事项不相适应，劳动者请求确认竞业限制条款超过合理比例部分无效的，人民法院依法予以支持。",
        ["social-insurance-noncompete"],
        ["竞业限制", "竞业协议", "商业秘密"],
      ],
      [
        "jie2-15",
        "第十五条",
        "劳动者违反有效的竞业限制约定，用人单位请求劳动者按照约定返还已经支付的经济补偿并支付违约金的，人民法院依法予以支持。",
        ["social-insurance-noncompete"],
        ["竞业限制", "违约金", "经济补偿"],
      ],
      [
        "jie2-16",
        "第十六条",
        "用人单位违法解除或者终止劳动合同后，有下列情形之一的，人民法院可以认定为劳动合同法第四十八条规定的“劳动合同已经不能继续履行”：（一）劳动合同在仲裁或者诉讼过程中期满且不存在应当依法续订、续延劳动合同情形的；（二）劳动者开始依法享受基本养老保险待遇的；（三）用人单位被宣告破产的；（四）用人单位解散的，但因合并或者分立需要解散的除外；（五）劳动者已经与其他用人单位建立劳动关系，对完成用人单位的工作任务造成严重影响，或者经用人单位提出，不与其他用人单位解除劳动合同的；（六）存在劳动合同客观不能履行的其他情形的。",
        ["unlawful-termination-compensation"],
        ["违法解除", "不能继续履行"],
      ],
      [
        "jie2-18",
        "第十八条",
        "用人单位违法解除、终止可以继续履行的劳动合同，劳动者请求用人单位支付违法解除、终止决定作出后至劳动合同继续履行前一日工资的，用人单位应当按照劳动者提供正常劳动时的工资标准向劳动者支付上述期间的工资。用人单位、劳动者对于劳动合同解除、终止都有过错的，应当各自承担相应的责任。",
        ["unlawful-termination-compensation"],
        ["违法解除", "工资", "继续履行"],
      ],
      [
        "jie2-19",
        "第十九条",
        "用人单位与劳动者约定或者劳动者向用人单位承诺无需缴纳社会保险费的，人民法院应当认定该约定或者承诺无效。用人单位未依法缴纳社会保险费，劳动者根据劳动合同法第三十八条第一款第三项规定请求解除劳动合同、由用人单位支付经济补偿的，人民法院依法予以支持。有前款规定情形，用人单位依法补缴社会保险费后，请求劳动者返还已支付的社会保险费补偿的，人民法院依法予以支持。",
        ["social-insurance-noncompete"],
        ["社会保险", "社保", "经济补偿", "违法解除"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 8. 工资支付暂行规定（劳部发〔1994〕489号）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "reg-gongzi-zhifu-zanxing",
    title: "工资支付暂行规定",
    sourceType: "administrative_regulation",
    authority: "人力资源和社会保障部",
    documentNumber: "劳部发〔1994〕489号",
    promulgationDate: "1994-12-06",
    effectiveDate: "1995-01-01",
    validity: "effective",
    officialUrl: "https://www.gov.cn/zhengce/2022-08/31/content_5711284.htm",
    topicIds: ["wage-arrears", "overtime-pay"],
    validityNotes: [
      "原劳动部1994-12-06发布（劳部发〔1994〕489号），自1995-01-01施行；劳动关系与工资支付领域仍为现行有效的全国性规章。",
    ],
    provisions: [
      [
        "gongzizhifu-7",
        "第七条",
        "工资必须在用人单位与劳动者约定的日期支付。如遇节假日或休息日，则应提前在最近的工作日支付。工资至少每月支付一次，实行周、日、小时工资制的可按周、日、小时支付工资。",
        ["wage-arrears"],
        ["工资支付", "拖欠工资", "欠薪"],
      ],
      [
        "gongzizhifu-9",
        "第九条",
        "劳动关系双方依法解除或终止劳动合同时，用人单位应在解除或终止劳动合同时一次付清劳动者工资。",
        ["wage-arrears", "unlawful-termination-compensation"],
        ["工资", "解除劳动合同", "一次性付清"],
      ],
      [
        "gongzizhifu-13",
        "第十三条",
        "用人单位在劳动者完成劳动定额或规定的工作任务后，根据实际需要安排劳动者在法定标准工作时间以外工作的，应按以下标准支付工资：（一）用人单位依法安排劳动者在日法定标准工作时间以外延长工作时间的，按照不低于劳动合同规定的劳动者本人小时工资标准的150％支付劳动者工资；（二）用人单位依法安排劳动者在休息日工作，而又不能安排补休的，按照不低于劳动合同规定的劳动者本人日或小时工资标准的200％支付劳动者工资；（三）用人单位依法安排劳动者在法定休假节日工作的，按照不低于劳动合同规定的劳动者本人日或小时工资标准的300％支付劳动者工资。实行计件工资的劳动者，在完成计件定额任务后，由用人单位安排延长工作时间的，应根据上述规定的原则，分别按照不低于其本人法定工作时间计件单价的150％、200％、300％支付其工资。经劳动行政部门批准实行综合计算工时工作制的，其综合计算工作时间超过法定标准工作时间的部分，应视为延长工作时间，并应按本规定支付劳动者延长工作时间的工资。实行不定时工时制度的劳动者，不执行上述规定。",
        ["overtime-pay"],
        ["加班费", "加班工资", "150%", "200%", "300%"],
      ],
      [
        "gongzizhifu-18",
        "第十八条",
        "各级劳动行政部门有权监察用人单位工资支付的情况。用人单位有下列侵害劳动者合法权益行为的，由劳动行政部门责令其支付劳动者工资和经济补偿，并可责令其支付赔偿金：（一）克扣或者无故拖欠劳动者工资的；（二）拒不支付劳动者延长工作时间工资的；（三）低于当地最低工资标准支付劳动者工资的。经济补偿和赔偿金的标准，按国家有关规定执行。",
        ["wage-arrears", "overtime-pay"],
        ["拖欠工资", "加班费", "赔偿金"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 9. 国务院关于职工工作时间的规定（1995修订）
// ---------------------------------------------------------------------------
docs.push(
  law({
    sourceId: "reg-guowuyuan-gongzuoshijian",
    title: "国务院关于职工工作时间的规定（1995修订）",
    sourceType: "administrative_regulation",
    authority: "国务院",
    documentNumber: "国务院令第174号",
    promulgationDate: "1995-03-25",
    effectiveDate: "1995-05-01",
    validity: "effective",
    officialUrl: "https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394935.html",
    topicIds: ["overtime-pay"],
    validityNotes: [
      "1994-02-03 国务院令第146号发布；1995-03-25《国务院关于修改〈国务院关于职工工作时间的规定〉的决定》修订，自1995-05-01施行。现行有效。",
    ],
    provisions: [
      [
        "gongzuoshijian-3",
        "第三条",
        "职工每日工作8小时、每周工作40小时。",
        ["overtime-pay"],
        ["标准工时", "工作时间", "每周40小时"],
      ],
      [
        "gongzuoshijian-6",
        "第六条",
        "任何单位和个人不得擅自延长职工工作时间。因特殊情况和紧急任务确需延长工作时间的，按照国家有关规定执行。",
        ["overtime-pay"],
        ["延长工作时间", "加班"],
      ],
      [
        "gongzuoshijian-7",
        "第七条",
        "国家机关、事业单位实行统一的工作时间，星期六和星期日为周休息日。企业和不能实行前款规定的统一工作时间的事业单位，可以根据实际情况灵活安排周休息日。",
        ["overtime-pay"],
        ["休息日", "加班", "工作时间"],
      ],
    ],
  }),
);

// ---------------------------------------------------------------------------
// 案例（含：违法解除、拖欠工资、加班费、未签书面合同、试用期、社会保险、竞业限制）
// ---------------------------------------------------------------------------

// 案例1：最高法、人社部“第二批”劳动人事争议典型案例（案例1）- 超时加班/试用期/违法解除
docs.push(
  ccase({
    sourceId: "case-batch2-1-chaoshi-jiaban-jiechu",
    title: "案例：劳动者拒绝违法超时加班安排，用人单位能否解除劳动合同（某快递公司与张某劳动人事争议案）",
    authority: "最高人民法院、人力资源社会保障部",
    officialUrl: "https://www.court.gov.cn/zixun/xiangqing/319151.html",
    topicIds: ["overtime-pay", "unlawful-termination-compensation", "probation-disputes"],
    keyIssue: "劳动者拒绝违法超时加班安排，用人单位能否以试用期不符合录用条件为由解除劳动合同。",
    factsSummary:
      "2020年6月张某入职某快递公司，试用期3个月，月工资8000元。公司规章制度规定工作时间早9时至晚9时、每周工作6天。张某以工作时间严重超过法定上限为由拒绝超时加班安排，公司即以在试用期间被证明不符合录用条件为由解除劳动合同。",
    decisionSummary:
      "仲裁委裁决某快递公司支付违法解除劳动合同赔偿金8000元（终局裁决）；并通报劳动保障监察机构责令改正、给予警告。",
    ruleSummary:
      "用人单位规章制度约定的“早9时至晚9时、每周工作6天”严重违反法律关于延长工作时间上限的规定，应认定无效；劳动者拒绝违法超时加班安排是维护自身合法权益，不能据此认定其在试用期间被证明不符合录用条件。",
    citedSourceIds: ["law-laodongfa-2018", "law-laodonghetongfa-2012", "reg-guowuyuan-gongzuoshijian"],
  }),
);

// 案例2：超时加班典型案例（案例2）- 放弃加班费协议无效
docs.push(
  ccase({
    sourceId: "case-batch2-2-fangqi-jiabanfei",
    title: "案例：劳动者与用人单位订立放弃加班费协议，能否主张加班费（某科技公司与张某劳动人事争议案）",
    authority: "最高人民法院、人力资源社会保障部",
    officialUrl: "https://www.court.gov.cn/zixun/xiangqing/319151.html",
    topicIds: ["overtime-pay"],
    keyIssue: "劳动者订立放弃加班费协议后，还能否主张加班费。",
    factsSummary:
      "2020年6月张某入职某科技公司，月工资20000元。公司要求其订立“自愿申请加入公司奋斗者计划，放弃加班费”的附件协议。半年后张某提出解除劳动合同并要求支付加班费，公司以其自愿放弃为由拒绝。",
    decisionSummary: "仲裁委裁决某科技公司支付张某2020年6月至12月加班费24000元。",
    ruleSummary:
      "约定放弃加班费的协议免除了用人单位的法定责任、排除了劳动者权利，显失公平，应认定无效；加班费是劳动者延长工作时间的工资报酬，用人单位依法负有支付义务。",
    citedSourceIds: ["law-laodongfa-2018", "law-laodonghetongfa-2012", "jie-laodong-zhengyi-1"],
  }),
);

// 案例3：超时加班典型案例（案例6）- 加班费举证责任
docs.push(
  ccase({
    sourceId: "case-batch2-6-jiabanfei-juzheng",
    title: "案例：处理加班费争议，如何分配举证责任（某教育咨询公司与林某劳动人事争议案）",
    authority: "最高人民法院、人力资源社会保障部",
    officialUrl: "https://www.court.gov.cn/zixun/xiangqing/319151.html",
    topicIds: ["overtime-pay"],
    keyIssue: "加班费争议中用人单位与劳动者之间的举证责任如何分配。",
    factsSummary:
      "2020年1月林某入职某教育咨询公司，月工资6000元，2020年7月提出解除劳动合同并主张每周工作6天，提交了实名认证打卡APP的打卡记录及工资支付记录。公司不认可证据真实性，主张每周工作5天，但未提交考勤记录、工资支付记录。",
    decisionSummary: "仲裁委裁决某教育咨询公司支付林某加班费10000元（终局裁决）。",
    ruleSummary:
      "主张加班费的劳动者应就加班事实存在提供证据，或证明相关证据由用人单位掌握管理；用人单位应当提供而不提供的，承担不利后果，可以推定劳动者加班事实存在。",
    citedSourceIds: ["law-laodong-zhengyi-tiaojie-zhongcai", "jie-laodong-zhengyi-1"],
  }),
);

// 案例4：涉欠薪典型案例（案例四）- 挂靠欠薪
docs.push(
  ccase({
    sourceId: "case-2024-qianxin-guakao",
    title: "案例：被挂靠施工单位应承担“挂靠”施工导致欠薪的清偿责任（卢某诉刘某、某建设公司等劳务合同纠纷案）",
    authority: "最高人民法院、人力资源社会保障部、中华全国总工会",
    officialUrl: "https://www.court.gov.cn/shenpan/xiangqing/423922.html",
    topicIds: ["wage-arrears"],
    keyIssue: "施工单位允许他人挂靠导致拖欠农民工工资时，清偿责任如何认定。",
    factsSummary:
      "郭某等借用某建设公司资质承揽工程，刘某以劳务公司名义分包后雇佣卢某从事砌墙劳务，并出具8120元工资欠条。刘某支付3000元、某建设公司支付1012元，尚欠4108元。",
    decisionSummary: "法院判令刘某、某建设公司支付卢某欠付工资4108元；建设单位某置业公司已足额支付工程款，不承担清偿责任。",
    ruleSummary:
      "施工单位允许其他单位和个人以施工单位名义对外承揽建设工程，导致拖欠农民工工资的，由施工单位清偿；承包劳务的个人承担直接支付责任，承包人个人与被挂靠施工单位共同承担清偿责任。",
    citedSourceIds: ["law-laodongfa-2018", "law-laodonghetongfa-2012"],
  }),
);

// 案例5：涉欠薪典型案例（案例五）- 工资支付方式变更
docs.push(
  ccase({
    sourceId: "case-2024-qianxin-zhifufangshi",
    title: "案例：用人单位变更工资支付方式应与劳动者协商一致（杨某诉某培训中心劳动争议案）",
    authority: "最高人民法院、人力资源社会保障部、中华全国总工会",
    officialUrl: "https://www.court.gov.cn/shenpan/xiangqing/423922.html",
    topicIds: ["wage-arrears"],
    keyIssue: "用人单位单方变更工资支付方式致劳动者实得工资减少，是否应补足差额。",
    factsSummary:
      "某培训中心原通过银行转账、微信、支付宝等向杨某发放工资，后改通过某购物平台支付，杨某只能按比例提取部分工资，实得工资低于应得工资，且杨某已多次表示不同意。",
    decisionSummary: "法院判令某培训中心补足杨某的工资差额。",
    ruleSummary:
      "用人单位负有向劳动者及时足额支付劳动报酬的法定义务；变更工资支付方式应与劳动者协商一致，且不得违反强制性法律规定；因用人单位原因导致劳动者收入减少的，应支付欠付工资。",
    citedSourceIds: ["law-laodongfa-2018", "law-laodonghetongfa-2012"],
  }),
);

// 案例6：涉欠薪典型案例（案例六）- 试用期不符合录用条件解除 + 线上加班费
docs.push(
  ccase({
    sourceId: "case-2024-qianxin-shiyongqi",
    title: "案例：线上加班费应结合加班频率、时长、工资标准、工作内容等因素认定（李某诉某文化传媒公司劳动争议案）",
    authority: "最高人民法院、人力资源社会保障部、中华全国总工会",
    officialUrl: "https://www.court.gov.cn/shenpan/xiangqing/423922.html",
    topicIds: ["overtime-pay", "probation-disputes"],
    keyIssue: "线上加班费认定及试用期解除争议中的加班费计算。",
    factsSummary:
      "2020年4月李某入职某文化传媒公司任短视频运营总监，约定3个月试用期、试用期月工资2万元。任职期间李某在非工作时间回复设计方案、方案改进等。2020年5月28日公司以李某试用期不符合录用条件为由解除劳动关系，未支付加班费。",
    decisionSummary:
      "法院综合岗位情况、业务特点及报酬标准，酌情确定某文化传媒公司支付延时加班费1万元，并支付休息日加班工资5517.24元。",
    ruleSummary:
      "线上加班发生在非工作时间、非工作地点，认定加班费时应以劳动者提供的劳动占用休息时间为标准，综合考虑加班频率、时长、工资标准、工作内容等因素酌情认定。",
    citedSourceIds: ["law-laodongfa-2018", "law-laodonghetongfa-2012"],
  }),
);

// 案例7：解释（二）典型案例（案例三）- 故意不订立书面劳动合同
docs.push(
  ccase({
    sourceId: "case-jie2-3-guyi-buqian-heton",
    title: "案例：劳动者故意不订立书面劳动合同，用人单位不负有支付二倍工资的责任（冉某与某宾馆、某农旅公司劳动争议案）",
    authority: "最高人民法院",
    officialUrl: "https://www.court.gov.cn/zixun/xiangqing/472681.html",
    topicIds: ["no-written-contract", "wage-arrears"],
    keyIssue: "劳动者故意不订立书面劳动合同的情况下，用人单位是否需支付二倍工资。",
    factsSummary:
      "2018年12月冉某与某康旅公司订立固定期限劳动合同至2023年12月。合同到期后公司多次口头及微信通知续订，冉某以“公司要解散，不签合同可以拿二倍工资”为由拒绝续订。2024年公司注销、由某宾馆承继权利义务。",
    decisionSummary: "法院认定冉某故意不订立书面劳动合同，某康旅公司无需承担支付二倍工资的责任，判决驳回冉某有关二倍工资等诉讼请求。",
    ruleSummary:
      "劳动合同法第八十二条的二倍工资规则是督促用人单位履行法定义务、维护劳动者权益的制度，不应使不诚信者不当获利；劳动者故意不与用人单位订立书面劳动合同的，不适用该二倍工资规则。",
    citedSourceIds: ["law-laodonghetongfa-2012", "jie-laodong-zhengyi-2"],
  }),
);

// 案例8：解释（二）典型案例（案例五）- 在职竞业限制违约责任
docs.push(
  ccase({
    sourceId: "case-jie2-5-zaizhi-jingye",
    title: "案例：劳动者违反在职竞业限制义务约定，应依法承担违约责任（黄某与某纺织公司竞业限制纠纷案）",
    authority: "最高人民法院",
    officialUrl: "https://www.court.gov.cn/zixun/xiangqing/472681.html",
    topicIds: ["social-insurance-noncompete"],
    keyIssue: "劳动者违反在职期间竞业限制义务约定，是否应承担违约责任。",
    factsSummary:
      "2020年11月黄某与某纺织公司订立劳动合同任销售经理，2022年6月订立《保守商业秘密及竞业限制协议》，约定合同期内及离职后两年不得自营或为他人经营竞争业务。2022年9月至10月黄某多次自行联系供货商向公司客户出售布匹，货款归己。",
    decisionSummary: "法院判决黄某依法向某纺织公司承担违反竞业限制义务的违约责任。",
    ruleSummary:
      "竞业限制人员自营或为他人经营与用人单位有竞争关系的业务，会对用人单位造成较大损害；用人单位依法与竞业限制人员约定在职期间竞业限制义务的，劳动者应依约履行，违反的应承担违约责任。",
    citedSourceIds: ["law-laodonghetongfa-2012", "jie-laodong-zhengyi-2"],
  }),
);

// 案例9：解释（二）典型案例（案例六）- 不缴纳社保约定无效
docs.push(
  ccase({
    sourceId: "case-jie2-6-bujiao-shebao",
    title: "案例：有关不缴纳社会保险费的约定无效，劳动者以此为由解除劳动合同时有权请求用人单位支付经济补偿（朱某与某保安公司劳动争议案）",
    authority: "最高人民法院",
    officialUrl: "https://www.court.gov.cn/zixun/xiangqing/472681.html",
    topicIds: ["social-insurance-noncompete", "unlawful-termination-compensation"],
    keyIssue: "用人单位与劳动者约定不缴纳社会保险费是否有效；劳动者据此解除劳动合同能否主张经济补偿。",
    factsSummary:
      "2022年7月朱某入职某保安公司，双方约定公司不缴纳社会保险费，而是以补助形式直接发放。此后公司未为朱某缴纳社保。朱某认为该约定无效，据此解除劳动合同并请求支付经济补偿。",
    decisionSummary: "法院认定有关不缴纳社保费的约定无效，判决某保安公司支付朱某解除劳动合同的经济补偿。",
    ruleSummary:
      "缴纳社会保险费是用人单位和劳动者的法定义务，除法律规定外不因双方约定而免除；双方有关不缴纳社会保险费的约定无效，用人单位未依法缴纳社保费，劳动者据此解除劳动合同的，用人单位应支付经济补偿。",
    citedSourceIds: ["law-shehuibaoxian-2018", "law-laodonghetongfa-2012", "jie-laodong-zhengyi-2"],
  }),
);

// ---------------------------------------------------------------------------
// 写入文件
// ---------------------------------------------------------------------------
for (const doc of docs) {
  const dir = doc.contentType === "law" ? "laws" : "cases";
  const file = join(CONTENT_ROOT, dir, `${doc.sourceId}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(`wrote ${doc.sourceId} (${doc.contentType}) -> ${file}`);
}
console.log(`total sources: ${docs.length}`);
