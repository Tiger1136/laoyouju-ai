# 劳有据 AI（Laoyouju）

> 劳动问题，回答有依据。

## 一句话说明

劳有据 AI 是一个面向中国劳动争议场景的问答产品：用户提出劳动争议问题，产品基于审核过的法律法规与案例资料、由 DeepSeek 生成带可核验来源的回答，覆盖微信小程序与可被搜索引擎收录的网页端。

## 当前状态


**2026-09-05 Phase 9：腾讯云轻量应用服务器迁移适配（当前分支 fix/shared-model-budget，未合并、未部署；结果 PARTIAL / BLOCKED_AT_SECURE_SSH）**：
- 新增 SQLite 本地持久化预算存储（`functions/api/src/sqlite-budget.ts`，better-sqlite3@12.11.1；WAL+FULL、事务内条件更新原子、唯一租约+到期回收、释放幂等、重启保留每日用量、损坏/不可用/写失败→模型调用安全失败，绝不静默内存降级）；`BUDGET_STORE=sqlite|cloudbase` 显式选择，缺失/非法/memory → 安全失败；`CloudbaseBudgetStore` 与旧部署方案原样保留；
- VPS 适配：`HOST`（默认 0.0.0.0 保留 CloudBase；VPS 显式 127.0.0.1 仅回环）、`TRUSTED_PROXY` 信任边界（仅本机 Nginx 的 X-Forwarded-For 被采用；Nginx 以 `$remote_addr` 覆盖外部自发转发头）、前端默认同源 `/api/`（不硬编码公网 IP/域名）；
- 部署材料：`deploy/vps/`（Nginx/systemd/环境变量示例/安装-发布-备份-恢复-回滚-健康检查-公网验证-防火墙脚本 + 手册），专用 laoyouju nologin 用户、分离目录、journald 轮转；不配置域名/HTTPS；
- 门禁：`pnpm run check` exit 0（api 67 + cases 14 + limit 12 + sqlite-budget 14 + web 13+export；content 36/219/1308/271；静态导出 15 路由）；sqlite 形态与服务端部署包本地冒烟通过（health/out_of_scope/400/503/伪造 XFF 不绕过）；产物与 Git 差异无密钥/公网地址；
- 因本机无用户预先配置的安全 SSH 入口（无别名/指纹），未执行服务器部署与公网验证；未删除 CloudBase、未动 DNS/域名/证书、未购买资源、未调用真实 DeepSeek。用户侧唯一待办：按 `deploy/vps/README.md` 完成最小安全 SSH 配置后执行 sync-src/install/publish/healthcheck/verify-public。
**2026-09-05 Phase 9A：正式部署前阻断问题整改（工作树保留 Phase 9 全部修改；未部署）**：
- Nginx 敏感路径正则修复（锚定 ^/ 且转义；/api/、/laws/、/cases/、/ask/ 与 /.well-known/ 不受影响；.env、.git、SQLite 拒绝）；
- install.sh 适配 OpenCloudOS Server 9（conf.d 布局检测、与 Debian sites-enabled 双兼容、80 端口冲突安全停止、nginx enable --now + active 断言、SELinux Enforcing 最小策略【httpd_sys_content_t + restorecon + http_port_t:9000，绝不关闭】）；nginx/rsync/sqlite3/curl/tar 相互独立安装；
- systemd ExecStart 注入 Node 真实绝对路径（不再假设 /usr/bin/env node；/root 私有目录安全失败）；healthcheck 显式 exit 0/1 并有契约测试；
- HOST 失败开放修复：显式非法 → 进程拒绝启动（listen.ts + 5 项测试）；SQLite quick_check 结果必须 ok、初始化失败关闭连接（+结果判定测试）；
- 备份仅 SQLite 在线 .backup＋强制完整性校验（去掉复制代替方案）；恢复前校验备份、保存当前副本、健康失败自动回滚；
- Windows 开发机：sync-src.ps1（git 清单＋系统自带 ssh/scp/tar，含未跟踪 Phase 文件、排除敏感/缓存、finally 清理）与 verify-external.ps1（外部公网验证、IP 脱敏、正确/恶意 Origin、伪造 XFF、9000 外部不可达）；
- 首次公网部署 LIMIT_KILL_SWITCH=on、DEEPSEEK_API_KEY 留空（真实模型测试另行授权）；文档命令全部修正（`ssh laoyouju_lh` 等）；
- 新增 deploy/vps/tests/deploy-config.test.mjs（16 项契约测试，随 `pnpm run check` 执行）；`pnpm run check` exit 0；Windows 本机实测 tar 清单打包（502 文件：Phase 9/9A 全部包含、敏感/缓存全部排除）与两个 .ps1 的 PowerShell 5.1 语法解析通过；
- **未登录服务器、未部署；OpenCloudOS 实机执行未验证（如实标记）**；Phase 9 整体仍为 PARTIAL（服务器迁移未完成）。

**Phase 6 已完成（CloudBase 公网测试部署 + 真实 DeepSeek Smoke Test）**：已建立可审计内容 schema、首批真实全国性官方资料、确定性 n-gram/BM25 检索、服务端 DeepSeek 生成（引用校验）、Web `/ask` 真实问答，并已部署公网测试版。

- `packages/shared`：共用 API v1 契约（zod 运行时校验），回答结构为「初步说明 / 相关依据 / 下一步 / 信息边界 + AI 生成标识」，来源附带 citationRef/excerpt/reviewStatus；
- `packages/retrieval`：内容 schema、加载、全局校验、n-gram/BM25 检索（确定性关键词/意图/话题加权），`MIN_RELEVANCE_SCORE` 用于决定是否发起联网搜索与话题兜底（不再用于“资料不足拒答”）；内容根定位带「与部署包 `dist/` 相邻的 `../content`」兜底；
- `functions/api`：CloudBase HTTP 云函数（Node 原生 http + 原生 fetch），`POST /api/v1/ask` 执行「领域判定 → 检索（本地知识库 + 可选联网检索线索）→ 证据组织 → DeepSeek 生成 → 引用校验 → 结构化响应」，回答状态为三态 `answered`（八段结构与可核验来源）/ `needs_clarification`（法律框架+可能结论+需补事实+证据清单）/ `out_of_scope`（固定领域引导，不调用模型）；
- `apps/web`：`/ask` 真实问答页（三态结果展示、限流/配置缺失/服务异常等稳定错误态、可核验官方来源分组展示与如实核验状态），`/ask` noindex 且不进入 sitemap；
- 内容库：`content/laws/*.json`（36 部：34 部全国性规范 A 级 + 2 部山东地方裁审指引 C 级）、`content/cases/*.json`（219 个官方案例，1308 条条文），`source_verified`。

**公网测试版（已部署，使用默认 CloudBase 测试域）**：
- 网站：`https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`
- API：`https://laoyouju-demo-d0g2c7d8sb319ddf3.service.tcloudbase.com`（`POST /api/v1/ask`）
- 真实 DeepSeek Smoke Test：已通过（`outcome=answered`、四段结构、引用来自检索、无虚构/无密钥）；CORS 精确白名单已配置（非 `*`）。

**说明**：`source_verified` 用于明确标注的个人简历演示版，`legal_reviewed=0` 如实展示（已核对官方来源、尚待专业复核，不冒充律师审核）。默认 CloudBase 域名仅供测试；**未购买域名、未 ICP 备案、未做正式搜索收录、小程序未开发**。

**2026-08-28 更新**：Phase 7A 新版已部署公网测试版（34 部规范 / 53 个官方案例 / 1276 条条文 / 19 主题；三态回答 answered / needs_clarification / out_of_scope；联网搜索（WSA）仍未启用）。**真实 DeepSeek Smoke Test 已通过**：修复同步延迟根因（显式关闭思考模式 `thinking:{type:"disabled"}`、模型超时 45s→15s、输出上限 1300 tokens、调用前确定 needs_clarification 分支不再让模型双份输出）后，真实调用返回 **200 / 8.4s / answered / 5 项 A 级官方来源**（此前一次 502 约 20s 即思考模式+双份输出导致的真实延迟问题）。

**2026-08-28 Phase 7C-1 来源分级整合（当前分支 feat/shandong-official-corpus，未合并、未部署）**：
- **18 例山东官方案例与 2 份山东地方裁审指引已验收**；原 30～50 例目标不再作为本阶段硬门槛，剩余山东官方批次列入持续扩充 backlog（不再继续抓取/拆分/补写案例）；
- **权威层级区分（A/B/C）已产品化**：A=全国性法律规范（法律/行政法规/司法解释等，法律结论的唯一依据）；B=官方案例（类案参考，无普遍约束力）；C=地方裁审指引（山东省高院/省人社厅会议纪要、诉讼指引，仅适用山东省，非全国统一规则）；
- **API**：来源卡片新增 `sourceTypeLabel`/`sourceLevelLabel`/`topicIds`，回答新增可选 `localGuidance`（只放 C 级山东指引）；`applicableLaw` 只放 A 级，`similarCases` 只放 B 级案例（契约层+引擎层双重强制）；地点明确非山东时本地指引不出现，地点未知时使用条件化表述“如争议发生在山东，可参考……，其他地区裁审口径可能不同。”；
- **Web**：/laws 分区展示“国家法律法规与司法解释（A 级）”与“地方裁审参考（C 级，仅山东省）”；/cases 区分山东省官方案例并标注发布机关/适用地域；/ask 国家法律、山东地方指引、官方案例使用不同标题与文字标签；/ask 保持 noindex，sitemap/robots 不变；
- **门禁全绿**：content:validate（36/219/1308/271）、retrieval 33/33、case-corpus 14/14、shared 37/37、api 48/48、web 32/32、search 16/16，`pnpm run check` exit 0，`git diff --check` exit 0。

**2026-08-29 更新：Phase 7C 219 例版已合并至 main 并部署上线（CloudBase 体验环境，默认测试域名；仍为测试版，未做正式搜索收录）**：
- 18 例山东官方案例、2 份山东 C 级地方裁审指引随 219 例版上线；A/B/C 产品级分层（法律=唯一依据 / 案例=类案参考 / 山东指引=仅山东、非全国规则）在 API 与 Web 生效；
- 真实 DeepSeek Smoke Test 通过（唯一 1 次调用）：HTTP 200 / answered / 13.7s，applicableLaw 6 条全 A 级 + localGuidance C 级山东指引（明确仅适用山东、非全国统一规则）+ 八段结构完整、引用全部可解析；
- 线上 /cases 唯一 caseId=219（山东 18）、/laws 唯一规范=36；CORS/SEO/out_of_scope/400/413 安全规则全部通过；
- 标签 phase-7c-shandong-219 已创建；山东剩余官方批次为持续扩充 backlog。

**2026-08-29 Phase 7C.2 更新：官方案例证据共现已修复并上线（main 30d066c，标签 phase-7c2-case-copresence）**：
- **根因**：similarCases 只依赖模型主动引用案例；线上竞业限制 Smoke Test 时模型写「未找到可核验的高度相似官方案例」占位，而证据中其实已有 3 条 B 级官方案例（S8～S10）；同地域山东竞业案例（case-sd-ldzzy-2021-04-02）还在主检索 top10 池之外，引擎缺少确定性补充。
- **修复**：新增 functions/api/src/cases.ts 确定性组装模块，并在 ask.ts 第 9.5 步集成、微调 prompt 提示；similarCases 由引擎统一组装——先验证模型引用（B 级 + case + topicIds 交集），再从主检索池与按推断 topicIds 的确定性补充检索（topK=20）收集合格候选，按「话题交集 > 同地域 > 全国性 > 其他省份 > 分数」确定性排序，最多 2 条；地域只作排序偏好、绝不硬过滤。
- **边界说明（引擎生成，不依赖模型）**：全国性案例=「全国性参考案例，供类案参考；案例不具有普遍约束力」；同地域案例=「（X省官方案例，供类案参考；案例不具有普遍约束力）」；外地案例=「（案例适用地域：X；外地类案仅供参考，各地裁审口径可能不同）」。
- **共现契约**（answered + 已推断主题 + 合格 B 级候选 → similarCases ≥ 1 条 B）：evaluateCopresenceContract 为共享断言（引擎 + 测试双端使用）；只有全部 219 例确无合格候选时才允许诚实占位。
- **测试**：api 48→60（新增 12 项：山东/未知地域/北京竞业限制、违法解除、克扣提成、加班、工伤、二倍工资、劳务派遣 A+B 共现，支付宝提现 out_of_scope 零调用零来源，模型引用验证+确定性排序，双次运行结果一致）；新增 cases.test.mjs 14 项（地域归一化/排序/边界文案/候选收集/契约/确定性/负向，合成内容库不绑定 sourceId）。
- **门禁全绿**：content:validate（36/219/1308/271）、retrieval 33/33、case-corpus 14/14、shared 37/37、api 60/60 + 14/14、web 32/32、search 16/16，`pnpm run check` exit 0，`git diff --check` exit 0。
- **线上验收**：_verify-live 36/36 通过；真实 DeepSeek Smoke Test 仅 1 次调用：HTTP 200 / answered / 14.593s，applicableLaw 6 条全 A（全国性）+ localGuidance 1 条 C 级山东指引 + similarCases 2 条 B 级（山东同地域案例【引擎补充】＋四川/重庆案例【模型引用，注明适用地域与「外地类案仅供参考」】），引用全部可解析、无虚构、无密钥、无堆栈。

**仍未完成**：小程序端（Phase 1D 延后）、独立域名/备案/正式搜索收录（Phase 7）、内容专业复核；当前为默认测试域名与体验环境；独立域名/ICP 未完成。

**下一阶段**：Phase 7 —— 小程序开发与搜索收录（独立域名/ICP 待办）。

产品当前为公网测试版，未宣称正式商用/已上线。

## 产品终端

- 微信小程序（首版终端之一，暂缓至 Web 端到端跑通之后）
- 可被搜索引擎收录的网页端（公开内容静态生成，私人问答不参与 SEO）

## 暂定技术架构

- Monorepo：pnpm workspace
- `apps/web`：Next.js，静态导出，公开内容支持 SEO；`/ask` 调用后端 API
- `apps/miniprogram`：微信小程序（原生；暂缓）
- `functions/api`：CloudBase 云函数（Node.js/TypeScript），唯一调用 DeepSeek 的入口
- `packages/shared`：共享数据结构、校验规则与 API 类型
- `packages/retrieval`：内容 schema、内容加载、校验与 n-gram/BM25 检索
- `content/`：审核后的法律法规、案例与公开问答材料（真源）
- `scripts/`：内容入库与校验工具

详细见 `docs/ARCHITECTURE.md`。

## 服务端 / Web 环境变量

- `DEEPSEEK_API_KEY`：仅服务端，严禁进入前端/日志/Git；未配置时 `/ask` 返回 503。
- `DEEPSEEK_BASE_URL`（默认 https://api.deepseek.com）、`DEEPSEEK_MODEL`（默认 deepseek-v4-flash）。
- `ALLOWED_ORIGINS` / `WEB_ALLOWED_ORIGIN`：服务端 CORS 白名单。
- `NEXT_PUBLIC_API_BASE_URL`：Web 端读取的 API 基地址（公开地址，非密钥）；未配置时 `/ask` 显示“服务尚未配置”。
- `NEXT_PUBLIC_SITE_URL`：SEO metadata 用（公开变量）。

## 尚未完成的功能

- 真实 DeepSeek 联调与云端 smoke test（Phase 6，当前无真实 Key）
- CloudBase 部署（Phase 6）
- 小程序端业务页面（Phase 1D 延后）
- 内容专业复核（当前为 `source_verified`）

## 内容库与检索命令

```bash
corepack pnpm run content:validate   # 校验内容库
corepack pnpm run retrieval:build    # 生成可复现的 BM25 索引（content/.index/index.json）
corepack pnpm run retrieval:query "<问题>" [topK] [topicId]
```

详见 `docs/CONTENT_REVIEW.md`、`docs/ARCHITECTURE.md`、`docs/SECURITY.md`。

## 成本原则

一切以最低现金支出为原则：

- 不购买独立服务器；优先采用腾讯云 CloudBase（Serverless）；
- 不使用香港或境外节点；
- 第一版不购买向量数据库、不接入付费 embedding API；
- 第一版不开发原生 App、不做支付、文件上传、复杂用户系统和运营管理后台。

## 安全原则

- 网页和小程序不得直接调用 DeepSeek；API Key 只存在于服务端环境变量；
- 不输出胜诉率、不冒充律师、不承诺案件结果；
- 不自动采集姓名、身份证、公司全称等非必要信息；
- 限制问题长度、调用频率和单次输出；
- 详细见 `docs/SECURITY.md`。

## 本地工具要求

- Node.js ≥ 20 且 < 25（本机当前为 24.x；生产云函数运行时为 Nodejs20.19）
- pnpm（经 Corepack 启用并锁定版本，见 `package.json` 的 `packageManager`）
- Git ≥ 2.x
- 微信开发者工具（开发小程序端时）

## 后续文档索引

- `docs/PROJECT_SCOPE.md` —— 首版范围与职责划分
- `docs/ARCHITECTURE.md` —— 架构与数据流
- `docs/DECISIONS.md` —— 决策记录（ADR）
- `docs/SECURITY.md` —— 安全要求
- `docs/PROGRESS.md` —— 阶段进度