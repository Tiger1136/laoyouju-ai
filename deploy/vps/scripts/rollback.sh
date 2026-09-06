#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— 版本回滚（Phase 9；服务器 root）
# 切换到“上一可用版本”并重启；数据（SQLite/备份）不受影响。
# ============================================================
set -euo pipefail
die() { echo "[rollback] ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "以 root 运行"

CURRENT="/opt/laoyouju/current"
[ -L "${CURRENT}" ] || die "当前不存在发布链接（尚未发布？）"
CUR="$(readlink -f "${CURRENT}")"

PREV=""
for d in $(ls -1dt /opt/laoyouju/releases/*/ 2>/dev/null); do
  if [ "$(readlink -f "$d")" != "$(readlink -f "$CUR")" ]; then
    PREV="$d"
    break
  fi
done
[ -n "${PREV}" ] || die "没有可回滚的上一版本"

echo "[rollback] 当前：${CUR}"
echo "[rollback] 目标：${PREV}"
ln -sfn "${PREV}" "${CURRENT}"
systemctl restart laoyouju-api

for i in $(seq 1 15); do
  sleep 1
  if curl -fsS -m 3 http://127.0.0.1:9000/api/v1/health >/dev/null 2>&1; then
    echo "[rollback] 回滚完成，服务健康"
    exit 0
  fi
done
die "回滚后服务未就绪（journalctl -u laoyouju-api 排查；可再次执行 rollback.sh 或手动修复链接）"
