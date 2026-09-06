// Phase 9A.1：部署配置契约测试（无第三方依赖；node 直接运行）。
// 覆盖：Nginx 敏感路径正则（根+嵌套隐藏段拒绝、/.well-known/ 保留、/api/ 与静态页不拦截）、
//      healthcheck 退出码契约、非法 HOST 失败关闭集成点、备份必须校验完整性、restore 自动回滚、
//      install.sh 双布局/loaded-config 冲突检测/事务式回滚/独立工具/SELinux 精确解析（非冒号格式）、
//      sync-src.ps1（Resolve-Path、无空 oldValue Replace 回归陷阱、首次同步不依赖 laoyouju 组、远端临时目录+原子替换+失败保留）、
//      verify-external.ps1（限流计数 1+5+1、逐次断言不吞错、脱敏）、首次公网部署默认 kill switch on。
// 运行：node deploy/vps/tests/deploy-config.test.mjs（由根 package.json test 串接，随 pnpm run check 执行）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const VPS = join(here, "..");
function read(p) { return readFileSync(join(VPS, p), "utf8"); }

// ------------------------- 1. Nginx：根+嵌套隐藏段 -------------------------
const NGINX = read("nginx/laoyouju.conf");
test("Nginx：隐藏路径规则 (^|/)\\.(?!well-known/) 拒绝根与嵌套隐藏段，放行 /.well-known/ 与正常路径", () => {
  assert.ok(NGINX.includes("location ~ (^|/)\\.(?!well-known/)"), "隐藏路径规则必须为 (^|/)\\.(?!well-known/)");
  const dot = new RegExp("(^|/)\\.(?!well-known/)");
  const ok = ["/api/v1/health", "/laws/", "/cases/", "/ask/", "/about/methodology/", "/sitemap.xml", "/robots.txt", "/", "/index.html", "/_next/static/chunks/a.b.js", "/.well-known/acme-challenge/x", "/_next/static/css/1ukv9s-uiy_1o.css"];
  for (const p of ok) { assert.equal(dot.test(p), false, "隐藏项规则不得拦截 " + p); }
  const bad = ["/.env", "/.git/config", "/.env.local", "/x/.env", "/x/.git/config", "/deploy/.env", "/data/.git/objects/a/b", "/x/.env.local"];
  for (const p of bad) { assert.equal(dot.test(p), true, "隐藏项规则必须拒绝 " + p); }
});

test("Nginx：扩展名规则只拒绝敏感后缀；反代与 XFF 覆盖存在", () => {
  const ext = new RegExp("\\.(env|git|sqlite3|sqlite)$", "i");
  for (const ok of ["/api/v1/health", "/laws/index.html", "/_next/static/chunks/a.js", "/icon.svg", "/robots.txt"]) { assert.equal(ext.test(ok), false, "扩展名规则不得拦截 " + ok); }
  for (const bad of ["/x/.env", "/x/a.sqlite3", "/x/a.sqlite", "/secret.env", "/x/.git"]) { assert.equal(ext.test(bad), true, "扩展名规则必须拒绝 " + bad); }
  assert.ok(NGINX.includes("proxy_pass http://127.0.0.1:9000;"));
  assert.ok(NGINX.includes("proxy_set_header X-Forwarded-For $remote_addr;"));
  assert.ok(!NGINX.includes("$proxy_add_x_forwarded_for"), "不得使用存在伪造风险的 $proxy_add_x_forwarded_for");
});

// ------------------------- 2. healthcheck 退出码 -------------------------
const HEALTH = read("scripts/healthcheck.sh");
test("healthcheck：全部通过 exit 0、任一失败 exit 1", () => {
  assert.ok(HEALTH.includes("OK=1"));
  assert.ok(HEALTH.includes("OK=0"));
  const passBlock = HEALTH.slice(HEALTH.indexOf('echo "[health] 全部通过"'), HEALTH.indexOf('echo "[health] 全部通过"') + 80);
  assert.ok(passBlock.includes("exit 0"));
  const failBlock = HEALTH.slice(HEALTH.indexOf('echo "[health] 存在失败项"'), HEALTH.indexOf('echo "[health] 存在失败项"') + 80);
  assert.ok(failBlock.includes("exit 1"));
  assert.ok(!HEALTH.includes('exit "${OK}"'));
});

// ------------------------- 3. HOST 失败关闭 -------------------------
const SERVER_TS = readFileSync(join(here, "..", "..", "..", "functions", "api", "src", "server.ts"), "utf8");
const LISTEN_TS = readFileSync(join(here, "..", "..", "..", "functions", "api", "src", "listen.ts"), "utf8");
test("HOST 失败关闭：server.ts process.exit(1)；默认 0.0.0.0 保留", () => {
  assert.ok(SERVER_TS.includes("process.exit(1)"));
  assert.ok(LISTEN_TS.includes("DEFAULT_HOST") && LISTEN_TS.includes("0.0.0.0"));
  assert.ok(LISTEN_TS.includes("throw new Error"));
});

// ------------------------- 4. 备份 / 恢复 -------------------------
const BACKUP = read("scripts/backup.sh");
test("backup：仅 .backup + 强制 quick_check=ok；无复制替代；sqlite3 缺失即中止", () => {
  assert.ok(BACKUP.includes("command -v sqlite3"));
  assert.ok(BACKUP.includes(".backup"));
  assert.ok(BACKUP.includes("PRAGMA quick_check;"));
  assert.ok(!/cp -a "\$\{DB\}" "\$\{DEST\}"/.test(BACKUP));
  assert.ok(!BACKUP.includes("无 sqlite3 CLI：短暂停服复制"));
});
const RESTORE = read("scripts/restore.sh");
test("restore：校验备份、保存当前副本、健康失败自动回滚", () => {
  assert.ok(RESTORE.includes("PRAGMA quick_check;"));
  assert.ok(RESTORE.includes("pre-restore"));
  assert.ok(RESTORE.includes("健康检查失败"));
  assert.ok(RESTORE.includes("cp -a \"$\{SAVED_FILE\}"));
});

// ------------------------- 5. install.sh -------------------------
const INSTALL = read("scripts/install.sh");
test("install.sh：nginx -T 正确捕获（精确拒绝旧错误写法 $('nginx…)，退出码非 0 安全中止）", () => {
  assert.ok(INSTALL.includes("sites-enabled") && INSTALL.includes("conf.d"));
  assert.ok(INSTALL.includes("NGINX_CONF"));
  assert.ok(INSTALL.includes("include[[:space:]]+.*conf"), "必须检查主配置 include 结构");
  // 精确拒绝旧错误写法：$('nginx -T …)（括号内为单引号字符串，不是命令替换）
  assert.ok(!INSTALL.includes("$(" + "\x27" + "nginx -T"), "旧错误写法 $('nginx -T 2>&1 || true') 必须移除");
  assert.ok(INSTALL.includes('NGINX_T="$(nginx -T 2>&1)"'), "必须用 $(nginx -T 2>&1) 正确捕获输出");
  assert.ok(INSTALL.includes("NGINX_T_RC"), "必须捕获 nginx -T 退出码");
  assert.ok(INSTALL.includes("nginx -T 执行失败"), "nginx -T 非 0 必须安全中止（不得把失败当成功）");
  assert.ok(INSTALL.includes("# configuration file"), "必须解析 nginx -T 的 configuration file 行");
  assert.ok(INSTALL.includes("不会删除或覆盖任何既有配置"));
});

test("install.sh：Nginx 事务式安装 —— nginx -t 失败自动回滚/移除，不留损坏配置", () => {
  assert.ok(INSTALL.includes("TMP_NEW") && INSTALL.includes("TMP_OLD") && INSTALL.includes("OLD_PRESENT"));
  assert.ok(INSTALL.includes("暂存新配置"), "必须先暂存新配置");
  assert.ok(INSTALL.includes("nginx -t 失败"));
  assert.ok(INSTALL.includes("自动回滚") || INSTALL.includes("回滚"));
  assert.ok(INSTALL.includes("原有配置未被破坏"));
  assert.ok(!INSTALL.includes("nginx -t\nsystemctl"), "不得在 nginx -t 未通过时继续 enable");
});

test("install.sh：工具独立安装 + enable --now + active 断言", () => {
  for (const t of ["nginx", "rsync", "sqlite3", "curl", "tar"]) { assert.ok(INSTALL.includes("ensure_tool " + t), "必须独立检查/安装 " + t); }
  assert.ok(INSTALL.includes("systemctl enable --now nginx"));
  assert.ok(INSTALL.includes("systemctl is-active --quiet nginx"));
});

test("install.sh：SELinux 端口 9000 精确解析（第3列到最后一列、逗号/空格/区间），冲突安全停止", () => {
  assert.ok(INSTALL.includes("port_owner_of_9000"), "必须定义端口归属解析函数");
  assert.ok(INSTALL.includes("awk -v port=9000"), "必须用 awk 解析 semanage port -l（不依赖 :9000 冒号格式）");
  assert.ok(INSTALL.includes("for (ci = 3; ci <= NF; ci++)"), "必须解析第 3 列到最后一列（而不仅 $3）");
  assert.ok(INSTALL.includes("split(line, parts, /[ ,]+/)"), "必须按逗号+空格分隔端口列表");
  assert.ok(!INSTALL.includes("split($3, parts"), "不得只解析 $3");
  assert.ok(!INSTALL.includes('grep -q ":9000"'), "不得使用未经验证的 grep :9000");
  assert.ok(INSTALL.includes("已属于 SELinux 类型"), "9000 被其他类型占用必须明确报告并安全停止");
  assert.ok(INSTALL.includes("if ! semanage port -a -t http_port_t -p tcp 9000"), "semanage -a 失败必须中止（不得 || true）");
  assert.ok(!INSTALL.includes("semanage port -a -t http_port_t -p tcp 9000 2>/dev/null || true"), "旧版吞错写法必须移除");
  assert.ok(INSTALL.includes("semanage fcontext") && INSTALL.includes('*"already exists"*'));
  assert.ok(INSTALL.includes("semanage fcontext 失败"), "fcontext 真实错误必须 die");
  assert.ok(INSTALL.includes("restorecon -RF"));
  assert.ok(INSTALL.includes("ls -Zd"), "必须验证最终文件上下文");
  assert.ok(!INSTALL.includes("setenforce 0"), "禁止关闭 SELinux");
});

// ------------------------- 6. sync-src.ps1 -------------------------
const SYNC_PS1 = read("scripts/sync-src.ps1");
test("sync-src.ps1：Repair 回归陷阱（不得出现 Replace(空串)；必须 Resolve-Path；显式字符码归一化路径）", () => {
  assert.ok(!SYNC_PS1.includes(".Replace(" + "\"\"" + ","), "不得存在 Replace(空串, ...) 运行期错误");
  assert.ok(SYNC_PS1.includes("Resolve-Path"), "必须使用 Resolve-Path 取得仓库绝对路径");
  assert.ok(SYNC_PS1.includes("[char]92"), "路径处理必须用字符码（避免转义陷阱）");
});

test("sync-src.ps1：-PackageOnly 真实打包+校验分支存在（Required 文件/禁止条目检查）", () => {
  assert.ok(SYNC_PS1.includes("[switch]$PackageOnly"));
  assert.ok(SYNC_PS1.includes("if ($PackageOnly)"));
  assert.ok(SYNC_PS1.includes("$members = & tar -tzf $archive"), "必须真实读取归档成员");
  assert.ok(SYNC_PS1.includes("AGENTS.md") && SYNC_PS1.includes("deploy/vps/scripts/install.sh"), "必须校验必备文件");
  assert.ok(SYNC_PS1.includes("归档包含应排除的条目"), "必须拒绝敏感/缓存条目");
  assert.ok(SYNC_PS1.includes("ls-files -co --exclude-standard"), "必须使用 git 文件清单");
});

test("sync-src.ps1：首次同步不依赖 laoyouju 用户组（远端无 chown/chmod），root:root 解包", () => {
  assert.ok(!SYNC_PS1.includes("chown root:laoyouju"), "同步脚本不得执行 chown root:laoyouju（用户/权限由 install.sh 负责）");
  assert.ok(!/sudo[^\n]*chmod/.test(SYNC_PS1), "同步不得执行 chmod 权限调整");
  assert.ok(SYNC_PS1.includes("用户与权限由 install.sh 设置") || SYNC_PS1.includes("install.sh 中设置"), "必须注明由 install.sh 负责");
});

test("sync-src.ps1：远端独立临时目录 + 必备文件校验 + 原子替换 + 失败保留旧源码 + 别名/路径校验", () => {
  assert.ok(SYNC_PS1.includes("mktemp -d"), "必须使用独立临时目录");
  assert.ok(SYNC_PS1.includes(".laoyouju-stage-"));
  assert.ok(SYNC_PS1.includes("test -f \"$STAGE/AGENTS.md\""), "远端必须校验必备文件");
  assert.ok(SYNC_PS1.includes("mv \"$DEST\" \"$OLD\"") && SYNC_PS1.includes("mv \"$STAGE\" \"$DEST\""), "必须原子替换（旧目录先移走）");
  assert.ok(SYNC_PS1.includes("trap cleanup EXIT"), "失败必须清理临时目录并保留旧源码");
  assert.ok(SYNC_PS1.includes("AssertSafeToken") && SYNC_PS1.includes("AssertSafeDest"), "必须校验 SSH 别名与目标路径");
  assert.ok(SYNC_PS1.includes("finally"), "必须 finally 清理本地临时归档");
});

// ------------------------- 7. verify-external.ps1 -------------------------
const VERIFY_EX = read("scripts/verify-external.ps1");
test("verify-external.ps1：限流计数 1+5+1（重启基线、逐次断言、第 7 次换伪造 XFF 必须 429）", () => {
  assert.ok(VERIFY_EX.includes("systemctl restart laoyouju-api"), "验证前必须重启服务重置计数基线");
  assert.ok(VERIFY_EX.includes("第 1 次（已计入）"), "必须明确第 1 次为已计入请求");
  assert.ok(VERIFY_EX.includes("for ($i = 2; $i -le 6; $i++)"), "必须逐次断言第 2..6 次");
  assert.ok(VERIFY_EX.includes("if ($st -ne 200)"), "循环内每次响应必须断言（不得静默吞 429）");
  assert.ok(VERIFY_EX.includes("198.51.100.20") && VERIFY_EX.includes("必须 429"), "第 7 次更换伪造 XFF 必须 429");
  assert.ok(VERIFY_EX.includes(":9000/api/v1/health") && VERIFY_EX.includes('"ok":true'), "外部 9000 必须用 HTTP 探测（不得依赖原始 TCP 连接语义）");
  assert.ok(VERIFY_EX.includes("Mask-IPv4"), "IP 输出必须脱敏");
  const lines = VERIFY_EX.split("\n").filter((l) => l.includes("Write-Host"));
  for (const line of lines) { assert.ok(!line.includes("+ $pub") || line.includes("Mask-IPv4"), "Write-Host 不得直出完整 IP"); }
});


// ------------------------- 9A.2：semanage port 行为镜像 + 权限/enable 严格性 -------------------------

/**
 * semanage port -l 解析算法的行为镜像（与 install.sh 中 port_owner_of_9000 的 awk 逻辑一致：
 * 仅解析 tcp 行；拼接第 3..最后一列并按 [ ,]+ 拆分为端口/区间；返回归属类型；未命中返回 ""）。
 * 说明：Windows 开发机无 awk，无法直接执行 awk；此处以相同算法验证语义（真实 awk 执行留待 OpenCloudOS 部署轮次）。
 */
function parseSemanagePortOwner(lines, port) {
  for (const raw of lines) {
    const m = raw.trim().split(/\s+/);
    if (m.length < 3 || m[1] !== "tcp") continue;
    const joined = m.slice(2).join(" ");
    const parts = joined.split(/[ ,]+/).filter((s) => s !== "");
    for (const p of parts) {
      if (/^[0-9]+$/.test(p)) { if (Number(p) === port) return m[0]; }
      else if (/^[0-9]+-[0-9]+$/.test(p)) { const r = p.split("-"); if (port >= Number(r[0]) && port <= Number(r[1])) return m[0]; }
    }
  }
  return "";
}

test("9A.2 模拟行验证：http_port_t 列表（逗号+空格）能找到 9000；9000 属于其他类型能被识别并安全停止", () => {
  const httpLine = "http_port_t                    tcp      80, 81, 443, 488, 8008, 8009, 8443, 9000";
  assert.equal(parseSemanagePortOwner([httpLine], 9000), "http_port_t", "逗号+空格列表必须命中 9000");
  assert.equal(parseSemanagePortOwner([httpLine], 80), "http_port_t");
  assert.equal(parseSemanagePortOwner([httpLine], 8443), "http_port_t");
  assert.equal(parseSemanagePortOwner([httpLine], 3306), "", "列表外端口未命中");
  // 9000 已属于其他类型：识别为该类型（install.sh 对非 http_port_t → die 安全停止，已由下方 install 断言覆盖）
  const otherLine = "ssh_port_t                     tcp      9000, 9022";
  assert.equal(parseSemanagePortOwner([otherLine], 9000), "ssh_port_t", "其他类型占用必须被识别");
  const rangeOther = "mysqld_port_t                  tcp      3306, 3500-3600";
  assert.equal(parseSemanagePortOwner([rangeOther], 3555), "mysqld_port_t", "区间必须命中");
  assert.equal(parseSemanagePortOwner([rangeOther], 3400), "");
  // 多列布局（第2列之后的端口分散在多个字段）
  const spread = "http_port_t  tcp  80, 81, 443, 488, 8008, 8009, 8443, 9000";
  assert.equal(parseSemanagePortOwner([spread], 9000), "http_port_t", "字段分散布局必须命中");
  // install.sh 的 die 路径存在
  assert.ok(INSTALL.includes("已属于 SELinux 类型"), "非 http_port_t 拥有者必须 die 安全停止");
});

test("9A.2 环境文件权限失败不忽略 + laoyouju-api 必须 enabled 且经 is-enabled 校验", () => {
  assert.ok(!INSTALL.includes('chmod 0600 "${ENV_FILE}" 2>/dev/null || true'), "chmod 失败不得 || true 忽略");
  assert.ok(INSTALL.includes('chmod 0600 "${ENV_FILE}"'), "chmod 0600 必须保留（失败时 set -e 中止）");
  assert.ok(!INSTALL.includes("systemctl enable laoyouju-api >/dev/null 2>&1 || true"), "enable 失败不得静默忽略");
  assert.ok(INSTALL.includes("systemctl is-enabled --quiet laoyouju-api"), "必须检查服务确实为 enabled");
});
// ------------------------- 8. 首次公网部署默认保护 -------------------------
const ENV_EX = read("env/laoyouju.env.example");
test("env 示例：LIMIT_KILL_SWITCH=on 且 DEEPSEEK_API_KEY 留空（真实模型测试另行授权）", () => {
  assert.ok(/^LIMIT_KILL_SWITCH=on$/m.test(ENV_EX));
  assert.ok(/^DEEPSEEK_API_KEY=$/m.test(ENV_EX));
  assert.ok(ENV_EX.includes("授权真实模型测试"));
});

// ------------------------- 9. verify-public.sh 定位 -------------------------
const VERIFY_PUB = read("scripts/verify-public.sh");
test("verify-public.sh：服务器端自检（非外部验证），显式 exit 0/1", () => {
  assert.ok(VERIFY_PUB.includes("服务器访问自身公网 IP") || VERIFY_PUB.includes("不是") && VERIFY_PUB.includes("外部"));
  assert.ok(VERIFY_PUB.includes("verify-external.ps1"));
  assert.ok(VERIFY_PUB.includes("exit 0") && VERIFY_PUB.includes("exit 1"));
});