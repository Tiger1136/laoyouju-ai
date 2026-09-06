#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— 服务器发布脚本（Phase 9；在服务器上以 root 运行）
# 流程：前置检查 → 备份（首次为空部署）→ 复制源码到新版本目录 → 安装依赖（官方 registry）
#      → 类型检查/构建（前端同源 /api/，不写公网 IP）→ 校验内容 → 原子切换 → 重启 → 健康检查
# 失败自动回滚到上一版本；数据（SQLite/备份）不受影响。
# ============================================================
set -euo pipefail

die() { echo "[publish] ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "请以 root 运行"

SRC="${1:-/opt/laoyouju/src}"
TS="$(date +%Y%m%d-%H%M%S)"
REL="/opt/laoyouju/releases/${TS}"
CURRENT="/opt/laoyouju/current"
ENV_FILE="/etc/laoyouju/laoyouju.env"
SCRIPTS="${SRC}/deploy/vps/scripts"
BACKUP_SH="${SCRIPTS}/backup.sh"

# ---- 1. 前置检查 ----
command -v node >/dev/null 2>&1 || die "未找到 node"
[ -f "${ENV_FILE}" ] || die "环境文件缺失：${ENV_FILE}（先运行 install.sh 并填写）"
[ -d "${SRC}" ] || die "源码目录缺失：${SRC}（先运行 sync-src.sh）"
command -v corepack >/dev/null 2>&1 || die "未找到 corepack"
curl -fsS -m 2 http://127.0.0.1 >/dev/null 2>&1 && nginx -t >/dev/null 2>&1 || true
echo "[publish] node $(node -v) / 环境文件 OK"

# ---- 2. 部署前备份 / 空部署记录 ----
PREV=""
if [ -L "${CURRENT}" ] && [ -d "$(readlink -f "${CURRENT}")" ]; then
  PREV="$(readlink -f "${CURRENT}")"
  echo "[publish] 备份当前版本与 SQLite 数据..."
  bash "${BACKUP_SH}" || die "备份失败，中止发布（不得在未确认备份与回滚路径前覆盖现有部署）"
else
  echo "[publish] 空部署（服务器上尚无本项目版本）——记录初始状态"
fi

# ---- 3. 复制源码到新版本目录（不碰数据/环境文件/旧版本）----
mkdir -p "${REL}"
rsync -az --delete \
  --exclude 'node_modules' --exclude '.next' --exclude '.pnpm-store' --exclude '.corepack' \
  --exclude 'dist' --exclude 'out' --exclude 'coverage' --exclude '.git' \
  --exclude 'content/.index' --exclude 'deploy/api' --exclude '_scratch' \
  --exclude '*.log' --exclude '.env' --exclude '.env.*' \
  "${SRC}/" "${REL}/"
echo "[publish] 新版本目录：${REL}"

cd "${REL}"
# ---- 4. 依赖安装（官方 registry：项目 .npmrc 强制）----
corepack pnpm install --frozen-lockfile
# ---- 5. 构建（Phase 9B 修正顺序：先在干净环境按拓扑构建各包（生成 dist），再 typecheck/内容校验/索引；
#      否则干净机器上 @laoyouju/shared 的 dist 尚不存在，retrieval 类型检查因缺少伴侣声明而失败）----
corepack pnpm run lint
env -u NEXT_PUBLIC_API_BASE_URL -u NEXT_PUBLIC_SITE_URL corepack pnpm -r run build
corepack pnpm run typecheck
corepack pnpm run content:validate
corepack pnpm run retrieval:build
echo "[publish] 构建完成"

# ---- 6. 权限（发布目录只读；属主 root:laoyouju）----
chown -R root:laoyouju "${REL}"
# Phase 9B：使用 a+rX（否则组位为空时，属于 laoyouju 组的服务用户会被组匹配拒绝——705 权限曾导致 CHDIR 失败）
chmod -R a+rX "${REL}"
# Phase 9A：SELinux Enforcing 时对新版本静态文件恢复正确上下文（install.sh 已注册 /opt/laoyouju 规则；绝不关闭 SELinux）
if command -v restorecon >/dev/null 2>&1; then
  restorecon -RF "${REL}" 2>/dev/null || true
fi

# ---- 7. 原子切换 + 重启 ----
ln -sfn "${REL}" "${CURRENT}"
systemctl restart laoyouju-api
systemctl reload nginx 2>/dev/null || true

# ---- 8. 健康检查（失败自动回滚）----
ok=0
for i in $(seq 1 15); do
  sleep 1
  if curl -fsS -m 3 http://127.0.0.1:9000/api/v1/health >/dev/null 2>&1 \
     && curl -fsS -m 3 http://127.0.0.1/api/v1/health >/dev/null 2>&1 \
     && curl -fsSI -m 3 http://127.0.0.1/ 2>/dev/null | head -1 | grep -q '200'; then
    ok=1; break
  fi
done
if [ "${ok}" = "1" ]; then
  echo "[publish] 健康检查通过"
else
  echo "[publish] 健康检查失败——自动回滚"
  if [ -n "${PREV}" ]; then
    ln -sfn "${PREV}" "${CURRENT}"
    systemctl restart laoyouju-api
    echo "[publish] 已回滚到 ${PREV}（新版本保留在 ${REL} 供排查）"
  fi
  exit 1
fi

# ---- 9. 保留最近 3 个版本（数据目录不影响）----
ls -1dt /opt/laoyouju/releases/*/ 2>/dev/null | tail -n +4 | while read -r old; do
  echo "[publish] 清理旧版本：${old}"
  rm -rf "${old}"
done

# ---- 10. 刷新运维脚本副本 ----
install -d -m 0755 -o root -g root /opt/laoyouju/scripts
cp "${SCRIPTS}"/*.sh /opt/laoyouju/scripts/ 2>/dev/null || true
chmod 0755 /opt/laoyouju/scripts/*.sh 2>/dev/null || true

echo "[publish] 完成（当前版本：$(readlink -f '/opt/laoyouju/current' 2>/dev/null || echo '?')）"
