# CASE_COVERAGE_AUDIT —— 官方案例覆盖审计（2026-08-28）

> 由 `node scripts/audit-case-coverage.mjs --write` 生成；数据源为 content/cases（schema v2，official_source_verified）。
> 口径说明：social-insurance-noncompete 为 Phase 6 兼容/联合主题（TOPIC_IDS 注释“原有六个场景 ID 保留以兼容既有内容与调用方”），
> 官方披露语义为“社会保险 OR 竞业限制”联合主题；官方案例的确定性映射 = 命中 social-insurance 或 noncompete-confidentiality 任一主题即归入，
> 与两者都无关的案例不会被标记为该项目（见 scripts/import-cases.mjs inferCaseTopics 注释）。

## 规模

- 案例总数：**219**（唯一案例；sourceId 全局唯一）
- 来源批次数：32
- 覆盖省级地区数：13（非"全国性"地区数；联合地区按拆分计数：北京市、四川省、重庆市、福建省、贵州省、河北省、河南省、江西省、山东省、陕西省、天津市、新疆维吾尔自治区、云南省）
- 官方 URL 全部通过 host 白名单：是 ✅
- 元数据完整（URL/机关/日期/地区/审核状态）：是 ✅
- 疑似重复（标题或标题+案情前 200 字相同）：无 ✅
- 占位/待补充内容：无 ✅
- 官方未公布案号（documentNumber=null）：208 / 219

## 19 主题案例覆盖

| TopicId | 标签 | 案例数 | 7B 目标 |
|---|---|---|---|
| unlawful-termination-compensation | 违法解除与经济补偿 | 95 | ≥20（与补偿赔偿合计口径） |
| wage-arrears | 拖欠工资 | 47 | ≥15 |
| overtime-pay | 加班费 | 17 | ≥15（与工时休假合计口径） |
| no-written-contract | 未签书面劳动合同 | 35 | ≥12（与二倍工资合计口径） |
| probation-disputes | 试用期争议 | 7 | ≥5 |
| social-insurance-noncompete | 社会保险与竞业限制 | 103 | ≥5 |
| labor-relationship-recognition | 劳动关系认定 | 52 | ≥20（与新就业形态合计口径） |
| contract-performance | 劳动合同订立履行变更解除终止 | 43 | ≥5 |
| double-wage-notice | 未签合同二倍工资 | 12 | ≥12（与未签合同合计口径） |
| compensation-and-damages | 经济补偿与违法解除赔偿金 | 89 | ≥20（与违法解除合计口径） |
| working-hours-leave | 工作时间休息休假 | 56 | ≥15（与加班费合计口径） |
| social-insurance | 社会保险 | 70 | ≥10 |
| work-injury | 工伤 | 34 | ≥15 |
| female-worker-protection | 女职工与三期保护 | 22 | ≥5 |
| noncompete-confidentiality | 竞业限制与保密 | 27 | ≥10 |
| labor-dispatch | 劳务派遣 | 11 | ≥5 |
| new-employment-forms | 新就业形态 | 45 | ≥20（与劳动关系认定合计口径） |
| arbitration-limitation | 仲裁时效 | 5 | ≥15（与裁诉衔接合计口径） |
| arbitration-procedure | 仲裁管辖庭审证据与裁诉衔接 | 66 | ≥15（与仲裁时效合计口径） |

## 高频主题目标达成

- 违法解除/经济补偿与赔偿金（unlawful-termination-compensation + compensation-and-damages）：95 + 89（目标 ≥20）
- 工资/欠薪/提成奖金（wage-arrears）：47（目标 ≥15）
- 加班费与工时休假（overtime-pay + working-hours-leave）：17 + 56（目标 ≥15）
- 劳动关系认定及新就业形态（labor-relationship-recognition + new-employment-forms）：52 + 45（目标 ≥20）
- 未签合同与二倍工资（no-written-contract + double-wage-notice）：35 + 12（目标 ≥12）
- 工伤（work-injury）：34（目标 ≥15）
- 社会保险（social-insurance）：70（目标 ≥10）
- 竞业限制与保密（noncompete-confidentiality）：27（目标 ≥10）
- 仲裁时效/证据/管辖/裁诉衔接（arbitration-limitation + arbitration-procedure）：5 + 66（目标 ≥15）

## 来源批次（按批次计数）

- bj-ldzzy-2024-12｜10 案｜北京市人力资源和社会保障局｜2024-12-17｜北京市｜核验 2026-08-28｜https://rsj.beijing.gov.cn/bm/ztzl/dxal/202412/t20241217_3968004.html
- bj-ldzzy-2025-12｜10 案｜北京市人力资源和社会保障局｜2025-12-26｜北京市｜核验 2026-08-28｜https://rsj.beijing.gov.cn/bm/ztzl/dxal/202512/t20251226_4366546.html
- cy-ldzzy-2024-01｜12 案｜四川省人力资源和社会保障厅、重庆市人力资源和社会保障局、四川省高级人民法院、重庆市高级人民法院｜2024-04-30｜四川省、重庆市｜核验 2026-08-28｜https://rst.sc.gov.cn/rst/xwfb/2024/4/30/1182cee10f2d4f4583cf874922df86b2/files/%e5%b7%9d%e6%b8%9d%e5%8a%b3%e5%8a%a8%e4%ba%ba%e4%ba%8b%e4%ba%89%e8%ae%ae%e5%85%b8%e5%9e%8b%e6%a1%88%e4%be%8b%e7%9b%ae%e5%bd%95.docx
- fj-ldzzy-2023-08｜9 案｜福建省人力资源和社会保障厅、福建省高级人民法院｜2023-07-26｜福建省｜核验 2026-08-28｜https://rst.fujian.gov.cn/zw/zfxxgk/zfxxgkml/zyywgz/ldgx/202308/t20230801_6217940.htm
- gz-ldzzy-2025-04｜10 案｜贵州省高级人民法院、贵州省人力资源和社会保障厅｜2025-04-30｜贵州省｜核验 2026-08-28｜https://rst.guizhou.gov.cn/zwgk/zdlyxx/qsldrszyzcjg/202504/t20250430_87609446.html
- hb-ldzzy-2020-2024｜6 案｜河北省高级人民法院｜2025-04-28｜河北省｜核验 2026-08-28｜https://www.hebeicourt.gov.cn/article/detail/2025/04/id/8818471.shtml
- hn-jiyuan-2024-01｜4 案｜济源中级人民法院｜2025-11-21｜河南省｜核验 2026-08-28｜https://www.hncourt.gov.cn/public/detail.php?id=202333
- hn-ldzzy-2026-05｜8 案｜河南省高级人民法院、河南省人力资源和社会保障厅｜2026-05-20｜河南省｜核验 2026-08-28｜https://zzrs.zhengzhou.gov.cn/jdal/10059149.jhtml
- jx-2026-01｜5 案｜江西省高级人民法院｜2026-04-30｜江西省｜核验 2026-08-28｜https://jxgy.jxfy.gov.cn/article/detail/2026/04/id/9298232.shtml
- laodongzhengyi-typical-2025｜6 案｜最高人民法院｜2025-08-01｜?｜核验 2026-08-27｜https://www.court.gov.cn/zixun/xiangqing/472681.html
- ldrszy-typical-batch2｜10 案｜最高人民法院、人力资源社会保障部｜2021-08-26｜?｜核验 2026-08-27｜https://www.court.gov.cn/zixun/xiangqing/319151.html
- ldrszy-typical-batch3｜6 案｜最高人民法院、人力资源社会保障部｜2023-05-26｜?｜核验 2026-08-27｜https://www.court.gov.cn/zixun/xiangqing/401172.html
- ldrszy-typical-batch4｜5 案｜最高人民法院、人力资源社会保障部｜2025-04-16｜?｜核验 2026-08-27｜https://www.court.gov.cn/zixun/xiangqing/462311.html
- sd-ldzzy-2021-04｜8 案｜?｜?｜?｜核验 ?｜?
- sd-mscankao-typcases-2026｜2 案｜?｜?｜?｜核验 ?｜?
- sd-sdgy-laborer-rights-2024-04｜1 案｜?｜?｜?｜核验 ?｜?
- sd-wf-anqiu-2024nd-02｜1 案｜?｜?｜?｜核验 ?｜?
- sd-xinjiuyexingtai-2023-12｜6 案｜?｜?｜?｜核验 ?｜?
- sheqianxin-typical-2024-01｜13 案｜最高人民法院、人力资源社会保障部、中华全国总工会｜2024-01-25｜?｜核验 2026-08-27｜https://www.court.gov.cn/shenpan/xiangqing/423922.html
- sheqianxin-typical-2024-12｜9 案｜最高人民法院｜2024-12-23｜?｜核验 2026-08-27｜https://www.court.gov.cn/zixun/xiangqing/450661.html
- sx-ldzzy-2023-02｜9 案｜陕西省人力资源和社会保障厅、陕西省高级人民法院｜2023-12-20｜陕西省｜核验 2026-08-28｜https://rst.shaanxi.gov.cn/sy/tzgg/202312/t20231220_2528183.html
- sx-ldzzy-2024-03｜5 案｜陕西省人力资源和社会保障厅、陕西省高级人民法院｜2024-12-23｜陕西省｜核验 2026-08-28｜https://rst.shaanxi.gov.cn/sy/tzgg/202501/t20250110_3302488.html
- tj-ldzzy-2025-04｜5 案｜天津市高级人民法院、天津市人力资源和社会保障局｜2025-04-30｜天津市｜核验 2026-08-28｜https://tjfy.tjcourt.gov.cn/article/detail/2025/04/id/8820730.shtml
- tj-ldzzy-2026-04｜10 案｜天津市高级人民法院、天津市人力资源和社会保障局｜2026-04-30｜天津市｜核验 2026-08-28｜https://tjfy.tjcourt.gov.cn/article/detail/2026/04/id/9298867.shtml
- xinjiuyexingtai-typical-2025｜4 案｜最高人民法院｜2025-04-30｜?｜核验 2026-08-27｜https://www.court.gov.cn/zixun/xiangqing/463871.html
- xj-ldzzy-2025-05｜5 案｜新疆维吾尔自治区人力资源和社会保障厅（以案释法专栏）｜2025-05-06｜新疆维吾尔自治区｜核验 2026-08-28｜https://rst.xinjiang.gov.cn/xjrst/c113095/202505/3e81b3ad53074cbfa4cbab480bb35f97.shtml
- yn-ldzzy-2024｜12 案｜云南省人力资源和社会保障厅、云南省高级人民法院｜2024-05-24｜云南省｜核验 2026-08-28｜https://hrss.yn.gov.cn/Uploads/NewsPhoto/2024-08-22/71135820-dacb-4fb2-8171-5982839d79fb.pdf
- zgf-eyqx-2025-01｜5 案｜最高人民法院、人力资源社会保障部｜2025-01-22｜全国性｜核验 2026-08-28｜https://tldl.lncourt.gov.cn/article/detail/2025/01/id/8682706.shtml
- zgf-ldzzy-2024-01｜6 案｜最高人民法院｜2024-04-30｜全国性｜核验 2026-08-28｜https://www.court.gov.cn/zixun/xiangqing/431252.html
- zgf-zdxal-2022-32pi｜7 案｜最高人民法院｜2022-07-04｜全国性｜核验 2026-08-28｜https://tlky.lncourt.gov.cn/article/detail/2022/07/id/6782757.shtml
- zgf-zdxal-2025-01｜4 案｜最高人民法院｜2024-12-20｜全国性｜核验 2026-08-28｜https://www.court.gov.cn/zixun/xiangqing/450651.html
- zgf-zlxq-2025｜6 案｜最高人民法院｜2025-12-31｜全国性｜核验 2026-08-28｜https://tjfy.tjcourt.gov.cn/article/detail/2026/01/id/9180650.shtml

## 地区分布

- 全国性：81
- 北京市：20
- 山东省：18
- 天津市：15
- 陕西省：14
- 四川省、重庆市：12
- 河南省：12
- 云南省：12
- 贵州省：10
- 福建省：9
- 河北省：6
- 江西省：5
- 新疆维吾尔自治区：5

## 内容空白（如实记录）

- 案例仅经官方来源核验（source_verified），**未经过律师/法律专业人士复核（legal_reviewed=0）**；
- 地方规则、内部口径与个案差异未覆盖；官方未公布案号/未公开裁判文书的案例按原文如实标注；
- 综合争议、集体诉讼与程序细节的覆盖面受官方发布内容限制；部分官方页面仅有案情+意义段，处理结果如实标注“未单独公布”；
- 本阶段未启用 WSA、未调用 DeepSeek、未部署。
