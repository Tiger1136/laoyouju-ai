# DEPLOYMENT.md —— 公网测试版部署记录与操作手册

> 本文件记录 CloudBase 公网测试版的部署方法、当前状态与回滚步骤。
> 当前为**公网测试版**：默认 CloudBase 域名（`*.tcloudbase.com`）仅用于测试，不作为正式域名。
> 独立域名、ICP 备案、正式搜索收录**尚未完成**；微信小程序**尚未开发**。

## 一、环境与认证

- 目标环境：`laoyouju-demo-d0g2c7d8sb319ddf3`
- 地域：`ap-shanghai`（上海）
- 套餐：体验版（免费；无付费资源、无按量计费）
- 环境状态：正常（创建 2026-08-27，到期 2027-02-27）
- 认证方式：仅使用 `tcb login` 的腾讯云浏览器/控制台授权（**未使用** SecretId/SecretKey）。
- CLI：`@cloudbase/cli@3.8.1`（官方 npm registry 精确锁定；以 `pnpm --package=@cloudbase/cli@3.8.1 dlx tcb ...` 运行，未修改全局 Node）。声明式配置：根目录 `cloudbaserc.json`（由 `tcb config init` 生成后按官方 schema 修改，未凭记忆发明字段）。

## 二、本地预检（Phase 6 前）

```bash
corepack pnpm run check           # lint + typecheck + build + test（shared 29 / retrieval 19 / api 48 / web 16）
corepack pnpm run content:validate # PASS（laws=9 / cases=9 / provisions=57）
corepack pnpm run retrieval:build  # OK（66 docs）
git diff --check                   # 通过
# 密钥/构建产物扫描：无真实密钥（唯一命中为服务端读取环境变量名 DEEPSEEK_API_KEY，非值）
```

## 三、Monorepo 云端打包（关键）

`functions/api` 依赖 `@laoyouju/shared`、`@laoyouju/retrieval`（workspace），不能直接依赖本机 pnpm symlink 上传。

打包方案：**esbuild@0.28.2**（最小、精确版本，仅作为 devDependency；原因是 CloudBase 云函数部署包不能携带 pnpm workspace symlink，需把运行时代码与依赖打成单文件）。

```bash
corepack pnpm -C functions/api run build:deploy
```

产物在 `deploy/api/`（已 `gitignore`）：
- `dist/server.js`：单文件 ESM bundle（约 585KB），包含 `functions/api` + `@laoyouju/shared` + `@laoyouju/retrieval` + `zod`；
- `content/laws/*.json`、`content/cases/*.json`：问答所需资料；
- `scf_bootstrap`：HTTP 函数启动脚本（`node dist/server.js`，监听 9000）；
- `package.json`：最小化（无 node_modules 依赖，`installDependency=false`）；
- `DEPLOY_PACKAGE.md`：目录说明。

本地验证（干净临时目录，`PORT=18777 node dist/server.js`）：
- `GET /api/v1/health` → 200；
- `POST /api/v1/ask`（无 Key）→ 503 `SERVICE_NOT_READY`；
- `POST /api/v1/ask`（无关问题）→ 200 `out_of_scope`（固定领域引导，不调用模型；Phase 7A 三态契约，已取代旧 `insufficient`）。

不携带：整仓库、node_modules、开发依赖、tests、.git、.env、缓存、.map。

## 四、当前部署状态（截至记录）

## 四、当前部署状态（截至记录）

**当前（PHASE_7B 201 例版，2026-08-28 本轮）**：

| 项 | 状态 |
|---|---|
| 云函数 | ✅ 已部署（更新 laoyouju-api；tcb fn deploy，cloudbaserc.json 无 envVariables，控制台环境变量未触碰） |
| 部署包 | esbuild 单文件 bundle（约 712KB，含 api+shared+retrieval+search+zod）+ content/laws(34) + content/cases(**201**) + content/sources/registry.json(251) + scf_bootstrap + 最小 package.json；本地干净目录验证通过（health/out_of_scope/纯标点/OPTIONS/evil） |
| 数据规模 | laws=34 / cases=**201** / provisions=1276 / registry=251（本地 content:validate PASS；线上 /cases 页面 402 个案例卡片标记 = 201 例×2（HTML+水合负载），证明线上为 201 例版而非旧 53/96 例版） |
| Web | ✅ 已部署（以真实 API 地址重建：NEXT_PUBLIC_API_BASE_URL=…service.tcloudbase.com；SITE_URL=真实测试域；65 个文件） |
| CORS | ✅ 预检 204 + 单值精确 ACAO=网站 Origin（网关单独输出，函数不叠加）；evil Origin 403 且不反射 |
| out_of_scope | ✅ 线上：支付宝提现手续费是多少 / 怎么做红烧肉 → 200 out_of_scope（固定助手文案、sources=0，不调用模型） |
| 真实 DeepSeek Smoke Test | ✅ answered（requestId 67ce95dc-9366-45a7-840e-40917c5bd010）：9 条 A 级法条（劳动合同法 §23/§24、解释一 §36–§40、解释二 §13/§14）+ 2 条 B 级官方案例（case-cy-ldzzy-2024-01-10、case-zgf-zdxal-2022-32pi-06），引用全部来自本次证据集；耗时约 15.9s（贴近预算，见备注） |
| 费用 | 真实 DeepSeek 调用：本轮 2 次（第 1 次响应未被本地脚本捕获、第 2 次为同问题重放完成验收；以腾讯云账单为准）；无付费资源 |

> 备注：同步耗时约 15.9s（模型超时 15s），处于链路预算边缘但成功；若后续出现 502/503 请优先检查模型配置与延迟（不读 Key）。

**上一轮（Phase 7A 新版，2026-08-28）**：

| 项 | 状态 |
|---|---|
| 云函数 | ✅ 已部署：`laoyouju-api`（`lam-hmez3r8t`；tcb fn deploy 更新，未触碰任何环境变量） |
| 部署包 | 新版（含同步延迟修复，2026-08-28 二次部署）：esbuild 单文件 bundle（约 690KB，含 functions/api + shared + retrieval + **search** + zod）+ `content/laws`(34) + `content/cases`(53) + **`content/sources/registry.json`**（Phase 7A 运行时必需）+ scf_bootstrap + 最小 package.json |
| 运行时 | Nodejs20.19；256MB；60s（函数总超时未改）；installDependency=false |
| HTTP 访问 | ✅ `/api` 网关路由；公网 API `https://laoyouju-demo-d0g2c7d8sb319ddf3.service.tcloudbase.com` |
| 环境变量 | 未修改（cloudbaserc.json 无 envVariables；DEEPSEEK_API_KEY 由用户在控制台维护；WSA_API_KEY 未配置 → 联网搜索未启用） |
| Web 静态站点 | ✅ 已部署（以真实 API 地址构建）：`https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`（/、/laws、/cases、/topics、/ask、sitemap、robots 全部 200） |
| 数据规模 | laws=34 / cases=53 / provisions=1276 / topics=19 / registry=103（公网公开页与 API 内容库一致） |
| 三态应答 | answered / needs_clarification / out_of_scope 全部上线；`/api/v1/ask` 线上验证：红烧肉→out_of_scope（固定助手文案、sources=0）；"工伤"→needs_clarification（3 条 A 级来源、《工伤保险条例》框架）；纯标点/空白/超长→400 |
| CORS | 预检 204 + **单值精确 ACAO = 网站 Origin**；evil Origin 403 且不反射；网关模式（函数不再叠加 CORS 头） |
| 真实 DeepSeek Smoke Test | ✅ **已通过**（PHASE_7A_LIVE_MODEL_LATENCY_FIX 修复后，2026-08-28）：唯一一次正式调用（“公司书面通知违法解除我，工作3年，解除前月工资8000元，未与我协商，我可以主张哪些补偿或赔偿？”）→ **200、耗时 8.4s**（修复前同期问题 502/约 20s）、outcome=answered、八段结构完整、5 项引用全部为 A 级官方来源、无旧文案/无密钥泄露。修复要点：`thinking:{type:"disabled"}`、模型超时 45s→15s、max_tokens 1800→1300、prompt 仅要求 answer 结构（消除双份输出）、needs_clarification 改为调用前确定性分支（不调用模型）。此前一次 502 为思考模式+双份输出导致的真实延迟问题，**已定位根因并修复**，非“瞬时网络波动”笼统归因 |
| 费用 | 无付费资源创建/升级；真实 DeepSeek 调用共 2 次（1 次失败 502 + 1 次成功，以腾讯云账单为准） |

**此前状态（Phase 6）**：

| 项 | 状态 |
|---|---|
| 云函数 | ✅ 已部署：`laoyouju-api`（`lam-hmez3r8t`） |
| 运行时 | Nodejs20.19 |
| 内存 | 256 MB |
| 超时 | 60 s |
| 依赖安装 | `installDependency=false`（已打包） |
| HTTP 访问 | ✅ `/api` 网关路由已收敛；公网可访问（`POST /api/v1/ask`、`GET /api/v1/health`） |
| 环境变量 | ✅ `ALLOWED_ORIGINS`/`WEB_ALLOWED_ORIGIN` = 网站 Origin；`DEEPSEEK_API_KEY` 已由用户在控制台配置（CLI 不再设置/覆盖环境变量） |
| Web 静态站点 | ✅ 已部署：`https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com` |
| 真实 DeepSeek Smoke Test | ✅ **已通过**（9 部规范/9 案例时代的单次问答；citations=6、四段结构、无虚构/无密钥） |
| 费用 | 少量真实 DeepSeek 调用（单次问答，无重试循环） |

⚠️ 关键教训/注意（已修复）：
- CloudBase CLI `tcb fn deploy` 在 `cloudbaserc.json` 指定 `functions[].envVariables` 时会**整体替换**该函数环境变量（非合并）。因此**不要**再用 CLI 设置含 `DEEPSEEK_API_KEY` 之外的环境变量；非敏感 CORS 变量与 Key 均由用户在控制台维护。`cloudbaserc.json` 当前**不含** `envVariables`。
- 部署包内容目录需能被运行时定位：`packages/retrieval` 的 `resolveContentRoot` 在 cwd 查找失败时会回退到「与部署包 `dist/` 相邻的 `../content`」，保证云端能稳定加载 `content/`（曾导致偶发 `insufficient`，已修复并复验）。

### 公网地址
- 网站：`https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`
- API：`https://laoyouju-demo-d0g2c7d8sb319ddf3.service.tcloudbase.com`（`/api/v1/ask` 由网关转发到函数；函数内已将 `/api/v1/*` 与网关剥离前缀后的 `/v1/*` 都归一化处理）
- CORS：`ALLOWED_ORIGINS`/`WEB_ALLOWED_ORIGIN` = `https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`（精确、非 `*`；已验证允许 Origin 200、`evil` 403）。
- 浏览器跨域修复：CloudBase 网关与函数**同时**输出 `Access-Control-Allow-Origin` 时会组合成 `origin,origin`（重复 ACAO），导致浏览器 CORS 校验失败（前端表现为“暂时无法连接到问答服务”）。已修复：`functions/api` 检测到网关转发（请求头含 `X-CloudBase-Request-Id`/`X-CloudBase-Session-Id`）后**不再输出 CORS 头**，由网关单独输出单值 ACAO；本地直连仍保留函数自带 CORS。重新部署后已验证：预检 204 与实际 POST 均为**单值精确 ACAO**，`POST /api/v1/ask` 返回 `answered`。

### 线上行为（非 DeepSeek 校验均通过）
- `GET /api/v1/health`：200（含允许 Origin 时 ACAO=该 Origin）。
- 空输入 / 超长输入 / 纯标点：400 `INVALID_REQUEST`。
- 无关问题（如“怎么做红烧肉”）：200 `out_of_scope`（固定领域引导，不调用模型、不调用联网搜索；旧 `insufficient` 语义已废除）。
- `/ask`：noindex,nofollow；sitemap 不含 `/ask`；robots 禁止 `/ask`。
- 首页、`/laws`、`/cases`、`/topics`、`/ask` 均可公网访问；默认域名未出现阻断的安全提示页（首页正常加载）。

### 已知问题 / 备注
1. 默认域名（`*.tcloudbase.com`/`*.tcloudbaseapp.com`）仅适用于测试；独立域名、ICP 备案、正式搜索收录、小程序均未完成。
2. sitemap/robots 的 metadata 使用**真实测试域** `NEXT_PUBLIC_SITE_URL=https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`（当前部署；独立域名/正式 SEO 不在本阶段范围）。
3. CloudBase 网关对预检 OPTIONS 反射 Origin；`Vary` 中 `Accept-Encoding` 可能重复（网关层），不影响 CORS 判定；`Access-Control-Allow-Origin` 已确保**单值精确**（网关单独输出，函数不再叠加）。


## 五、部署操作（复现方法）

1. `corepack pnpm run check`（全量校验）。
2. `corepack pnpm -C functions/api run build:deploy`（生成 `deploy/api`：esbuild bundle + content/laws + content/cases + **content/sources/registry.json** + scf_bootstrap + 最小 package.json）。
3. 配置 `cloudbaserc.json`（envId、functionRoot=./deploy、runtime=Nodejs20.19、timeout=60、memorySize=256、type=HTTP、gatewayPath=/api、installDependency=false；**不得包含 envVariables**）。
4. `corepack pnpm --package=@cloudbase/cli@3.8.1 dlx tcb login`（浏览器授权）。
5. `corepack pnpm --package=@cloudbase/cli@3.8.1 dlx tcb fn deploy api --yes`（部署/更新云函数 + 收敛网关路由；**不会**改动控制台环境变量）。
6. 环境变量 `DEEPSEEK_API_KEY`（用户在控制台维护；本次部署未修改）。
7. Web：以真实 API 地址设置 `NEXT_PUBLIC_API_BASE_URL=https://laoyouju-demo-d0g2c7d8sb319ddf3.service.tcloudbase.com`（和 `NEXT_PUBLIC_SITE_URL=https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`）后 `next build`，`corepack pnpm --package=@cloudbase/cli@3.8.1 dlx tcb hosting deploy apps/web/out` 静态托管。
8. 精确 CORS 配置（控制台维护，未修改）；执行一次真实 Smoke Test（2026-08-28 修复后已通过：200 / 8.4s / answered / 5 项 A 级来源）。

## 六、回滚与重新部署

- **回滚**：如需下线或回退，删除/停用 `laoyouju-api` 云函数即可（本阶段未创建数据库/云托管/其他资源，删除成本为零）。Web 静态托管可直接覆盖或删除。
- **重新部署**：按"五、部署操作"重新执行；`tcb fn deploy api` 为幂等更新。

## 七、注意事项 / 待办

- 公网测试版域名仅用于测试；独立域名、ICP 备案、正式搜索收录待后续（本阶段不绑定/不备案/不提交）。
- 匿名访问：本次采用“独立 API 地址（`service.tcloudbase.com`）＋ 精确 CORS”路线；未使用 `public: true` 的 OPA authz（因其在体验版返回 `policy_syntax_error`）。CORS 已精确到站点 Origin（非 `*`）。
- 所有资料为 `source_verified`（`legal_reviewed=0`）；本阶段为个人简历演示版，不声称专业法律服务、律师审核、正式商用或已上线。