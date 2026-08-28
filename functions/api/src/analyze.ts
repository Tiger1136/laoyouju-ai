/**
 * 问题分析（确定性）：范围归类、事实提取、争议焦点拆分、注入识别。
 * 全部使用确定性规则（正则/词表），不调用模型，保证可测试、可复现。
 */

import { canonicalize } from "@laoyouju/retrieval";
import { TOPIC_LABELS, type TopicId } from "@laoyouju/shared";

// ---------------------------------------------------------------------------
// 范围归类
// ---------------------------------------------------------------------------

/** 问候/身份类（无任何劳动信号时判定为 out_of_scope；有强劳动信号时以劳动信号优先）。 */
const GREETING_PATTERNS: readonly string[] = [
  "你是谁", "你叫什么", "你是什么", "自我介绍", "你好", "您好", "大家好", "谢谢", "谢谢你", "再见", "拜拜",
  "在吗", "hello", "hi", "嗨", "打个招呼", "聊聊天", "随便聊聊", "你会什么", "你能干什么", "你有什么用", "你会做什么",
];

/** 强劳动争议信号（法律语汇；命中任意一条即视为劳动争议领域）。 */
const LABOR_STRONG_PATTERNS: readonly string[] = [
  "劳动", "劳资", "用工", "雇佣", "劳务关系", "劳动关系",
  "劳动合同", "合同到期", "无固定期限", "续签", "合同变更", "调岗", "降薪", "调薪", "转岗",
  "工资", "月薪", "底薪", "提成", "奖金", "年终奖", "绩效", "工资条", "欠薪", "拖欠", "克扣", "讨薪", "发薪", "薪酬",
  "加班", "加班费", "加班工资", "超时", "休息日", "节假日", "年假", "年休假", "带薪休假", "调休", "补休", "双休", "单休", "工时", "倒班", "白班", "夜班", "休息休假",
  "辞退", "开除", "解雇", "解聘", "离职", "辞职", "裁员", "解除劳动合同", "解除劳动关系", "赔偿金", "经济补偿", "补偿金", "N+1", "2N",
  "试用期", "转正", "实习期", "见习期",
  "社保", "五险", "五险一金", "社保缴纳", "社会保险", "公积金", "断缴", "补缴",
  "工伤", "工亡", "职业病", "职业病防治", "工伤认定", "伤残", "劳动能力鉴定",
  "产假", "哺乳", "孕期", "妊娠", "三期", "女职工", "婚假", "丧假", "陪产假",
  "竞业", "保密协议", "竞业限制", "竞业禁止", "商业秘密",
  "劳务派遣", "派遣", "外包", "外包用工", "临时工", "小时工", "兼职", "非全日制", "平台用工", "灵活用工", "新就业形态", "网约车", "外卖员", "骑手", "主播", "带货",
  "仲裁", "劳动仲裁", "仲裁委", "仲裁时效", "劳动监察", "12333", "劳动局", "仲裁申请书", "劳动纠纷", "劳动争议", "劳动诉讼", "裁诉",
  "工龄", "入职", "在职", "离职证明", "档案", "社保卡", "社保基数",
  "带薪", "病假", "医疗期", "探亲假", "拖欠农民工工资", "农民工", "建筑工人", "包工头", "欠薪保障",
  "用人单位", "雇主", "hr", "HR", "人力资源部", "劳动权益",
];

/** 弱劳动语境词（公司/老板/单位/怎么办等：不能单独作为领域证据，需与强信号或语境匹配）。 */
const LABOR_WEAK_PATTERNS: readonly string[] = [
  "公司", "老板", "单位", "怎么办", "怎么处理", "怎么弄", "咋办", "违法", "合法", "不给", "不让",
  "拒绝支付", "拒绝", "起诉", "投诉", "维权", "赔偿", "怎么赔", "该不该", "我该",
];

/** 明确的非劳动争议信号（命中任意一条即倾向 out_of_scope，除非命中更强劳动信号）。 */
const OUT_OF_SCOPE_PATTERNS: readonly string[] = [
  "做饭", "做菜", "菜谱", "红烧肉", "炒菜", "炖汤", "煮饭", "吃什么", "食谱", "烘焙", "蛋糕", "烧烤", "啤酒", "咖啡", "奶茶", "外卖红包", "优惠券", "双十一", "淘宝", "拼多多", "京东", "运费",
  "天气", "下雨", "气温", "台风", "天气预报", "空气质量",
  "股票", "基金", "股市", "涨跌", "K线", "A股", "牛市", "熊市", "炒股", "理财", "比特币", "虚拟货币", "彩票", "中奖",
  "游戏", "王者荣耀", "英雄联盟", "原神", "吃鸡", "电竞", "足球", "篮球", "世界杯", "CBA", "NBA",
  "明星", "八卦", "娱乐圈", "追星", "电影", "电视剧", "演唱会", "综艺", "歌曲", "音乐", "歌词", "唱歌",
  "小说", "诗歌", "作文", "写诗", "写小说", "文案", "论文", "开题", "查重", "翻译", "英语", "日语", "法语", "数学题", "物理题", "化学", "历史", "地理",
  "装修", "家电", "修电脑", "修手机", "路由器", "电脑蓝屏", "装系统", "宽带",
  "旅游", "景点", "机票", "酒店", "民宿", "美食街",
  "减肥", "健身", "跑步", "游泳", "瑜伽", "穿衣", "化妆", "护肤", "美甲",
  "宠物", "养猫", "养狗", "养鱼", "仓鼠",
  "钓鱼", "麻将", "象棋", "桥牌",
  "驾照", "违章", "扣分", "交通事故", "追尾", "酒驾", "醉驾", "打人", "打架", "人身损害",
  "买房", "卖房", "房贷", "房租", "物业费",
  "贷款", "信用卡", "花呗", "借呗", "网贷", "征信", "逾期", "催收", "民间借贷",
  "离婚", "彩礼", "继承", "遗产", "抚养", "赡养", "家暴", "感情", "恋爱", "分手", "相亲", "婚姻",
  "诈骗", "盗窃", "抢劫", "赌博", "贩毒", "刑事案件", "判刑", "坐牢",
  "写代码", "编程", "前端", "后端", "数据库", "Excel", "Word", "PPT", "剪映",
  "高考", "考研", "考公", "公务员考试", "教师资格考试", "四六级", "托福", "雅思",
  "车险", "商业保险", "保险理赔",
  "养生", "按摩", "拔罐", "针灸", "感冒", "发烧", "咳嗽", "牙疼", "近视",
  "朝代", "皇帝", "历史事件", "宇宙", "黑洞", "外星人", "科幻", "算命", "星座", "风水",
  "疫苗", "挂号", "医院", "药方", "看病",
  "买手机", "买电脑", "买衣服", "购物", "砍价", "拼单",
  "开公司", "注册公司", "创业", "营业执照", "工商登记", "公司注册",
];

/** 注入/对抗性提问信号（命中则标记 injected；不影响领域归类）。 */
const INJECTION_PATTERNS: readonly string[] = [
  "忽略以上", "忽略之前", "忽略前面", "忽略上述", "忽略前述", "忽略指令", "忽略规则", "忽略设定", "忽略限制",
  "系统提示词", "初始设定", "系统指令", "你的设定", "你现在是", "扮演", "假装你是", "不受限制",
  "重复你刚才", "复述上文", "忘记上面", "不按检索", "不要依据", "不需要依据", "不用管资料",
  "ignore previous", "system prompt", "jailbreak", "DAN mode", "developer message",
  "编造", "伪造", "虚构", "编一条", "捏造", "杜撰", "瞎编", "给我编", "假法条", "不存在的",
  "法外之法",
];

export interface ScopeAnalysis {
  /** 领域：labor=劳动争议；out_of_scope=明确非劳动争议或无劳动信号的普通问题。 */
  scope: "labor" | "out_of_scope";
  injected: boolean;
  /** 命中的领域信号（审计用）。 */
  laborSignals: string[];
  outOfScopeSignals: string[];
  injectionSignals: string[];
}

function hitPatterns(text: string, patterns: readonly string[], out: string[]): boolean {
  for (const p of patterns) {
    if (text.includes(p)) {
      out.push(p);
      return true;
    }
  }
  return false;
}

/**
 * 领域归类（确定性；先强信号后弱信号）：
 * 1. 强劳动信号（工资/社保/工伤/加班/辞退/劳动合同/仲裁…）→ labor（即使同时出现非劳动词，如“上班途中交通事故算工伤吗”）；
 * 2. 强非劳动信号（做饭/天气/股票/写诗/开公司/无劳动语境的交通事故…）→ out_of_scope；
 * 3. 仅为弱语境词（公司/老板/单位/怎么办/赔偿…）→ labor（语境词不单独作为领域证据，但也不误拒生活化表述）；
 * 4. 问候/身份类 → out_of_scope；
 * 5. 无任何信号 → out_of_scope（没有劳动信号的普通生活问题不进入劳动引擎，避免“公司”一词就误判）。
 */
export function classifyScope(question: string): ScopeAnalysis {
  const text = canonicalize(question);
  const laborSignals: string[] = [];
  const outOfScopeSignals: string[] = [];
  const injectionSignals: string[] = [];
  hitPatterns(text, INJECTION_PATTERNS, injectionSignals);
  let scope: ScopeAnalysis["scope"];
  if (hitPatterns(text, LABOR_STRONG_PATTERNS, laborSignals)) {
    scope = "labor";
  } else if (hitPatterns(text, OUT_OF_SCOPE_PATTERNS, outOfScopeSignals)) {
    scope = "out_of_scope";
  } else if (hitPatterns(text, LABOR_WEAK_PATTERNS, laborSignals)) {
    scope = "labor";
  } else if (hitPatterns(text, GREETING_PATTERNS, outOfScopeSignals)) {
    scope = "out_of_scope";
  } else {
    scope = "out_of_scope";
  }
  return {
    scope,
    injected: injectionSignals.length > 0,
    laborSignals,
    outOfScopeSignals,
    injectionSignals,
  };
}


// ---------------------------------------------------------------------------
// 事实提取（确定性）
// ---------------------------------------------------------------------------

/** 省级行政区（用于地点事实与“地方规则适用”提示；不含县级粒度）。 */
const PROVINCES: readonly string[] = [
  "北京", "上海", "天津", "重庆", "深圳", "广州", "杭州", "南京", "苏州", "成都", "武汉", "西安", "郑州", "长沙", "合肥", "福州", "厦门", "济南", "青岛", "沈阳", "大连", "哈尔滨", "长春", "石家庄", "太原", "南昌", "昆明", "贵阳", "南宁", "乌鲁木齐", "兰州", "西宁", "银川", "海口", "呼和浩特", "拉萨",
  "河北", "山西", "辽宁", "吉林", "黑龙江", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南",
  "广东", "海南", "四川", "贵州", "云南", "陕西", "甘肃", "青海", "内蒙古", "广西", "西藏", "宁夏", "新疆",
  "香港", "澳门", "台湾",
];

export interface ExtractedFact {
  /** 事实类型（稳定标识，用于 required-facts 匹配与证据清单模板）。 */
  type: string;
  /** 事实值（从问题中提取的原文片段）。 */
  value: string;
}

export interface FactSet {
  location?: string | undefined;
  salaryAmount?: string | undefined;
  workStartDate?: string | undefined;
  terminationDate?: string | undefined;
  terminationReason?: string | undefined;
  employmentType?: string | undefined;
  hasContractAbsence: boolean; // 用户明确提到未签合同
  hasWrittenContract: boolean; // 用户明确提到已签合同
  hasProbationContext: boolean;
  hasOvertimeHours: boolean;
  hasInjuryContext: boolean;
  hasPregnancyContext: boolean;
  hasArbitrationDateContext: boolean;
  hasDispatchContext: boolean;
  hasPlatformContext: boolean;
  hasSpecificAmount: boolean; // 出现具体金额，视为个案事实
  hasTimeExpression: boolean; // 出现具体时间/期间，视为个案事实
  firstPersonSituation: boolean; // 是否在描述自己的具体情形
  raw: ExtractedFact[];
}

/** 提取问题中的事实（确定性规则；不保证枚举完备，未识别即视为缺失）。 */
export function extractFacts(question: string): FactSet {
  const raw: ExtractedFact[] = [];
  const firstPerson = /我|我的|本人|我们|我们公司|单位|在职|入职|工作期间/.test(question);
  for (const p of PROVINCES) {
    if (question.includes(p)) {
      raw.push({ type: "location", value: p });
      break;
    }
  }
  const location = raw.find((f) => f.type === "location")?.value;
  const amountMatch = /(?:月薪|工资|底薪|年薪|每月)[^\n]{0,12}?(\d{3,7})(?:元|块)?/.exec(question) ?? /(\d{3,7})(?:元|块)?\/?(?:月|天|小时)/.exec(question);
  if (amountMatch) {
    raw.push({ type: "salaryAmount", value: amountMatch[1] ?? "" });
  }
  const salaryAmount = raw.find((f) => f.type === "salaryAmount")?.value;
  const dateMatch = /(20\d{2})年/.exec(question) ?? /(\d{1,2})个月前/.exec(question);
  if (dateMatch) {
    raw.push({ type: "workStartDate", value: dateMatch[0] ?? "" });
  }
  const workStartDate = raw.find((f) => f.type === "workStartDate")?.value;
  const termMatch = /(昨天|前天|上个月|上礼拜|(?:20\d{2})年\d{1,2}月)/.exec(question);
  if (termMatch) {
    raw.push({ type: "terminationDate", value: termMatch[0] ?? "" });
  }
  const terminationDate = raw.find((f) => f.type === "terminationDate")?.value;
  const reasonEnum: readonly string[] = [
    "试用期", "不符合录用条件", "严重违反", "严重违纪", "旷工", "失职", "营私舞弊", "刑事", "裁撤", "裁员", "经营困难",
    "经济性裁员", "客观情况", "重大变化", "不胜任", "医疗期满", "协商一致", "被迫离职", "未支付", "未缴纳", "怀孕", "工伤",
    "自离", "自动离职", "考核不合格", "绩效不达标", "违规", "盗窃", "泄密", "泄露", "拒绝加班", "拒绝调岗", "拒绝降薪",
    // 违法解除/辞退类（与 ISSUE_KEYWORDS 中 unlawful-termination-compensation 关键词族一致；
    // 用户明确给出“违法解除”等理由时，不应再判定为“解除原因缺失”）。
    "违法解除", "非法解除", "违法辞退", "无故辞退",
  ];
  for (const r of reasonEnum) {
    if (question.includes(r)) {
      raw.push({ type: "terminationReason", value: r });
      break;
    }
  }
  const terminationReason = raw.find((f) => f.type === "terminationReason")?.value;

  const typeEnum: readonly string[] = [
    "劳务派遣", "派遣工作", "外包", "临时工", "小时工", "兼职", "非全日制", "退休返聘", "实习生", "试用期员工",
    "网约车", "外卖", "骑手", "主播", "平台", "灵活就业", "自由职业", "个体工商户", "正式工", "正式员工", "全日制",
  ];
  for (const t of typeEnum) {
    if (question.includes(t)) {
      raw.push({ type: "employmentType", value: t });
      break;
    }
  }
  const employmentType = raw.find((f) => f.type === "employmentType")?.value;

  const hasContractAbsence = /没(?:有)?签|未签|没签|不签合同|未签订|未订立|没有合同|没合同/.test(question);
  const hasWrittenContract = /签了(?:合同)?|签订了|已签|签过|有劳动合同|书面合同/.test(question);
  const hasProbationContext = /试用期/.test(question);
  const hasOvertimeHours = /每小时|几小时|每天(?:工作|上班)|时长|钟头|加班(?:到|至)?\d{1,2}|小时/.test(question);
  const hasInjuryContext = /工伤|受伤|事故|职业病|工亡|摔伤|骨折|死亡/.test(question);
  const hasPregnancyContext = /孕|怀孕|产假|哺乳|三期/.test(question);
  const hasArbitrationDateContext = /时效|过了|一年多|两年|仲裁委|仲裁申请/.test(question);
  const hasDispatchContext = /劳务派遣|派遣/.test(question);
  const hasPlatformContext = /平台|网约车|外卖|骑手|主播|直播|带货|众包/.test(question);
  const hasSpecificAmount = /\d{2,}/.test(question);
  const hasTimeExpression = /年|月|天|周|小时|之前|以后|期间|入职|离职/.test(question);

  return {
    location,
    salaryAmount,
    workStartDate,
    terminationDate,
    terminationReason,
    employmentType,
    hasContractAbsence,
    hasWrittenContract,
    hasProbationContext,
    hasOvertimeHours,
    hasInjuryContext,
    hasPregnancyContext,
    hasArbitrationDateContext,
    hasDispatchContext,
    hasPlatformContext,
    hasSpecificAmount,
    hasTimeExpression,
    firstPersonSituation: firstPerson,
    raw,
  };
}
// ---------------------------------------------------------------------------
// 争议焦点拆分 + 话题映射 + 必需事实
// ---------------------------------------------------------------------------

/** 各话题的关键词（确定性子串匹配；话题与关键词均人工维护）。 */
export const ISSUE_KEYWORDS: Record<string, readonly string[]> = {
  "labor-relationship-recognition": ["劳动关系认定", "劳动关系的建立", "是否为劳动关系", "事实劳动关系", "劳务关系还是劳动关系", "劳动关系和劳务关系", "确认劳动关系", "承认劳动", "没签合同算劳动关系"],
  "contract-performance": ["合同到期", "续签", "无固定期限", "劳动合同变更", "调岗", "降薪", "变更劳动合同", "劳动合同约定", "书面合同", "合同内容", "劳动合同解除", "终止劳动合同", "合同终止"],
  "double-wage-notice": ["二倍工资", "双倍工资", "两倍工资", "没签合同", "未签合同", "不签合同", "未签书面", "未订立书面", "没签劳动合同"],
  "compensation-and-damages": ["经济补偿", "赔偿金", "补偿金", "赔偿标准", "N+1", "2N", "经济补偿与赔偿金", "违法解除赔偿", "代通知金", "怎么赔", "赔偿多少", "赔钱", "赔偿", "赔多少"],
  "working-hours-leave": ["工作时间", "工时", "标准工时", "综合计算", "不定时", "双休", "单休", "休息日", "法定节假日", "节假日", "年休假", "年假", "带薪休假", "调休", "补休", "探亲假", "婚假", "丧假"],
  "overtime-pay": ["加班", "加班费", "加班工资", "超时加班", "延长工作时间"],
  "wage-arrears": ["拖欠工资", "欠薪", "拖欠", "不发工资", "克扣", "讨薪", "欠工资", "工资不给", "拖欠农民工工资"],
  "probation-disputes": ["试用期", "试用期工资", "试用期解除", "试用期被辞退", "试用期不符合", "录用条件"],
  "social-insurance": ["社保", "社会保险", "五险", "五险一金", "社保缴纳", "断缴", "补缴", "社保基数", "公积金"],
  "work-injury": ["工伤", "工亡", "职业病", "工伤认定", "伤残", "劳动能力鉴定", "工伤赔偿", "工伤保险"],
  "female-worker-protection": ["产假", "哺乳", "孕期", "妊娠", "三期", "女职工", "生育", "加班限制", "哺乳期"],
  "noncompete-confidentiality": ["竞业", "保密协议", "竞业限制", "竞业禁止", "商业秘密", "跳槽", "离职后竞业"],
  "labor-dispatch": ["劳务派遣", "派遣", "外包用工", "外包", "派到", "甲方", "派遣工"],
  "new-employment-forms": ["新就业形态", "平台用工", "网约车", "外卖", "骑手", "主播", "直播", "带货", "众包", "灵活用工", "灵活就业"],
  "arbitration-limitation": ["仲裁时效", "过了时效", "一年内", "时效", "仲裁时效期间"],
  "arbitration-procedure": ["仲裁管辖", "仲裁委", "劳动仲裁", "仲裁申请", "仲裁证据", "裁诉衔接", "仲裁前置", "起诉状", "仲裁庭审", "劳动监察"],
  "unlawful-termination-compensation": ["违法解除", "非法解除", "无故辞退", "违法辞退", "开除"],
  "social-insurance-noncompete": [],
};

export interface Decomposition {
  /** 拆出的争议焦点（分句后的文本片段）。 */
  focusPoints: string[];
  /** 命中的话题（顺序稳定、去重）。 */
  topicIds: TopicId[];
  /** 话题中文标签（与 topicIds 对应）。 */
  topicLabels: string[];
}

/** 兜底话题推断（确定性人工映射）：当 ISSUE_KEYWORDS 未命中时使用。
 *  只绑定确实相关的话题，绝不无脑绑定“违法解除/经济补偿”；无匹配时返回空数组。 */
const FALLBACK_TOPIC_RULES: readonly [TopicId, readonly string[]][] = [
  ["work-injury", ["工伤", "工亡", "职业病", "伤残", "停工留薪", "劳动能力鉴定"]],
  ["working-hours-leave", ["年假", "年休假", "带薪休假", "探亲假", "婚假", "丧假", "调休", "补休"]],
  ["social-insurance", ["社保", "社会保险", "五险", "公积金", "断缴", "补缴"]],
  ["overtime-pay", ["加班", "加班费", "加班工资"]],
  ["unlawful-termination-compensation", ["辞退", "开除", "裁员", "解雇", "解聘", "违法解除"]],
  ["wage-arrears", ["欠薪", "拖欠", "克扣", "不发工资", "讨薪"]],
  ["double-wage-notice", ["二倍工资", "双倍工资", "没签合同", "未签合同"]],
  ["compensation-and-damages", ["经济补偿", "赔偿金", "N+1", "赔钱", "赔偿", "怎么赔", "赔多少"]],
  ["arbitration-procedure", ["仲裁", "仲裁委", "仲裁申请", "劳动监察", "起诉", "诉讼"]],
  ["arbitration-limitation", ["时效"]],
  ["probation-disputes", ["试用期", "转正"]],
  ["noncompete-confidentiality", ["竞业", "保密"]],
  ["labor-dispatch", ["劳务派遣", "派遣合同", "派遣工", "外包", "甲方"]],
  ["new-employment-forms", ["骑手", "外卖", "主播", "平台", "众包"]],
  ["female-worker-protection", ["产假", "哺乳期", "孕期", "三期", "女职工"]],
  ["contract-performance", ["合同到期", "续签", "调岗", "降薪", "无固定期限", "辞职", "离职", "变相逼", "调离"]],
  ["labor-relationship-recognition", ["劳动关系", "事实劳动关系", "劳务关系"]],
];

/** 兜底话题推断（独立于 ISSUE_KEYWORDS；用于裸词/未命中时的 topic fallback）。 */
export function inferTopicsFromText(question: string): TopicId[] {
  const matched: TopicId[] = [];
  for (const [topic, keywords] of FALLBACK_TOPIC_RULES) {
    if (keywords.some((k) => question.includes(k))) {
      matched.push(topic);
    }
    if (matched.length >= 6) {
      break;
    }
  }
  return matched;
}

const CONNECTOR_RE = /并且|而且|还有|以及|同时|另外|、|;|；/;

/**
 * 争议焦点拆分（确定性）：按连接词切分问题；对每个切分片段匹配话题关键词。
 * 复合问题（如“被辞退也没发工资”）会命中多个话题。
 * 未命中时使用 FALLBACK_TOPIC_RULES；仍无命中时 topicIds 为空（不强行绑定辞退/补偿模板）。
 */
export function decomposeIssues(question: string): Decomposition {
  const segments = question
    .split(CONNECTOR_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 6);
  const focusPoints = segments.length > 1 ? segments : [question.trim()];
  const matched: TopicId[] = [];
  for (const [topic, patterns] of Object.entries(ISSUE_KEYWORDS)) {
    if (patterns.length === 0) {
      continue;
    }
    const hit = patterns.some((p) => question.includes(p));
    if (hit) {
      matched.push(topic as TopicId);
    }
  }
  if (matched.length === 0) {
    matched.push(...inferTopicsFromText(question));
  }
  return {
    focusPoints,
    topicIds: matched.slice(0, 10),
    topicLabels: matched.slice(0, 10).map((t) => TOPIC_LABELS[t] ?? t),
  };
}

// ---------------------------------------------------------------------------
// 必需事实与证据清单模板（决定 answered / needs_clarification 的确定性依据）
// ---------------------------------------------------------------------------

export interface FactRequirement {
  topics: readonly TopicId[];
  /** 已满足？ */
  satisfied: (facts: FactSet) => boolean;
  /** 缺失时的中文描述（keyFactsNeeded 条目）。 */
  description: string;
  /** 证据准备提示（evidenceToPrepare 条目）。 */
  evidenceTip: string;
}

export const FACT_REQUIREMENTS: readonly FactRequirement[] = [
  { topics: ["unlawful-termination-compensation", "compensation-and-damages", "contract-performance"], satisfied: (f) => f.terminationReason !== undefined || f.hasProbationContext, description: "解除/终止的具体原因（是否单位单方解除、是否协商一致、是否严重违纪等）", evidenceTip: "解除通知、辞退/开除书面材料、谈话录音、公告或邮件记录" },
  { topics: ["compensation-and-damages", "unlawful-termination-compensation", "contract-performance"], satisfied: (f) => f.workStartDate !== undefined || f.hasTimeExpression, description: "入职时间或工作年限（影响经济补偿/赔偿金计算）", evidenceTip: "劳动合同、工牌、社保缴费记录、工资流水、入职登记表" },
  { topics: ["compensation-and-damages", "wage-arrears", "overtime-pay", "unlawful-termination-compensation"], satisfied: (f) => f.salaryAmount !== undefined, description: "月工资标准（解除前十二个月平均工资或正常工资标准）", evidenceTip: "工资条、银行流水、个税记录、考勤/绩效工资明细" },
  { topics: ["wage-arrears", "overtime-pay"], satisfied: (f) => f.hasSpecificAmount || f.salaryAmount !== undefined, description: "拖欠/加班的时间段与金额范围", evidenceTip: "考勤记录、排班表、加班审批单、工资发放记录、加班聊天记录" },
  { topics: ["double-wage-notice", "no-written-contract"], satisfied: (f) => f.hasContractAbsence || f.workStartDate !== undefined, description: "未签书面合同的起止期间与入职时间", evidenceTip: "入职登记、打卡记录、工资发放记录、未签合同的事实说明" },
  { topics: ["probation-disputes"], satisfied: (f) => f.hasProbationContext && (f.terminationReason !== undefined || f.salaryAmount !== undefined), description: "试用期约定、离职时间点与被辞退理由", evidenceTip: "劳动合同（试用期条款）、录用条件文件、考核记录、解除通知" },
  { topics: ["social-insurance", "social-insurance-noncompete"], satisfied: (f) => (f.workStartDate !== undefined || f.hasTimeExpression) && f.location !== undefined, description: "入职时间、是否断缴/未缴、实际工作地点（社保与地方口径相关）", evidenceTip: "社保缴费记录、五险参保证明、劳动合同、工资流水" },
  { topics: ["work-injury"], satisfied: (f) => f.hasInjuryContext && f.hasTimeExpression, description: "受伤时间、地点、经过（是否因工作原因）与单位认定情况", evidenceTip: "病历、诊断证明、医疗费票据、事故经过证明、证人证言、单位盖章的事故报告" },
  { topics: ["female-worker-protection"], satisfied: (f) => f.hasPregnancyContext, description: "怀孕/生育/哺乳的时间点与公司处理方式", evidenceTip: "孕期检查记录、产假申请、医院证明、考勤与解除通知" },
  { topics: ["noncompete-confidentiality"], satisfied: (f) => f.salaryAmount !== undefined || f.employmentType !== undefined, description: "竞业限制约定内容、补偿标准约定与实际支付情况", evidenceTip: "竞业限制协议、保密协议、补偿金支付记录、新单位入职证明" },
  { topics: ["labor-dispatch"], satisfied: (f) => f.hasDispatchContext, description: "派遣单位与实际用工单位、派遣期限与岗位", evidenceTip: "劳务派遣协议、劳动合同、工资发放主体凭证、社保缴纳主体凭证" },
  { topics: ["new-employment-forms"], satisfied: (f) => f.hasPlatformContext, description: "平台与个人之间的协议类型（劳动合同/合作协议）、报酬结算方式", evidenceTip: "平台注册协议、合作协议、订单/流水记录、提现记录" },
  { topics: ["arbitration-limitation"], satisfied: (f) => f.hasArbitrationDateContext || f.terminationDate !== undefined, description: "知道或应当知道权利被侵害的日期（仲裁时效起算点）", evidenceTip: "解除通知、工资未付记录、时效中断/中止的凭证（催告、协商记录）" },
  { topics: ["arbitration-procedure"], satisfied: (f) => f.location !== undefined, description: "工作地点/用人单位所在地（仲裁管辖与地方立案口径）", evidenceTip: "劳动合同载明的用工地点、营业执照信息、工资发放地凭证" },
  { topics: ["labor-relationship-recognition"], satisfied: (f) => f.hasTimeExpression, description: "用工事实的时间、报酬支付方式与接受管理的情况", evidenceTip: "考勤记录、工作指令聊天记录、工资发放记录、工牌/制服、社保记录" },
  { topics: ["working-hours-leave"], satisfied: (f) => f.hasOvertimeHours || f.hasTimeExpression, description: "工时制度（标准/综合计算/不定时）、请假与休息休假情况", evidenceTip: "考勤表、排班表、假期审批单、劳动合同中的工时条款" },
];

export interface MissingFactItem {
  description: string;
  evidenceTip: string;
}

/** 计算缺失的必需事实（确定性；topicIds 与 facts 有交集才会触发）。 */
export function missingRequiredFacts(topicIds: readonly TopicId[], facts: FactSet): MissingFactItem[] {
  const out: MissingFactItem[] = [];
  const seen = new Set<string>();
  for (const req of FACT_REQUIREMENTS) {
    if (!req.topics.some((t) => topicIds.includes(t))) {
      continue;
    }
    if (!req.satisfied(facts) && !seen.has(req.description)) {
      seen.add(req.description);
      out.push({ description: req.description, evidenceTip: req.evidenceTip });
    }
  }
  return out;
}

/** 判定是否属于“具体个案情形”的描述（决定 needs_clarification 是否适用）。 */
export function isSituationQuestion(facts: FactSet): boolean {
  return (
    facts.firstPersonSituation &&
    (facts.hasSpecificAmount ||
      facts.hasTimeExpression ||
      facts.hasContractAbsence ||
      facts.terminationReason !== undefined ||
      facts.employmentType !== undefined ||
      facts.hasInjuryContext ||
      facts.hasPregnancyContext ||
      facts.hasProbationContext ||
      facts.hasOvertimeHours)
  );
}

/**
 * 裸劳动词判定（工伤/年假/社保/加班/辞退怎么办 等）：
 * - 查询较短（规范文本 ≤ 14 字）；
 * - 命中劳动主题（inferTopicsFromText）；
 * - 不是对具体个案事实的描述（无本人+金额/时间等要素）；
 * 命中则必须走 topic fallback 的 needs_clarification（不调用模型，避免把裸词随意绑到无关法条）。
 */
export function isBareLaborQuery(question: string, facts: FactSet): boolean {
  const c = canonicalize(question);
  if (c.length > 14) {
    return false;
  }
  // 定义/概念类问题（“有什么区别/是什么/定义”等）可直接基于规则回答，不算裸词。
  if (/区别|定义|含义|是什么|什么意思|法律规定|包括哪些|有哪些/.test(question)) {
    return false;
  }
  if (facts.firstPersonSituation && (facts.hasSpecificAmount || facts.hasTimeExpression)) {
    return false;
  }
  return inferTopicsFromText(question).length > 0;
}