import { canonicalize } from "./normalize.js";

/**
 * 劳动争议领域信号判定（确定性、可测试、可解释）。
 *
 * 用途：在可靠检索结果判定之前，先判断查询是否属于劳动争议领域。
 * - 只有“支付”“手续”“公司”“老板”等泛化单词不得单独构成劳动争议信号；
 * - “支付宝提现手续费是多少”这类生活问题没有任何领域词组命中 → 不进入可靠检索；
 * - 有效口语表达（“老板不给钱”“公司不要我了”）仍必须识别为劳动争议问题。
 *
 * 规则分层：
 * 1. STRONG_SIGNALS：劳动法律语汇（任意命中即劳动领域）——与 functions/api 领域归类
 *    的强信号语义一致（工资/加班/辞退/社保/工伤/竞业/仲裁/劳动合同/试用期…）；
 * 2. COLLOQUIAL_RULES：口语化领域表述（雇主主体 + 口语谓词同时出现才算，防“我妈不要我了”误判）。
 *
 * 本模块不针对任何具体查询硬编码；全部为手工维护的领域词组（与同义词表一样确定性、可审计）。
 */

export interface LaborDomainAnalysis {
  /** 是否属于劳动争议领域。 */
  isLabor: boolean;
  /** 命中说明（审计用：命中了哪些信号）。 */
  signals: string[];
}

/** 强领域信号：命中任意一条即视为劳动争议领域。 */
export const STRONG_LABOR_SIGNALS: readonly string[] = [
  // 劳动关系与用工
  "劳动", "劳资", "用工", "雇佣", "劳务关系", "劳动关系", "劳动合同", "劳动争议", "劳动纠纷",
  "合同到期", "无固定期限", "续签", "合同变更", "调岗", "降薪", "调薪", "转岗",
  "没签合同", "未签合同", "不签合同", "签合同", "签订合同", "书面劳动合同", "没签劳动合同", "未签劳动合同", "不签劳动合同",
  // 报酬与工时
  "工资", "月薪", "底薪", "提成", "奖金", "年终奖", "绩效", "工资条", "欠薪", "拖欠", "克扣", "讨薪", "发薪", "薪酬",
  "加班", "加班费", "加班工资", "超时", "休息日", "节假日", "年假", "年休假", "带薪休假", "调休", "补休", "双休", "单休", "工时", "倒班", "白班", "夜班", "休息休假",
  // 解除与补偿
  "辞退", "被辞", "开除", "解雇", "解聘", "离职", "辞职", "裁员", "解除劳动合同", "解除劳动关系",
  "赔偿金", "经济补偿", "补偿金", "N+1", "2N",
  // 试用期
  "试用期", "转正", "实习期", "见习期",
  // 社保与工伤
  "社保", "五险", "五险一金", "社保缴纳", "社会保险", "公积金", "断缴", "补缴",
  "工伤", "工亡", "职业病", "伤残", "劳动能力鉴定",
  // 特殊保护
  "产假", "哺乳", "孕期", "妊娠", "三期", "女职工", "婚假", "丧假", "陪产假",
  // 竞业与保密
  "竞业", "保密协议", "竞业限制", "竞业禁止", "商业秘密",
  // 用工形态
  "劳务派遣", "派遣", "外包", "外包用工", "临时工", "小时工", "兼职", "非全日制",
  "平台用工", "灵活用工", "新就业形态", "网约车", "外卖员", "外卖骑手", "骑手", "主播", "带货",
  // 仲裁与程序
  "仲裁", "劳动仲裁", "仲裁委", "仲裁时效", "劳动监察", "12333", "劳动局", "仲裁申请书", "劳动诉讼", "裁诉",
  // 其他
  "工龄", "入职", "在职", "离职证明", "社保卡", "社保基数", "带薪", "病假", "医疗期", "探亲假",
  "拖欠农民工工资", "农民工", "建筑工人", "包工头", "欠薪保障", "用人单位", "雇主", "人力资源部", "劳动权益",
];

/** 雇主类主体词（单独不构成信号；与口语谓词联合判定）。 */
export const EMPLOYER_TERMS: readonly string[] = [
  "公司", "单位", "老板", "企业", "工厂", "用人单位", "雇主", "包工头", "厂子", "物业",
];

/** 口语化领域规则：仅当规则要求的上下文（雇主主体）同时出现时才构成劳动领域信号。
 *  - “老板不给钱” → 雇主 + “不给钱” → 拖欠工资语义；
 *  - “公司不要我了” → 雇主 + “不要我了” → 辞退/解除语义；
 *  - “我妈不要我了” → 无雇主主体 → 不误判。 */
export const COLLOQUIAL_LABOR_RULES: readonly { label: string; phrases: readonly string[] }[] = [
  {
    label: "口头欠薪（雇主+不给钱/没发钱）",
    phrases: [
      "不给钱", "不给我钱", "不给发", "不给发钱", "没给钱", "没给我钱", "没发钱", "不发钱",
      "不给工资", "不发工资", "没发工资", "没给工资", "不给发工资", "欠着钱", "拖着钱", "拖欠着工资",
    ],
  },
  {
    label: "口头解雇（雇主+不要我了/赶我走）",
    phrases: [
      "不要我了", "不要我们了", "不要你了", "不用来了", "别来了", "别干了", "不用干了",
      "赶我走", "让我走", "叫我走", "撵我走", "把我撵走", "让我滚", "走人吧", "不用上班了", "要你走", "让我走人",
    ],
  },
];

/** 领域判定（查询按 canonicalize 规范化后做确定性子串匹配）。 */
export function detectLaborDomain(query: string): LaborDomainAnalysis {
  const q = canonicalize(query);
  const signals: string[] = [];
  for (const s of STRONG_LABOR_SIGNALS) {
    if (q.includes(canonicalize(s))) {
      signals.push(`strong:${s}`);
    }
  }
  if (signals.length === 0) {
    for (const rule of COLLOQUIAL_LABOR_RULES) {
      if (!EMPLOYER_TERMS.some((e) => q.includes(canonicalize(e)))) {
        continue; // 无雇主主体 → 口语谓词不单独成立（防“我妈不要我了”等误判）
      }
      for (const p of rule.phrases) {
        if (q.includes(canonicalize(p))) {
          signals.push(`colloquial:${p}`);
          break;
        }
      }
    }
  }
  return { isLabor: signals.length > 0, signals };
}

/** 领域术语 n-gram 集合（由 STRONG_LABOR_SIGNALS 全部短语经 tokenize 生成）。
 *  用于“单词项命中但词项属于劳动领域术语”的弱重合防护放行：
 *  仅当命中的查询词项本身就是劳动领域术语（如“克扣”“提成”“奖金”），
 *  单个词项命中才可视为有相关性的候选（仍需经过可靠性阈值成为可靠结果）。 */
export function laborTermGrams(): Set<string> {
  const out = new Set<string>();
  // 注意：不导入 tokenize（避免循环依赖），这里按与 tokenize 相同的 2/3-gram 规则生成；
  // domain.ts 由 bm25.ts 使用，bm25.ts 的 tokenize 会做 isStopGram 过滤。
  for (const phrase of STRONG_LABOR_SIGNALS) {
    const c = canonicalize(phrase);
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= c.length - n; i++) {
        out.add(c.slice(i, i + n));
      }
    }
  }
  return out;
}

/** 提示词注入/要求伪造标记（与 functions/api 注入模式同族）。
 *  命中注入标记的查询不执行证据多样化重排：伪造/编造类输入不应把真实案例提升为“证据”，
 *  以避免模型在“编一案号/编一条法条”请求下得到可模仿的案例模板。 */
export const INJECTION_MARKERS: readonly string[] = [
  "编造", "伪造", "虚构", "捏造", "杜撰", "瞎编", "编一条", "编一个", "给我编", "假法条", "不存在的",
  "忽略以上", "忽略之前", "忽略前面", "忽略上述", "忽略前述", "忽略指令", "忽略规则", "忽略设定", "忽略限制",
  "系统提示词", "初始设定", "系统指令", "你的设定", "扮演", "假装你是", "不受限制",
  "重复你刚才", "复述上文", "忘记上面", "不按检索", "不要依据", "不需要依据", "不用管资料",
  "jailbreak", "system prompt", "DAN mode",
];

export interface InjectionAnalysis {
  injected: boolean;
  mark: string | null;
}

/** 注入标记检测（确定性；命中任意标记即视为注入/伪造类输入）。 */
export function detectInjection(query: string): InjectionAnalysis {
  const q = canonicalize(query);
  for (const m of INJECTION_MARKERS) {
    if (q.includes(canonicalize(m))) {
      return { injected: true, mark: m };
    }
  }
  return { injected: false, mark: null };
}
