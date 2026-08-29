# SECURITY.md —— 安全要求

## 密钥管理

- DeepSeek API Key 只能存在于服务端环境变量（云函数端，`DEEPSEEK_API_KEY`）；
- Key 严禁进入：网页构建产物、小程序代码、日志、测试快照、Git、截图；
- 本地 `.env` 文件由 `.gitignore` 强制忽略，仅 `.env.example` 可入库且不得含真实密钥；
- 云函数环境变量不得写入日志；调试输出必须脱敏。

## DeepSeek 调用安全

- 仅 `functions/api` 服务端调用 DeepSeek；浏览器端不持有任何 Key。
- 使用 `DEEPSEEK_BASE_URL`（默认 https://api.deepseek.com）与 `DEEPSEEK_MODEL`（默认 deepseek-v4-flash，不使用已弃用旧模型名）。
- 请求采用 OpenAI-compatible `/chat/completions`，原生 `fetch`（不引入 SDK）；设置超时与 `max_tokens` 上限；单次调用、不自动重试（避免重复扣费）。
- 缺 API Key → 503 `SERVICE_NOT_READY`（不泄露环境变量）；上游 429 → 503 `RATE_LIMITED`；超时/5xx → 502 `UPSTREAM_ERROR`（均为稳定、安全、不泄露内部细节的错误响应）。

## 联网搜索（WSA）密钥与调用安全（Phase 7A）

- 协议与实现依据腾讯云官方文档（唯一依据）：https://cloud.tencent.com/document/product/1806/130615 ——
  `POST https://api.wsa.cloud.tencent.com/SearchPro`，`Authorization: Bearer ${WSA_API_KEY}` + `Content-Type: application/json; charset=UTF-8`，
  Body `{ "Query": "...", "Cnt": 10|20|30|40|50 }`；响应取自 `Response.Pages`（元素为 JSON 字符串，逐项安全解析）。
  自造字段（SearchType/Limit/ResultItems）与非官方鉴权头（X-Wsa-Api-Key）已移除；
- 腾讯云联网搜索“服务 API KEY”只存在于服务端环境变量 `WSA_API_KEY`；绝不写入源码、Git、前端、日志或报告；
- 未配置 `WSA_API_KEY` 时 provider=undefined，本地知识库仍可工作（不发起任何联网调用）；
- Key 只拼进 `Authorization` 头，不进入 URL、请求体或日志；
- 每个问题最多调用两次联网搜索（服务端预算 `MAX_SEARCHES_PER_QUESTION=2`）；
- WSA 错误/超时/限流（429）/5xx/畸形响应全部类型化捕获，不阻断本地知识库回答；
- 搜索结果必须经过 URL（HTTPS+官方域名白名单）、来源等级、发布时间与内容一致性校验后才能进入证据集；
  校验失败的结果一律丢弃；
- 搜索摘要不得当作完整法条使用（只可作为 C 级“补充线索”引用，供用户核验）；
- 公众号/小红书/抖音/搜索引擎结果页等域名在白名单黑名单之外，一律拒绝进入证据集；
- Phase 7A 阶段不配置真实 WSA、不做任何真实联网搜索调用、不产生费用；测试全部使用 mock fixture。

## 客户端与服务端边界

- 网页和小程序不得直接调用 DeepSeek，只能通过云函数 HTTP 接口；
- 客户端只允许持有 `NEXT_PUBLIC_API_BASE_URL` 等公开地址（非密钥）；
- 服务端是唯一可信边界：检索、生成、校验全部在云函数内完成。

## API 输入与传输限制

- 请求体原始字节上限：8192 bytes（超限返回 413 PAYLOAD_TOO_LARGE）；
- 用户问题长度：trim 后 2～500 字（由共享 AskRequestSchema 强制）；
- 请求必须为 `application/json`（否则 415）；顶层必须是 JSON 对象；
- 拒绝未知请求字段；错误信息不回显用户问题原文；
- 统一错误结构（ApiErrorResponseSchema）：ok/apiVersion/requestId/error{code,message,retryable}；
- 错误响应不包含 stack trace、本机路径、环境变量、API Key 或内部提示词。

## CORS

- 服务端环境变量 `ALLOWED_ORIGINS` 为逗号分隔的精确 Origin 白名单；
- 禁止 `Access-Control-Allow-Origin: *`；带 Origin 的浏览器请求只允许白名单来源；
- 不带 Origin 的小程序、服务端或测试请求可以进入；
- 白名单未配置时，对带 Origin 的请求 fail-closed（403 ORIGIN_NOT_ALLOWED）；
- **所有响应**（含 200/400/403/404/405/413/415/500/503 与 OPTIONS 204）统一返回 `Vary: Origin`；
- 无 Origin 时只返回 `Vary: Origin`，不得返回 `Access-Control-Allow-Origin`；白名单 Origin 返回**精确** ACAO（禁止 `*`）；非白名单 Origin 仍 403、不得反射 Origin、仍返回 `Vary: Origin`；
- **OPTIONS 预检不放行未知路径**：仅 `/api/v1/health` 与 `/api/v1/ask` 允许 204；未知路径 OPTIONS 返回 404 且不返回任何 `Access-Control-Allow-Origin`；
- `Access-Control-Allow-Methods` 按路由设置：health 为 `GET, OPTIONS`，ask 为 `POST, OPTIONS`；
- 不得原样反射未校验的 Origin。

## 服务端限流与费用保护（Phase 8 已实现，2026-08-29）

- **入口客户端限频**（functions/api/src/limit.ts + app.ts 入口预检）：默认每客户端每分钟 6 次、每天 30 次；客户端标识取 X-Forwarded-For 首址（网关标准）→ SHA-256 不可逆哈希（不存明文 IP）；无 Origin 的脚本/小程序请求同样受限；超限返回 **HTTP 429** + Retry-After + RATE_LIMITED 稳定错误（含 retryAfterSeconds）。
- **全局 DeepSeek 调用保护**（引擎层 tryModelSlot）：默认全局每天最多 100 次真实模型调用、最多 3 个并发模型调用；额度用尽/并发占满 → 429（不调用 DeepSeek）；单次请求仍为单次模型调用、无重试。
- **Kill switch（管理员紧急开关）**：默认关闭（服务可用）。两种触发方式：①构建期 KILL_SWITCH_BUILD=on 生成 runtime-config.json（functions/api/scripts/build-deploy.mjs），重新 tcb fn deploy 即生效；②运行时环境变量 LIMIT_KILL_SWITCH=on|true|1（控制台配置）。开启后不调用 DeepSeek，返回「服务暂时繁忙，请稍后再试。」；不影响 out_of_scope / needs_clarification 本地路径。**不读取/回显/覆盖 DEEPSEEK_API_KEY；不使用 CLI 整体覆盖 envVariables。**
- **阈值可调**：LIMIT_CLIENT_PER_MINUTE / LIMIT_CLIENT_PER_DAY / LIMIT_GLOBAL_MODEL_PER_DAY / LIMIT_MAX_CONCURRENT_MODELS（服务端环境变量，控制台维护；缺省使用安全默认值）。
- **存储与降级**：计数为进程级固定窗口存储（自动清扫、不永久积累）；存储异常时客户端限制降级放行（可用性优先），模型调用失败关闭（费用保护优先，返回 429）。
- **已知局限（如实）**：①跨实例的客户端/日额度与全局日额度/并发目前按【函数实例】计数——跨实例精确共享需要 CloudBase 数据库服务端 API Key（CLOUDBASE_APIKEY，控制台配置），属 PM 决策项；②CloudBase 网关「客户端维度限频」（qpsPerClient，ClientIP）为原生跨实例能力，但 CLI 3.8.1 tcb routes edit 的 --data JSON 解析异常（连合法 JSON 也报错），未能在本轮启用，可在控制台「环境配置 → 安全控制 → 限频设置」配置；③同一公网出口 IP（NAT）的用户共享客户端额度，阈值可按需上调。

## CloudBase 部署安全（Phase 6）

- 环境变量（含 `DEEPSEEK_API_KEY`）只能通过腾讯云网页控制台人工配置；**不在** CLI `cloudbaserc.json` 的 `envVariables` 中写入（因为 `tcb fn deploy` 指定 `envVariables` 时会**整体替换**函数环境变量，可能覆盖用户配置的密钥）。
- CORS 精确白名单：`ALLOWED_ORIGINS`/`WEB_ALLOWED_ORIGIN` 仅包含真实站点 Origin，禁止 `Access-Control-Allow-Origin: *`；未命中白名单的 Origin 一律 403 且不反射。
- 默认 CloudBase 测试域（`*.tcloudbase.com`/`*.tcloudbaseapp.com`）仅用于测试，不作为正式域名；独立域名/备案/正式搜索收录留待后续（本阶段不操作）。
- 部署包不包含 `.env`、node_modules、开发依赖、tests、.git、缓存；运行时依赖已由 esbuild 打包。
- 线上响应不含密钥、内部堆栈或环境变量；日志不记录用户完整问题/敏感信息。

## 日志脱敏

- 任何日志不得包含 API Key、用户输入的完整原文（如必须记录则截断/脱敏）；
- 不记录姓名、身份证号、手机号、公司全称等敏感信息；
- 错误信息在返回客户端前去除内部细节。

## 用户输入最小化

- 不自动采集姓名、身份证、公司全称等非必要信息；
- 首版不要求登录，不收集个人身份字段；
- 问题长度限制、调用频率限制、单次输出长度限制在服务端强制执行；
- Web 提问页明确提醒“请勿输入姓名、身份证号、手机号、公司商业秘密等敏感信息”。

## 提示词注入防护原则

- 系统提示词不得由用户输入覆盖；
- 拒绝“忽略检索资料”“泄露系统提示词”等指令，即使出现在用户输入中；
- 注入标记（INJECTION_PATTERNS）在服务端确定性识别：无劳动信号的注入类问题直接走 out_of_scope 固定文案（不调用模型，杜绝泄露面）；
  带劳动信号的注入类问题仍受证据白名单约束，绝不输出虚构法条/案号/胜诉率/Key/内部配置；
- 检索上下文与用户问题严格隔离，模型只能基于白名单（[S#] 证据）作答。

## 引用（citation）校验

- 模型引用的每个 `[S#]` 必须存在于本次检索返回的证据白名单中；
- **出现任意未在本证据集内的 [S#] → 引用异常，返回基于真实证据的 needs_clarification**（不得仅删除编号后保留未经支持的法律断言）；
  带“第X条”但无有效引用的结论段（含初步结论/问题识别）同样拒绝；
- 畸形模型 JSON 输出、无有效引用 → 证据驱动 needs_clarification（不虚构、不显示“资料不足”）；
- 最终响应附带的每条 citation 均含 sourceId、title、officialUrl、条号/定位、excerpt、reviewStatus；
- answered/needs_clarification 至少包含一项真实 A 级规范来源；out_of_scope sources 恒为空；

## 依赖安全

- 依赖版本精确锁定（save-exact），不使用浮动版本；
- 不配置第三方 npm registry；
- 依赖审计（如 `pnpm audit`）纳入后续 CI/手动验证流程。

## 禁止事项

- 不输出胜诉率、不冒充律师、不承诺案件结果；
- 不生成不存在的法条、案例或 source_id；
- 不抓取或搬运付费数据库、公众号全文及未授权材料；
- 不部署含密钥的构建产物。