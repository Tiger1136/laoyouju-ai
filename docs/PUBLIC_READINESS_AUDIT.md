# PUBLIC_READINESS_AUDIT.md —— 仓库公开准备审计（Phase 7D）

> 审计日期：2026-08-29。仓库：https://github.com/Tiger1136/laoyouju-ai（当前 **Private**）。
> 基线：main / origin/main = 59e7935；已部署代码提交 = 30d066c；线上标签 = phase-7c2-case-copresence。
> 本轮范围（仅只读审计 + 本审计文档）：未修改 GitHub 可见性、未部署、未修改云资源、未重写历史、未 force push、未做许可证选择、未删除/迁移内容。
> 审计方法：全历史 blob 扫描（git rev-list --objects --all + cat-file 全量 621 对象）、工作树/未跟踪/忽略文件扫描、配置/脚本/文档人工逐项核查、content/ 逐类内容核查。

## 1. Git Baseline（核实）

| 项 | 值 |
|---|---|
| main = origin/main | 59e7935（docs: record Phase 7C.2 case evidence co-presence fix） |
| 已部署提交 | 30d066c（fix: ensure official case evidence coexists with applicable law） |
| 标签 | phase-7b-live-201 → 29e1077；phase-7c-shandong-219 → 55341d0；phase-7c2-case-copresence → 30d066c（均为 annotated，未移动） |
| 分支 | main（本地+origin）；feat/shandong-official-corpus、fix/case-evidence-copresence（本地+origin，保留） |
| 提交历史 | git rev-list --all --count = 7；全部作者 = Tiger1136 <127741762+Tiger1136@users.noreply.github.com>（GitHub noreply，无真实邮箱） |
| 对象 | 621 对象 / 2.2MB；in-pack=0（松散对象，全量可枚举） |
| 工作树 | git status 干净；无未跟踪文件 |
| 仓库体量 | 跟踪文件合计约 4.47MB（最大：registry.json 0.23MB、pnpm-lock.yaml 0.13MB） |

## 2. Secret And Privacy Audit

### 2.1 全历史密钥扫描（621 个 blob 全部 cat-file 展开匹配）
- 模式：sk-*、ghp_/gho_/ghu_/ghs_/github_pat_、AKIA、xox*（Slack）、PRIVATE KEY、Cookie/Set-Cookie、DEEPSEEK_API_KEY|WSA_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|TENCENTCLOUD_SECRETKEY|SECRET_KEY=<值>、Authorization/Basic/Bearer、中国手机号、身份证号 17 位、邮箱。
- 结果：**0 个真实密钥/令牌/Cookie**。32 个正则命中全部为误报并逐一人工核验：
  - textSha256/contentHash 十六进制串中的数字段（随机数字组合被手机号/身份证正则命中）；
  - 政府网站页脚（「网站标识码：3715000028」「鲁公网安备37150002000110号」「联系方式：0635-12333」等公共官方元数据，见于 case 原文节选）；
  - PDF URL 路径段（jntlfy.sdcourt.gov.cn/.../2026050609033341125.pdf，时间戳非身份证）；
  - 第三方网站页脚邮箱 global-law@ec.com.cn（见 §3.3，来源风险，非本 repo 凭据）。
- 提交消息扫描：干净。

### 2.2 未跟踪 / 忽略文件
- 未跟踪：**0**。
- 忽略（git status --ignored）：.corepack/、.pnpm-store/、_scratch/（含历史 smoke 记录与临时脚本）、apps/web/.next、node_modules*、dist*、deploy/、content/.index/、content/raw/cases/*.raw.html（7 个，含第三方跟踪脚本——gitignore 条目 *.raw.html 已生效）、scripts/_*（_smoke-live.mjs 等本地临时脚本）、scripts/probe/、tsbuildinfo。
- 结论：忽略规则覆盖良好；**注意 content/raw/*.txt（69 个）是被跟踪的**（见 §3.3）。

### 2.3 个人身份信息（PII）
- Git 身份：Tiger1136 + GitHub noreply 邮箱（无真实姓名/邮箱泄露）。
- 代码、脚本、配置：无姓名/身份证/住址/电话（扫描 + 人工复查）。
- 内容（案例）：官方典型案例正文基本匿名化（某/某某）；**3 个 case JSON 含「生效裁判审判人员：……（姓名）」字段**（最高法指导性案例体例，随官方文本保留，如 房玥诉中美联泰大都会人寿保险…案、聂美兰案），**12 个文件含「指导案例 XX 号/指导性案例」标记**，其中最高法指导性案例按官方发布体例使用当事人真实姓名与案号（官方公开信息）。原文节选中的当事人出生日期（如 1962 年 9 月 15 日）亦为官方发布内容。
- 内部路径（仅 2 处，公开前建议清理）：docs/PROGRESS.md（「工作目录 E:\ds-workspace\Laoyouju」「本机 corepack enable …D:\nodejs」）；functions/api/scripts/build-deploy.mjs 头注释（「产物：E:\ds-workspace\Laoyouju\deploy\api」）。
- .env.example：全部为空占位/示例值（DEEPSEEK_API_KEY=、WSA_API_KEY=、CLOUDBASE_ENV_ID=、NEXT_PUBLIC_API_BASE_URL= 等）；未含真实值。
- .npmrc：仅官方 registry（registry.npmjs.org），无镜像/Token。
- .git/config：无凭据、无 URL 内嵌 token；remote 为 https 克隆地址。
- 云端凭据：无（cloudbaserc.json 仅含 envId 与函数配置，无 envVariables；未发现 .env*/cookie/sqlite 文件——按存在性检查确认 0 项）。

### 2.4 错误信息与日志泄露
- 统一错误结构（ok/apiVersion/requestId/error{code,message,retryable}）；message 均为固定中文文案；无 stack、无本机路径、无环境变量（api.test.mjs 有专门断言）。
- 日志仅记录 requestId/method/pathname/statusCode/durationMs（app.ts finish()），不记录 question/body/headers。
- 结论：无泄露面。

## 3. Content Publication Risk

### 3.1 content/laws（36 部，JSON）
- 内容：法律/行政法规/司法解释/仲裁规则/地方裁审指引条文文本。
- 风险判断：**低**。中国《著作权法》第五条：法律法规、行政机关的决议决定命令等官方文件不适用著作权法；条文为官方公开文本。JSON 中 officialUrl 全部指向官方域名白名单内站点（flk.npc.gov.cn / gov.cn / npc.gov.cn / court.gov.cn / mohrss.gov.cn / 省级法院/人社官网），并有 contentHash/textSha256 审计字段。
- 结论：**可直接公开**（需补充来源/署名说明与免责声明，见 §5）。
- 注意：sd-ldrs-shenli-jiyao-2019 / sd-ldrs-susong-zhiyin-2021 为山东地方裁审指引（官方发布），同属可直接公开，但公开后应保留「仅适用山东省、非全国统一规则」标注（内容字段已含）。

### 3.2 content/cases（219 例，JSON）
- 内容：官方发布典型案例/指导性案例的结构化摘要（title/keyFacts/holding/reasoning，官方页面原文摘要或结构化概括，个案已匿名化或按官方体例保留真实姓名）。
- 风险判断：**中低**。①官方典型案例由法院/人社部门公开发布，本仓库仅为结构化整理+官方 URL 引用，非整篇裁判文书复制（CONTENT_REVIEW.md 明确「不整篇复制裁判文书」）；②少数最高法指导性案例含真实当事人姓名、案号、审判人员姓名（官方发布体例），属于公开信息，但公开仓库应注意个人信息最小化（可评估后续「审判人员姓名」字段脱敏——该动作属于内容修改，需 PM 决定）。
- 结论：**修改后可公开**（先补：来源署名/NOTICE、免责声明、以及是否保留审判人员姓名段的决定）；不建议为公开删除任何案例。

### 3.3 content/raw/（77 个文件：69 txt + 7 html（已忽略）+ 1 README）
- 构成：官方页面抓取的文本归档（cases 批次全文/摘要与 laws 页面文本副本）。
- 风险判断：**高**。①**4 个 law raw（law-gonghuifa-2021、law-laodongfa-2018、reg-guowuyuan-gongzuoshijian、reg-shiyebaoxian-tiaoli）来自第三方聚合站「全球法规网-中国商务法规」（页脚含其联系邮箱 global-law@ec.com.cn）**，属于第三方网站页面复制——许可与归属不明，与「只收官方来源」的内容政策不符（仅存在于 raw 归档，对应 JSON 的 officialUrl 为官方站点）；②其余 raw 为官方页面副本，但页面含网站页脚/导航等非必要内容；③7 个 .raw.html 已由 .gitignore 忽略（含第三方统计脚本），但其对象仍存在于历史中（公开前如需从历史移除，涉及历史重写——超出本阶段，转 PM）。
- 结论：**必须保持私有**（属于「网页原文复制与来源许可风险」项）。公开仓库不将 raw 作为发布内容；建议后续以「私有内容源 + 构建注入」方式保留（见 §4 方案），删除/迁移 raw 需 PM 批准（本轮未动）。

### 3.4 content/sources/registry.json（271 条）与 content/sources/probe/（25+ 批次清单）
- registry：来源登记表（sourceId/title/官方 URL/分级/核验状态/note）——元数据，无正文复制。
- probe：批次抓取记录（batchSlug/url/pageTitle/发布机关/日期/地区等）。
- 风险判断：**低**（均为官方 URL 与元数据；pageTitle 为页面标题）。可公开；其中 pageTitle 若含未脱敏摘要可选择性精简（可不改）。

### 3.5 小结（内容风险矩阵）
| 目录 | 风险 | 结论 |
|---|---|---|
| content/laws | 低 | 可直接公开（加来源说明） |
| content/cases | 中低 | 修改后可公开（加 NOTICE/免责；审判人员姓名段待 PM 决定） |
| content/raw/*.txt | 高 | 必须私有（含第三方聚合站副本） |
| content/raw/*.raw.html | 高 | 已忽略（当前树不含）；如需从历史清除 → PM 决策 |
| content/sources/registry.json | 低 | 可直接公开 |
| content/sources/probe/*.json | 低 | 可直接公开（可精简） |
| content/.index（生成物） | 低 | 已忽略 |

## 4. Recommended Public/Private Boundary（推荐方案）

**推荐「代码 + 数据契约公开，完整内容库私有注入」双仓/双源方案：**

- **公开仓库（代码与数据契约）**：
  - 代码：apps/、functions/、packages/、scripts/（不含 scripts/_*，已忽略）；
  - 数据契约：content/laws + content/cases + content/sources/registry.json（真实官方数据，含来源校验字段）；
  - 文档：README、AGENTS.md、docs/（含本审计、CONTENT_REVIEW、CASE_COVERAGE_AUDIT、SECURITY、DECISIONS、PROGRESS 等）；
  - 需要新增：LICENSE（选择由 PM 决定）、README「内容来源与使用声明」、NOTICE/THIRD_PARTY 声明、公开 API 使用条款（禁止滥用、限速说明、费用声明）。
- **私有侧（保持私有，不公开）**：
  - content/raw/**（原始抓取归档，含第三方聚合站副本）；
  - scripts/_*、_scratch/、deploy/、各类 dist/out/.next、node_modules（均已忽略，双仓方案下本就不可见）；
  - 真实 .env / 云函数环境变量（不在任何仓库）；
  - content/.index（生成物，公开仓通过命名脚本重新生成）。
- **构建/部署注入（二选一，均不删真实数据）**：
  1. content:validate / retrieval:build 使用仓库内公开内容（laws+cases+registry，与线上一致——公开内容本身即生产内容）；raw 仅作为历史归档凭证，不影响构建；
  2. 若选择「完整内容库私有」：从私有内容源在 CI/部署时注入 content/，公开仓仅保留 data schema 与样例数据（样例=已入库官方案例中的 1-2 例 + schema 示例）。
- **不推荐的选项**：把 content/raw 一并公开（第三方复制许可 + 页脚信息）；用 .gitignore 临时改名规避（治标不治本）；为了让测试通过而删除真实项目数据（明令禁止）。

## 5. API Abuse And Cost Risk（公开源码后的关键风险）

现状（代码核查）：
- **无任何服务端限流/配额**（SECURITY.md「服务端限流」一节自述：生产级防滥用（频率/配额）尚未实现，属正式开放前的上线门槛——但 219 例线上版本已开放真实 DeepSeek 调用，该门槛至今未落地）。
- CORS 仅约束浏览器带 Origin 的请求；**无 Origin 的请求（curl/脚本/小程序）默认放行**（http.ts isOriginAllowed: undefined → true），因此 **CORS 不是服务端鉴权**。
- 已有防护：请求体 ≤8192 字节；问题长度 2–500 字；每问题最多 2 次联网搜索（WSA 未启用）；单次 DeepSeek 调用、不自动重试；15s 超时；1300 max_tokens——单次调用成本有上界，但**总量无约束**。
- 错误信息：固定文案，无内部细节（已核）；日志不记问题原文。

公开仓库影响：API 地址（*.service.tcloudbase.com）与请求格式可直接被发现 → 任何人可高频 POST → DeepSeek 费用被滥用、函数并发/冷启动成本上升、乃至封禁风险。

建议（后续阶段落地，本轮不实施）：
1. 服务端限流：按 IP/客户端指纹的每分钟/每日配额；超过阈值返回 429（CloudBase 网关限流或函数层计数）。
2. 可选访问令牌/签名（仅服务端验证）；公开文档声明「仅供演示/测试，不承诺 SLA」。
3. 输入侧已足够（长度/字节/消息类型）；建议补充单请求 DeepSeek token 预算核对与并发上限说明（函数内存 256MB、超时 60s 已设）。
4. 公开 README 明确「免费测试端点，可能限流/下线，仅供演示；不得用于批量爬取/自动化滥用」。

## 6. Required Repository Documents（公开前需补齐/核查）

| 文档 | 现状 | 动作 |
|---|---|---|
| LICENSE | **不存在**（无 LICENSE/LICENSE.md/LICENSE.txt） | 新增；许可证选择（MIT/Apache-2.0/含内容条款的定制声明）**需 PM 决策**；本轮不选择、不创建 |
| README.md | 有；含产品定位/当前状态/部署信息，**无许可、无内容来源与免责声明段落** | 修改后可公开：新增「内容来源与许可说明（法律法规与官方案例来源、官方 URL 可核验、非律师意见）」「公开 API 使用边界」 |
| docs/SECURITY.md | 有；密钥管理/输入传输限制/CORS/日志脱敏完善；「服务端限流」自述未实现 | 可直接公开；建议补充「安全披露联系方式」与「公开仓库 ≠ 生产保证」声明 |
| docs/CONTENT_REVIEW.md | 有；逐条官方来源核对表与「只收官方来源」政策 | 可直接公开；建议补一段「第三方聚合站 raw 归档仅私有」说明 |
| docs/CASE_COVERAGE_AUDIT.md / ARCHITECTURE / DECISIONS / PROGRESS / DEPLOYMENT | 有；PROGRESS 含本地路径 2 处（见 §2.3） | PROGRESS 改本地路径为相对表述；其余可直接公开 |
| AGENTS.md | 有；协作规则 | 可直接公开 |
| CONTRIBUTING / 行为准则 | 无 | 可选（非必需） |
| THIRD_PARTY/NOTICE 声明 | 无 | 必需项（法规/案例官方来源声明；第三方聚合站原始归档不公开；依赖清单由 pnpm-lock 承载） |
| .gitignore | 良好 | 可直接公开（若 PM 决定私有化 raw：追加 content/raw/** 排除） |

## 7. 分级清单（Classification）

**A. 可直接公开（无需修改）**
- 全部代码（apps/functions/packages/scripts 非 _* 文件）；AGENTS.md；.gitignore/.npmrc/.editorconfig/.gitattributes/pnpm-workspace/package*.json/tsconfig*；docs/SECURITY.md、docs/CONTENT_REVIEW.md、docs/DECISIONS.md、docs/ARCHITECTURE.md；content/laws（36）、content/cases（219，官方发布内容）、content/sources/registry.json（271）、content/sources/probe/*；cloudbaserc.json（含 envId；无 envVariables）；测试套件。

**B. 修改后可公开**
- content/cases（建议：README/NOTICE 增加来源与使用声明；审判人员姓名段是否保留 → PM 决策）；
- README.md（补许可、来源、免责、API 边界）；
- docs/PROGRESS.md、functions/api/scripts/build-deploy.mjs（清理 2 处本机路径为通用表述）；
- docs/CONTENT_REVIEW.md（补 raw 私有说明）；
- .gitignore（若执行双仓方案，明确 content/raw 排除）。

**C. 必须保持私有**
- content/raw/**（69 txt + 7 html 归档；其中 4 个 law 文本来自第三方聚合站「全球法规网」，其余为官方页副本；html 含第三方统计脚本——虽已忽略，当前树中 txt 仍被跟踪）；
- scripts/_*、_scratch/、deploy/、.env*、真实环境变量、本地凭据（当前均未跟踪/已忽略——保持现状即可）；
- 若公开仓库被 fork：不得包含上述任何私有文件。

**D. 无法确定 / 需 PM 决策**
- LICENSE 选择（MIT / Apache-2.0 / 自定义「代码开源+内容另行声明」）；
- content/raw 的去留方式（A. 保持私有、从公开仓库移除跟踪但保留本地/私有仓；B. 留在公开仓——不推荐；C. 私有内容源+构建注入）；
- 最高法指导性案例中真实姓名、案号、审判人员姓名的处理（保留官方原文 vs 脱敏）——涉及内容修改；
- GitHub 可见性变更时点与方式（整仓库公开 vs 先建公开组织/新仓再迁移——历史与 fork 影响）；
- 是否将本审计与「限流实现」纳入同一发布批次（公开后 API 滥用风险陡增，建议限流先行）。

## 8. Recommended Steps（执行建议；本轮未执行）

1. PM 决策：LICENSE 选择；content/raw 私有化方式；指导性案例真实姓名处理；公开时点。
2. 公开前完成：README 补正式内容（来源/许可/免责/API 边界）、NOTICE、本机路径清理（B 类）、限流实现（建议先行）并跑全门禁。
3. 公开动作本身（GitHub Settings → Public / 新公开仓迁移）由 PM 执行；建议先在私有仓做「公开预览」检查。
4. 公开后：分支保护（要求 PR + 状态检查）、依赖审计（pnpm audit）、安全披露（SECURITY.md 已可就绪）、Dependabot/Renovate 可选。
5. 明令不做：删除真实项目数据来让测试通过；公开前不做 GitHub 可见性变更；不部署；不改云资源；不绑定域名/ICP；不创建付费资源。

## 9. Commands And Exit Codes（本轮审计）

| 命令 | exit | 说明 |
|---|---|---|
| git status / rev-parse / show-ref / for-each-ref / count-objects | 0 | 基线核实 |
| git rev-list --all --objects + git cat-file 全量 blob 扫描（621 对象，13 种模式） | 0 | 0 真实密钥；32 命中均为误报并已逐项核验（§2.1） |
| git log --all 提交消息扫描 | 0 | 干净 |
| git status --ignored --porcelain + 未跟踪枚举 | 0 | 忽略覆盖良好；未跟踪 0 |
| content/ 分目录枚举与模式扫描（PII/跟踪脚本/第三方来源） | 0 | 见 §2/§3 |
| API 风险代码核查（app/http/config/ask/deepseek/shared 常量） | 0 | 见 §5 |

## 10. Guardrails

本轮未执行：修改 GitHub Visibility；删除或迁移完整内容库；重写 Git 历史；force push；部署 CloudBase；调用 DeepSeek；域名/ICP；创建付费资源。审计文档仅落地于新分支 chore/public-readiness-audit（main 未改）。