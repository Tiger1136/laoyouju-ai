# DECISIONS.md —— 决策记录（追加式 ADR 简表）

> 追加方式：新决策在表格末尾新增一行，不修改已记录条目。
> 状态说明：`Accepted` 已接受 / `Proposed` 提案中 / `Superseded` 已被取代。

| ID | 状态 | 日期 | 决定 | 原因 | 后果 |
|---|---|---|---|---|---|
| ADR-001 | Accepted | 2026-08-26 | 产品终端为网页＋微信小程序，不做原生 App | 覆盖搜索收录与微信生态触达，最低成本，避免多端原生开发 | 无原生 App 维护成本；移动端体验受小程序平台约束 |
| ADR-002 | Accepted | 2026-08-26 | 后端采用腾讯云 CloudBase Serverless，不购买独立服务器 | 按量付费、免运维、国内节点合规，现金支出最低 | 受平台运行时（Nodejs20.19）与配额限制；冷启动需在实现期控制 |
| ADR-003 | Accepted | 2026-08-26 | DeepSeek 只从服务端（云函数）调用，客户端零密钥 | 防止 Key 泄露，满足安全红线 | 所有问答必须经云函数中转；需对云函数做频率与长度限制 |
| ADR-004 | Accepted | 2026-08-26 | 第一版检索使用中文 n-gram/BM25 本地索引，不使用付费向量数据库与付费 embedding API | 零额外成本、可重复生成、无外部服务依赖 | 检索质量依赖分词与内容库规模；后续可平滑升级向量检索 |
| ADR-005 | Accepted | 2026-08-26 | 法律内容以审核后的仓库文件（content/）为唯一真源 | 来源可控、可审计、可版本化，避免搬运未授权内容 | 内容更新需走仓库变更与重新生成索引的流程 |
| ADR-006 | Accepted | 2026-08-26 | 网页公开内容静态生成（SEO 收录），私人问答不参与 SEO | 公开内容可被搜索引擎索引；动态问答结果不污染收录 | 网页问答为客户端调用云函数；问答结果页不可被收录（属预期） |
| ADR-007 | Accepted | 2026-08-26 | 生产云函数使用 Nodejs20.19 运行时 | 与 CloudBase 目标运行时对齐，本地 Node 24 仅用于开发 | 云函数代码须按 Nodejs20.19 兼容标准编写，禁止 Node 24 专有特性 |
| ADR-008 | Accepted | 2026-08-26 | 不使用第三方 npm registry，依赖一律来自官方 registry | 供应链安全、可复现构建 | 网络受限时安装可能失败，需在报告如实记录 |
| ADR-009 | Accepted | 2026-08-26 | 首版只覆盖六个具体劳动争议场景（违法解除与经济补偿、拖欠工资、加班费、未签书面劳动合同、试用期争议、社会保险与竞业限制）及全国性规则 | 控制内容范围和法律错误风险，避免首版变成全量劳动法平台 | 地方标准和其他劳动争议问题必须明确提示未覆盖 |
| ADR-010 | Accepted | 2026-08-26 | API 使用 CloudBase HTTP 云函数、Node 原生 http、监听 9000，不引入 Express | 最小依赖、本地可运行、与 CloudBase 部署形态一致 | 路由/中间件需自行实现；已用 node:http 实现并覆盖集成测试 |
| ADR-011 | Accepted | 2026-08-26 | 两端与服务端共用严格 API v1 契约，八段回答和 sourceId 跨字段白名单由运行时校验（zod） | 单一事实来源，防止类型漂移与伪造引用 | 契约变更需修改 packages/shared 并重新构建；非法 sourceId 引用会被拒绝 |
| ADR-012 | Accepted | 2026-08-27 | Phase 1D 小程序延后到 Web 端到端跑通之后 | 网站优先，先让公开内容与问答端到端打通，再投入小程序端 | 小程序端业务页面暂缓；当前阶段不开始小程序 |
| ADR-013 | Accepted | 2026-08-27 | Phase 2 与 Phase 3 合并为“内容与检索 MVP”（内容 schema + 校验 + 中文 n-gram/BM25 检索 + Web 展示） | 网站优先、减少双端返工、加快出现真实可访问产品 | 本阶段一次性交付内容 schema、首批官方内容、检索与 Web 目录展示；不开始 DeepSeek/动态问答/部署 |
| ADR-014 | Accepted | 2026-08-27 | 内容 schema 与检索实现放入唯一新增包 `@laoyouju/retrieval`；内容以 `content/` 内经 schema 校验的 JSON 为唯一真源 | 内容可审计、可版本化、可复现；不创建数据库、后台、爬虫或第二套内容副本 | 内容变更需走仓库变更 + 重新校验 + 重新生成索引 |
| ADR-015 | Accepted | 2026-08-27 | 内容审核状态枚举为 `draft` / `source_verified` / `legal_reviewed`；本阶段由 Harness 核对官方来源的资料仅标记 `source_verified` | 诚实反映“已与官方来源核对，但尚待专业复核”，避免冒充律师审核 | `legal_reviewed` 仅在存在真实专业复核人、复核日期与记录时使用；专业复核为开放 AI 问答前的上线门槛 |
| ADR-016 | Accepted | 2026-08-27 | Phase 4 与 Phase 5 合并为“检索质量修正 + 服务端 DeepSeek 接入 + Web 问答闭环” | 网站优先、减少返工；先让检索能命中关键法条并打通 Web 真实提问，再进入部署 | 本阶段交付检索质量修正、服务端 DeepSeek 集成（mock 测试）、Web `/ask` 真实问答；不开始部署/Phase 6 |
| ADR-017 | Accepted | 2026-08-27 | 回答结构改为「初步说明 / 相关依据 / 下一步 / 信息边界 + AI 生成标识」；来源为结构化 citations（含 citationRef/excerpt/reviewStatus） | 更贴近真实问答产品；引用可核验、状态诚实 | 共享 AskSuccessResponseSchema 使用 `outcome: answered/insufficient`；引用校验由服务端执行 |
| ADR-018 | Accepted | 2026-08-27 | 服务端用原生 `fetch` 调用 DeepSeek OpenAI-compatible `/chat/completions`，不引入 SDK；`DEEPSEEK_MODEL` 可配置且默认 `deepseek-v4-flash` | 最小依赖、源码可审计、避免旧模型名 | 需在服务端配置 `DEEPSEEK_API_KEY`；本阶段用 mock fetch 测试，真实联调在 Phase 6 |
| ADR-019 | Accepted | 2026-08-27 | `source_verified` 足以用于明确标注的个人简历演示版；不把“必须找律师复核”设为代码/部署阻断项，`legal_reviewed=0` 如实展示 | 服务端/Web 桩可以运行；用户与评审能看到“已核对官方来源，尚待专业复核” | 不声称专业法律服务/律师审核/正式商用/已上线；真实模型联调留在 Phase 6 |
| ADR-020 | Accepted | 2026-08-27 | 检索质量采用确定性的字段权重/意图词/话题加权与同义词扩展改善关键法条排序；评测断言 sourceId+条号，禁止“查询→sourceId 硬编码” | 解决“主题正确但关键法条排序不理想”；保持索引构建字节确定性 | 检索测试增加 gold 断言与无关/注入式负向测试 |
| ADR-021 | Accepted | 2026-08-27 | Phase 6 将公网测试版部署到 CloudBase 环境 `laoyouju-demo-d0g2c7d8sb319ddf3`（上海，体验版）；仅用 `tcb login` 浏览器授权；HTTP 云函数 `laoyouju-api` + 静态托管 | 网站优先、低成本上线测试版 | 默认 CloudBase 测试域（`*.tcloudbase.com`/`*.tcloudbaseapp.com`）；独立域名/ICP/搜索收录/小程序留待后续 |
| ADR-022 | Accepted | 2026-08-27 | CloudBase CLI `tcb fn deploy` 指定 `functions[].envVariables` 时会**整体替换**函数环境变量（非合并）；因此非敏感 CORS 变量与 `DEEPSEEK_API_KEY` 均由用户在控制台维护，`cloudbaserc.json` 不写 `envVariables` | 避免覆盖用户人工配置的密钥；`source_verified` 用于个人简历演示版 | 部署文档（DEPLOYMENT.md）记录该坑；后续部署仅做代码级更新（不触碰环境变量） || ADR-023 | Accepted | 2026-08-27 | Phase 7A 把回答状态重构为 answered / needs_clarification / out_of_scope，废除面向用户的泛化 insufficient | 所有劳动争议问题都应得到结构化答复；非劳动问题用固定领域引导 | 请求契约改为三态；生活类问题不再显示“资料不足”；needs_clarification 仍输出法律框架/可能结论/关键事实/证据清单 |
| ADR-024 | Accepted | 2026-08-27 | 内容库扩建为“本地权威知识库 + 来源分级（A/B/C/D）+ 来源登记表（registry）+ 程序化导入流程”，规范 ≥30 部、官方案例 ≥50 个，条文完整拆分 | 产品从过窄演示 RAG 升级为劳动争议研究 Agent；内容可审计、可复现 | 校验增加数量底线与替代关系一致性；机器导入不得伪装成人工审核（verificationStatus 区分官方核验/人工复核） |
| ADR-025 | Accepted | 2026-08-27 | 新增独立 SearchProvider 抽象（packages/search），实现 TencentWSASearchProvider（服务 API KEY 方式，仅服务端读取 WSA_API_KEY），未配置时本地知识库仍工作 | 补充新法规/地方规则/时效性/相似案例线索；不因搜索失败拒答；不增加 SDK 依赖 | 每问题最多 2 次搜索；结果经 URL/域名/时间/一致性校验后仅作 C 级线索；Phase 7A 仅用 mock 测试，不调用真实 WSA |
| ADR-026 | Accepted | 2026-08-27 | 检索阈值不再用于“资料不足拒答”，只用于决定是否发起联网搜索；证据按分级/效力/相关性/时效性/地域适用性排序 | 避免通过降低阈值伪造全覆盖；保证核心结论有 A 级来源 | answered/needs_clarification 必须至少一项 A 类来源（契约层+引擎层双重保证） |
| ADR-027 | Accepted | 2026-08-27 | 扩展 TopicId 至 19 个（保留原 6 场景，新增劳动关系认定/合同履行/二倍工资/工资奖金/工时休假/社保/工伤/女职工/竞业/劳务派遣/新就业形态/仲裁时效/仲裁程序等） | 覆盖全部规定主题，支撑复合问题拆分 | 目录页/检索/测试同步更新；旧 6 场景 ID 保持兼容 |
| ADR-028 | Accepted | 2026-08-28 | TencentWSASearchProvider 按腾讯云官方文档 https://cloud.tencent.com/document/product/1806/130615 实现：`POST https://api.wsa.cloud.tencent.com/SearchPro`、`Authorization: Bearer ${WSA_API_KEY}`、Body `{Query, Cnt}`、响应取自 `Response.Pages`（JSON 字符串逐项解析，映射 title/url/passage|content/date/site） | 旧实现（service-website-search-api.tencentcloudapi.com /WebSearch、X-Wsa-Api-Key、SearchType/Limit/ResultItems）与现行官方文档不符，必须纠正 | 删除全部非官方字段/头；未配置 Key 时 provider=undefined；仅 mock fixture 测试；每问题最多 2 次 |
| ADR-029 | Accepted | 2026-08-28 | 领域判定改为强/弱信号分级（"公司/老板/单位/怎么办/赔偿"不再单独构成证据，无任何信号→out_of_scope 而非按劳动争议处理）；裸劳动词（工伤/年假/社保/加班等）不调用模型，按话题兜底检索真实 A 级规范返回证据驱动 needs_clarification；出现任意非本次证据集的 [S#] → 引用异常，整体降级为证据驱动 needs_clarification（不做"删号保留断言"） | 修正"仅因出现公司/老板就误判为劳动争议"与"裸词绑无关法条/通用经济补偿模板"及"未知引用只删编号留下无支持断言"三类缺陷 | 混淆问题（公司股票/老板推荐买股票/普通交通事故/公司让我做红烧肉/我想开公司）统一 out_of_scope；"上班途中交通事故算工伤吗"因强信号判 labor |
| ADR-030 | Accepted | 2026-08-28 | 山东省级法院/人社部门会议纪要、诉讼指引等按新 sourceType `local_guidance` 收录：authorityLevel=C、jurisdiction=具体省份（如"山东省"），validator 强制地方指引不得为 A 级/全国性，全国性规范不得降为 C 级；`CaseSourceSchema` 增加可选 `claims` 字段记录官方"诉讼请求/仲裁请求"段 | 地方裁审口径是真实参考材料，但效力低于全国法律，不得冒充全国规则；官方原文给出的请求内容可审计保存 | 山东 2 份指引（2019 会议纪要 25 项、2021 诉讼指引 7 章）入内容库（C 级）；API/Web 按"国家法律/地方指引/地方案例"分级展示列为下一阶段；本轮仅数据与 schema 层 |
| ADR-031 | Accepted | 2026-08-28 | Phase 7C-1 产品级来源分级：API/回答/Web 按 A（全国性法律规范）/ B（官方案例，类案参考）/ C（地方裁审指引，仅山东省）区分；契约层强制 applicableLaw 只引 A、similarCases 只引 B 案例、新增可选 localGuidance 只放 C 级山东指引（sourceType=local_guidance + 省级 jurisdiction）；地点明确非山东时山东指引不出现，地点未知必须条件化表述“如争议发生在山东，可参考……，其他地区裁审口径可能不同。”；C 级内容不获得任何 A 级权威加值（AUTHORITY_BOOST 仅作用于 A 级 provision） | 山东地方裁审口径是真实参考但效力低于全国法律；此前 C 级内容会与全国法律混排且可能被模型误写入适用法律段落；必须产品级区分，避免把地方口径显示为“国家法律依据” | 共享契约新增 sourceTypeLabel/sourceLevelLabel/topicIds/localGuidance（默认值保持旧载荷兼容）；/laws、/cases、/ask 分区与标签化；18 例山东官方案例与 2 份山东地方指引验收，30～50 例不再作为本阶段硬门槛，剩余山东批次列入后续持续扩充 backlog；未合并、未部署 |
