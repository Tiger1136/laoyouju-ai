> 结果：**PASS**。仅文档收口与本地提交；未登录/修改服务器，未调用 DeepSeek，未修改 DNS/域名/证书/备案/CloudBase/防火墙或任何云资源，未触碰远端 Git。

- **SSH 别名统一**：全部面向用户的命令/示例/脚本注释统一为 `laoyouju_lh`（README.md、docs/DEPLOYMENT.md、docs/PROGRESS.md、deploy/vps/README.md、deploy/vps/scripts/sync-src.ps1、verify-external.ps1、sync-src.sh）；服务器真实备份目录 `/root/laoyouju-lh-backup-<ts>/` 为实际路径，保持原名；未修改本机 SSH 配置。
- **冒烟引用表述修正**：Phase 9C 记录改为准确表述——可追溯来源 9 条（A=6/B=2/C=1）；正文引用号为 S1–S8 与 S10（S9 未在正文引用）；所有被引用的引用号均在 sources 中可解析（unresolvedRefs 为空）。
- **防火墙人工验收事实（脱敏）**：用户已在腾讯云控制台人工确认入站规则为 22、80、443 与 ICMP；未开放 9000；未对云防火墙执行任何修改（记录于 PHASE_9B 记录与本文档）。
- **变更范围审计**：相对 HEAD 的全部修改与未跟踪文件均属于 Phase 9 系列（VPS 迁移/SQLite 预算/代理信任边界/部署材料与契约测试/阶段文档）；无真实 Key、公网 IP、实例 ID、密码/私钥或凭据（仅 127.0.0.1/0.0.0.0/RFC 测试网段字面量）；CloudBase 回退方案（shared-budget.ts、cloudbaserc.json、build:deploy）未删改；无 Docker/Redis/云数据库/CDN/监控等组件；无商业化设计。Node 监听：HOST 显式 127.0.0.1（VPS），默认 0.0.0.0 保留 CloudBase 兼容；SQLite 预算失败关闭（STORE_ERROR→429，绝不回退内存）。
- **本地提交（本轮唯一 Git 变更）**：`feat: deploy VPS runtime with SQLite model budget`（本地提交，未 push/merge/rebase/tag/force push；HEAD 之前为 e295a80）。
## PHASE_10A_OPEN_SOURCE_RELEASE_PREP（GitHub 开源发布前整理，2026-09-07）

> 结果：**PASS（本地整理完成）**。仅本地提交；未 push、未 merge、未创建/修改 tag、未修改 GitHub 仓库可见性与元数据、未操作服务器/模型/云资源、未调用真实 DeepSeek。

- **README 公开版重写**：删除全部 Phase 开发记录/过期状态/旧 CloudBase 测试地址/失效待办；改为面向首次浏览者与面试官的说明（简介→截图→能做什么→如何工作→数据范围→技术实现→本地运行→VPS 部署入口→使用边界→许可与内容来源）；详细过程仍保留于本文件，未复制进 README；无在线演示地址（域名未备案，留待后续）。
- **界面截图（4 张，docs/images/）**：screenshot-home / screenshot-laws / screenshot-cases / screenshot-ask.png（2560×1800 PNG，350–650KB；PNG 仅含 IHDR/IDAT/IEND，无 EXIF/元数据）。全部来自本地服务：apps/web 静态导出 + 本机 API（BUDGET_STORE=sqlite、TRUSTED_PROXY=127.0.0.1）+ 本地 Mock DeepSeek（OpenAI-compatible 回显，未访问任何线上模型）；问答页为真实引擎输出（A/B/C 分级与引用均可解析），README 明确标注“本地运行，Mock 模型生成”示例，未冒充线上真实调用；截图无地址栏/requestId/密钥/个人信息。
- **LICENSE + NOTICE**：LICENSE 为 OSI 标准 MIT 文本（版权行 Copyright (c) 2026 Tiger1136），未加任何附加条款；新增 NOTICE.md 说明：MIT 仅覆盖本项目作者编写的软件源代码；content/ 下法规/案例/官方文件摘录/第三方资料（含 content/raw 归档）不在 MIT 范围，权利与使用条件以原发布机关、原始来源和适用规则为准；来源链接与结构化整理不代表对原文的再授权；未自行给任何法规/案例/第三方资料添加许可证；README 的 License 部分链接 NOTICE。
- **脱敏（当前树 4 处）**：docs/PROGRESS.md 3 处开发机绝对路径（Phase 0 工作目录、corepack 安装目录、9A.1 输出行仓库路径）→ 通用表述；functions/api/scripts/build-deploy.mjs 头注释 1 处 → `<仓库根>`。历史 blob 未改写（禁止重写历史；相关说明见审计记录）。
- **完整 Git 历史敏感审计（13 提交 / 全引用 / 575 个唯一 blob 全量展开扫描）**：0 条真实凭据、0 条真实个人敏感信息、0 个真实服务器公网 IP/实例标识。命中项全部核验：①手机号样式 5 处 = content 法条 JSON 的 textSha256/contentHash 十六进制子串（误报）；②Bearer 1 处 = packages/search/tests/search.test.mjs 的 WSA mock fixture 占位值（wsa-*，非密钥）；③公网 IP 样式 20 处 = functions/api/tests/limit.test.mjs 合成客户端 IP（1.2.3.4/5.6.7.8/9.9.9.9/3.3.3.3）与 listen.test.mjs 单元用例；④Git 作者 = Tiger1136 + GitHub noreply 邮箱（无个人邮箱泄露）；⑤无 GitHub Actions/.github（无工作流/日志/产物可查）；⑥无 .env/凭据/SSH 私钥/证书文件入库；⑦依赖锁文件为官方 registry。
- **公开前待处理风险（如实上报，非本轮阻断）**：①docs/ARCHITECTURE|DECISIONS|DEPLOYMENT.md、deploy/vps/README.md、cloudbaserc.json 仍含旧 CloudBase 测试域地址、环境标识（*.tcloudbase.com / *.tcloudbaseapp.com，含函数实例标识）——不属于密钥，但旧函数节点可能仍启用模型；旧环境是否停用/保留限流由 PM 决策（本轮未登录/未修改 CloudBase）；②content/raw 含 4 份来自第三方聚合站点（全球法规网）的法律文本镜像归档（对应 JSON 真源 officialUrl 均为官方站点）——与“只收官方来源”政策不符，属内容来源许可细节，保留+NOTICE 边界，是否移除由 PM 决策（删除不改写历史）；③历史 blob 仍含上述脱敏前的开发机路径与旧 README 内容（重写历史被禁止，公开后可见）；④最高法指导性案例按官方发布体例含当事人真实姓名/出生日期/审判人员姓名（官方司法公开信息，非本仓库私有数据）；⑤content 案例正文含官方网站页脚（ICP 备案号/公网安备/网站标识码等公共官方元数据）。
- **公开范围审查**：无服务器凭据/个人资料/未授权第三方代码/超大文件（最大 244KB registry.json）/临时构建产物（out/.next/dist/deploy/api/索引均被忽略）/测试数据库/预算 SQLite 文件（未跟踪）/本地缓存/真实问答日志/商业化系统；AGENTS.md 无内部敏感信息；无 CI/CD、Docker/K8s、Sponsor、Code of Conduct、Issue 模板、英文 README、发布包等新增物。
- **验证（exit 0）**：`corepack pnpm run check` 全绿（lint/typecheck/content:validate 36/219/1308/271/retrieval:build 1527/build/全部测试含 deploy-config 19）；`git diff --check` 0；README 本地链接与图片链接 10/10 可解析；工作树敏感扫描 0 阻断；图片可见内容与元数据检查通过。
- **本轮唯一 Git 变更**：本地提交 `docs: prepare repository for open source release`（未 push/merge/rebase/tag/force push；前序提交 ef154cd 未动）。
