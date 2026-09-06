#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— 轻量服务器一次性幂等安装（Phase 9A：OpenCloudOS/RHEL + Debian 双兼容）
# 运行位置：服务器（root）；来源：/opt/laoyouju/src/deploy/vps/scripts/install.sh
# 本脚本可以重复执行：已存在的内容不覆盖、不删除（数据/环境文件/已有版本均保留）。
# 冲突时保守停止并报告（绝不删除/覆盖未知自定义站点；绝不关闭 SELinux）。
# 不安装：宝塔、WordPress、Hermes、OpenClaw、DeepSeek Harness 等无关软件。
# ============================================================
set -euo pipefail

APP_USER="laoyouju"
APP_GROUP="laoyouju"
OPT_ROOT="/opt/laoyouju"
VAR_ROOT="/var/lib/laoyouju"
ETC_DIR="/etc/laoyouju"
LOG_DIR="/var/log/laoyouju"
ENV_FILE="${ETC_DIR}/laoyouju.env"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

log() { echo "[install] $*"; }
die() { echo "[install] ERROR: $*" >&2; exit 1; }

PKG_FRESH=0
pkg_install() {
  if command -v apt-get >/dev/null 2>&1; then
    if [ "$PKG_FRESH" = "0" ]; then export DEBIAN_FRONTEND=noninteractive; apt-get update -y; PKG_FRESH=1; fi
    apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
  else
    die "未知包管理器，请手动安装：$*"
  fi
}

ensure_tool() {
  local tool="$1"; shift;
  if command -v "$tool" >/dev/null 2>&1; then
    log "工具已存在：$tool"
  else
    log "安装缺失工具：$tool"
    pkg_install "$@"
  fi
}

[ "$(id -u)" -eq 0 ] || die "请以 root 运行（sudo bash .../install.sh）"

## ---- 0. Node 版本与“真实绝对路径 + 可执行性”检查（systemd 可用性）----
command -v node >/dev/null 2>&1 || die "未找到 node。请先安装 Node.js 22.12.0（本脚本不代装，避免与服务器已有环境冲突）"
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "${NODE_MAJOR}" -lt 20 ] || [ "${NODE_MAJOR}" -ge 25 ]; then
  die "Node 版本 ${NODE_MAJOR} 不在支持范围（>=20 <25；目标 22.x）。"
fi
NODE_BIN="$(command -v node)"
NODE_REAL="$(readlink -f "${NODE_BIN}")"
case "${NODE_REAL}" in
  /root/*) die "Node 位于 root 私有目录（${NODE_REAL}）：systemd 低权限用户无法执行。请用包管理器安装 Node 到系统路径（不得破坏服务器预装 Node）。" ;;
esac
# 目录链路：每级目录必须允许 other 执行（o+x）；文件本身必须 other 可执行（o+x）。
NODE_DIR="${NODE_REAL}"
while [ "${NODE_DIR}" != "/" ] && [ -n "${NODE_DIR}" ]; do
  parent="$(dirname "${NODE_DIR}")"
  p="$(stat -c %a "${parent}" 2>/dev/null || echo 000)"
  if [ $(( 10#$p & 0001 )) -eq 0 ]; then die "Node 目录链对 other 不可执行（${parent}）：systemd 低权限用户无法执行，安全失败"; fi
  NODE_DIR="${parent}"
done
NP="$(stat -c %a "${NODE_REAL}" 2>/dev/null || echo 000)"
if [ $(( 10#$NP & 0001 )) -eq 0 ]; then
  die "Node 文件对 other 不可执行（${NODE_REAL} 权限 ${NP}）：请将 Node 安装到系统路径（本脚本不会修改其权限/属主）"
fi
log "Node 真实路径：${NODE_REAL}（权限 ${NP}，systemd 可执行）"

## ---- 1. 工具链：nginx / rsync / sqlite3 / curl / tar 相互独立安装 ----
ensure_tool nginx nginx
ensure_tool rsync rsync
ensure_tool sqlite3 sqlite3
ensure_tool curl curl
ensure_tool tar tar

## ---- 2. corepack ----
if ! command -v corepack >/dev/null 2>&1; then
  log "corepack 不可用：尝试全局安装 pnpm@11.24.0（官方 registry）"
  command -v npm >/dev/null 2>&1 || die "npm 不可用且 corepack 不可用"
  npm install -g pnpm@11.24.0 --registry=https://registry.npmjs.org/
fi

## ---- 3. 专用低权限用户（system、nologin）----
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${VAR_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
  log "创建用户 ${APP_USER}"
fi

## ---- 4. 目录 ----
install -d -m 0755 -o root -g root "${OPT_ROOT}"
install -d -m 0755 -o root -g root "${OPT_ROOT}/releases"
install -d -m 0755 -o root -g root "${OPT_ROOT}/src"
install -d -m 0700 -o "${APP_USER}" -g "${APP_GROUP}" "${VAR_ROOT}"
install -d -m 0700 -o "${APP_USER}" -g "${APP_GROUP}" "${VAR_ROOT}/budget"
install -d -m 0700 -o "${APP_USER}" -g "${APP_GROUP}" "${VAR_ROOT}/backups"
install -d -m 0750 -o "${APP_USER}" -g "${APP_GROUP}" "${LOG_DIR}"
install -d -m 0755 -o root -g root "${ETC_DIR}"

## ---- 5. 环境文件（仅首次创建；绝不覆盖已有配置）----
if [ ! -f "${ENV_FILE}" ]; then
  cp "${REPO_ROOT}/deploy/vps/env/laoyouju.env.example" "${ENV_FILE}" 2>/dev/null \
    || cp "${SCRIPT_DIR}/../env/laoyouju.env.example" "${ENV_FILE}"
  chmod 0600 "${ENV_FILE}"
  chown root:"${APP_GROUP}" "${ENV_FILE}"
  log "已创建环境文件 ${ENV_FILE}（首次公网部署默认 LIMIT_KILL_SWITCH=on、DEEPSEEK_API_KEY 留空）"
else
  log "环境文件已存在，不覆盖"
fi
chmod 0600 "${ENV_FILE}"

## ---- 6. systemd 服务（Node 绝对路径注入 __NODE_BIN__）----
SERVICE_SRC="${REPO_ROOT}/deploy/vps/systemd/laoyouju-api.service"
[ -f "${SERVICE_SRC}" ] || SERVICE_SRC="${SCRIPT_DIR}/../systemd/laoyouju-api.service"
UNIT_TMP="$(mktemp)"
sed "s|__NODE_BIN__|${NODE_REAL}|g" "${SERVICE_SRC}" > "${UNIT_TMP}"
grep -qE "^ExecStart=[^ ]+" "${UNIT_TMP}" || die "systemd 模板 ExecStart 缺失/非法（Node 绝对路径注入失败）"
install -m 0644 -o root -g root "${UNIT_TMP}" /etc/systemd/system/laoyouju-api.service
rm -f "${UNIT_TMP}"
systemctl daemon-reload
systemctl enable laoyouju-api
systemctl is-enabled --quiet laoyouju-api || die "laoyouju-api 未处于 enabled 状态（systemctl enable 失败？）"
log "systemd 单元已安装（ExecStart=${NODE_REAL} ...）并 enable"

## ---- 7. journald 上限 ----
JOURNALD_SRC="${REPO_ROOT}/deploy/vps/systemd/journald-laoyouju.conf"
[ -f "${JOURNALD_SRC}" ] || JOURNALD_SRC="${SCRIPT_DIR}/../systemd/journald-laoyouju.conf"
install -d -m 0755 -o root -g root /etc/systemd/journald.conf.d
install -m 0644 -o root -g root "${JOURNALD_SRC}" /etc/systemd/journald.conf.d/laoyouju.conf
systemctl restart systemd-journald || true

## ---- 8. Nginx：include 结构检测 + 冲突检查 + 安装（不删不改动未知配置）----
NGINX_CONF="/etc/nginx/nginx.conf"
HAVE_CONFD=0; HAVE_SITES=0
if [ -f "${NGINX_CONF}" ]; then
  grep -qE "include[[:space:]]+.*conf\.d[^;]*\.conf" "${NGINX_CONF}" && HAVE_CONFD=1
  grep -qE "include[[:space:]]+.*sites-enabled" "${NGINX_CONF}" && HAVE_SITES=1
fi
NGINX_SOURCE="${REPO_ROOT}/deploy/vps/nginx/laoyouju.conf"
[ -f "${NGINX_SOURCE}" ] || NGINX_SOURCE="${SCRIPT_DIR}/../nginx/laoyouju.conf"
if [ "${HAVE_SITES}" = "1" ] && [ -d /etc/nginx/sites-available ]; then
  SITE_AVAIL=/etc/nginx/sites-available; SITE_ENABLED=/etc/nginx/sites-enabled; SEARCH_DIRS="${SITE_AVAIL}"
  log "Nginx 布局：Debian 风格 sites-available/sites-enabled"
elif [ "${HAVE_CONFD}" = "1" ] || [ -d /etc/nginx/conf.d ]; then
  SITE_AVAIL=""; SITE_ENABLED=""; SEARCH_DIRS=/etc/nginx/conf.d
  log "Nginx 布局：conf.d（OpenCloudOS/RHEL 风格）"
else
  die "无法从 ${NGINX_CONF} 识别 include 结构（conf.d / sites-enabled 均未包含或不存在）；本脚本不会修改主配置，请人工确认后重试"
fi
# 冲突检测（Phase 9A.1）：以 nginx -T 枚举“实际加载”的配置文件（含主 nginx.conf 与全部 include），
# 除本项目 laoyouju 外，任何文件包含 listen ... 80 即视为冲突 → 安全停止并报告（不删除/不覆盖未知站点）。
set +e
NGINX_T="$(nginx -T 2>&1)"
NGINX_T_RC=$?
set -e
if [ "${NGINX_T_RC}" -ne 0 ]; then
  die "nginx -T 执行失败（exit ${NGINX_T_RC}）：无法确认现有配置/冲突；请人工检查 nginx 配置后重试（本脚本不会修改主配置）"
fi
NGINX_LOADED="$(printf '%s\n' "${NGINX_T}" | sed -n 's/^# configuration file \(.*\):$/\1/p' | sort -u)"
if [ -z "${NGINX_LOADED}" ]; then
  die "无法枚举 nginx 实际加载配置（nginx -T 失败或无输出）；请人工检查 nginx 配置后重试（本脚本不会修改主配置）"
fi
CONFLICTS=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "${f}" in *laoyouju*) continue ;; esac
  [ -f "$f" ] || continue
  if grep -Eq "listen[[:space:]]+[^;]*80" "$f" 2>/dev/null; then CONFLICTS="${CONFLICTS} ${f}"; fi
done <<< "${NGINX_LOADED}"
if [ -n "${CONFLICTS}" ]; then
  echo "[install] ERROR：检测到既有监听 80 端口配置（实际加载文件）：${CONFLICTS}"
  echo "[install] 为安全起见，本脚本不会删除或覆盖任何既有配置，也不会修改主配置。"
  echo "[install] 请人工处理（例：Debian：sudo rm /etc/nginx/sites-enabled/default（仅移除软链）；RHEL：sudo mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.orig），完成后重新运行本脚本。"
  exit 1
fi
# 事务式安装（Phase 9A.1）：暂存新配置 + 备份本项目旧配置；nginx -t 失败则自动回滚/移除，
# 保证“安装脚本失败”不会留下 Nginx 配置损坏状态。
if [ -n "${SITE_AVAIL}" ]; then
  NGINX_TARGET="${SITE_AVAIL}/laoyouju"; NGINX_LINK="${SITE_ENABLED}/laoyouju"
else
  NGINX_TARGET=/etc/nginx/conf.d/laoyouju.conf; NGINX_LINK=""
fi
TMP_NEW="$(mktemp)"; TMP_OLD="$(mktemp)"; OLD_PRESENT=0
cp "${NGINX_SOURCE}" "${TMP_NEW}" || die "暂存新配置失败"
if [ -f "${NGINX_TARGET}" ]; then cp "${NGINX_TARGET}" "${TMP_OLD}"; OLD_PRESENT=1; fi
install -m 0644 -o root -g root "${TMP_NEW}" "${NGINX_TARGET}" || die "安装新配置失败"
if [ -n "${NGINX_LINK}" ]; then ln -sfn "${NGINX_TARGET}" "${NGINX_LINK}"; fi
if ! nginx -t; then
  echo "[install] nginx -t 失败 —— 自动回滚本项目配置（Nginx 配置保持测试通过状态）"
  if [ "${OLD_PRESENT}" = "1" ]; then
    install -m 0644 -o root -g root "${TMP_OLD}" "${NGINX_TARGET}" || true
  else
    rm -f "${NGINX_TARGET}"
  fi
  [ -z "${NGINX_LINK}" ] || rm -f "${NGINX_LINK}"
  rm -f "${TMP_NEW}" "${TMP_OLD}"
  die "nginx -t 失败已回滚；原有配置未被破坏（请检查 nginx 错误日志后重试）"
fi
rm -f "${TMP_NEW}" "${TMP_OLD}"
systemctl enable --now nginx
systemctl is-active --quiet nginx || die "nginx enable --now 后仍未 active，请检查 journalctl -u nginx"
log "Nginx 已事务式安装并通过 nginx -t，服务 active"

## ---- 9. SELinux（Enforcing 时设置最小策略与文件上下文；绝不关闭 SELinux）----
if command -v getenforce >/dev/null 2>&1; then
  SE_STATE="$(getenforce)"
  if [ "${SE_STATE}" = "Enforcing" ]; then
    if ! command -v semanage >/dev/null 2>&1; then
      pkg_install policycoreutils-python-utils 2>/dev/null || true
      pkg_install policycoreutils-python 2>/dev/null || true
    fi
    command -v semanage >/dev/null 2>&1 || die "SELinux Enforcing 但缺少 semanage（policycoreutils-python-utils）；为保证最小策略请安装后重试（不得关闭 SELinux）"
    # ---- 端口 9000 的准确解析（Phase 9A.1）：逐行解析 semanage port -l，按协议 tcp + 端口/区间匹配，不依赖冒号格式；
    # ---- 若 9000 已被其他类型占用 → 安全停止并明确报告（不得吞错、不得覆盖）。
    port_owner_of_9000() {
      semanage port -l 2>/dev/null | awk -v port=9000 '
        $2 == "tcp" {
          line = ""
          for (ci = 3; ci <= NF; ci++) { line = line " " $ci }
          n = split(line, parts, /[ ,]+/)
          for (i = 1; i <= n; i++) {
            p = parts[i]
            if (p ~ /^[0-9]+$/) { if (p + 0 == port) { print $1; exit } }
            else if (p ~ /^[0-9]+-[0-9]+$/) { split(p, r, "-"); if (port >= r[1] + 0 && port <= r[2] + 0) { print $1; exit } }
          }
        }'
    }
    OWNER="$(port_owner_of_9000)"
    if [ -n "${OWNER}" ] && [ "${OWNER}" != "http_port_t" ]; then
      die "TCP 9000 已属于 SELinux 类型 ${OWNER}：本脚本不会覆盖既有端口类型；请人工确认后处理（不得关闭 SELinux）"
    fi
    if [ -z "${OWNER}" ]; then
      if ! semanage port -a -t http_port_t -p tcp 9000; then
        die "semanage port -a (9000 → http_port_t) 失败：需要人工修复；不允许用 || true 吞错"
      fi
      REOWNER="$(port_owner_of_9000)"
      if [ "${REOWNER}" != "http_port_t" ]; then
        die "semanage port -a 后校验失败（9000 归属 ${REOWNER:-未知}）"
      fi
    fi
    log "SELinux 端口 9000 归属 http_port_t（已确认）"
    # ---- 文件上下文：区分“规则已存在”与真实错误；恢复后校验最终上下文。
    FCTX_OUT="$(semanage fcontext -a -t httpd_sys_content_t "/opt/laoyouju(/.*)?" 2>&1 || true)"
    if [ -n "${FCTX_OUT}" ]; then
      case "${FCTX_OUT}" in
        *"already exists"*|*"already exist"*|*"Duplicate"*|*"duplicate"*) : ;;
        *) die "semanage fcontext 失败：${FCTX_OUT}" ;;
      esac
    fi
    restorecon -RF "${OPT_ROOT}" || die "restorecon -RF 失败（不得关闭 SELinux）"
    FCTX_NOW="$(ls -Zd "${OPT_ROOT}" 2>/dev/null | awk '{print $4}')"
    case "${FCTX_NOW}" in
      *httpd_sys_content_t*) log "SELinux 上下文已生效：${FCTX_NOW}" ;;
      *) die "restorecon 后上下文异常（${FCTX_NOW:-未取到}）；请人工检查（不得关闭 SELinux）" ;;
    esac
    log "SELinux 最小策略已设置并验证（httpd_sys_content_t 上下文 + http_port_t:9000）；未改变 Enforcing 状态"
  else
    log "SELinux 当前状态：${SE_STATE}（非 Enforcing，无需策略；未修改任何 SELinux 设置）"
  fi
else
  log "未检测到 getenforce（非 SELinux 系统）"
fi

## ---- 10. 防火墙（最小；仅当工具存在；不阻塞 SSH）----
FIREWALL_SCRIPT="${REPO_ROOT}/deploy/vps/scripts/firewall.sh"
[ -f "${FIREWALL_SCRIPT}" ] || FIREWALL_SCRIPT="${SCRIPT_DIR}/firewall.sh"
if [ -x "${FIREWALL_SCRIPT}" ]; then
  bash "${FIREWALL_SCRIPT}" --apply || log "防火墙脚本执行失败（请手动检查；不得放行 9000）"
fi

## ---- 11. 分发运维脚本到固定位置 ----
install -d -m 0755 -o root -g root /opt/laoyouju/scripts
cp "${SCRIPT_DIR}"/*.sh /opt/laoyouju/scripts/ 2>/dev/null || true
chmod 0755 /opt/laoyouju/scripts/*.sh 2>/dev/null || true
log "运维脚本已复制到 /opt/laoyouju/scripts/"

cat <<'EOF'
[install] 完成。下一步：
  1) 编辑 /etc/laoyouju/laoyouju.env（首次公网部署：LIMIT_KILL_SWITCH=on、DEEPSEEK_API_KEY 留空；ALLOWED_ORIGINS=http://<公网IP>）；
  2) bash /opt/laoyouju/src/deploy/vps/scripts/publish.sh   # 首次发布（在服务器上执行）；
  3) bash /opt/laoyouju/src/deploy/vps/scripts/healthcheck.sh；（服务器）
  4) 开发机（Windows PowerShell）执行外部验证: powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\verify-external.ps1 -HostAlias <别名>
EOF