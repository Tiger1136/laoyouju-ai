#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— SQLite 预算库恢复（Phase 9A）
# 用法：restore.sh <备份文件绝对路径>
# 流程：校验备份(quick_check=ok) → 保存当前数据库可恢复副本 → 停服 → 恢复 → 启服 → 健康检查；
#      健康检查失败 → 自动恢复原数据库副本并重启（绝不留下不可用状态）。
# 发布版本回滚请用 rollback.sh；本脚本不触碰发布目录与任何持久化数据之外的内容。
# ============================================================
set -euo pipefail
die() { echo "[restore] ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "以 root 运行"

BACKUP="${1:-}"
[ -n "${BACKUP}" ] || die "用法: restore.sh <备份文件绝对路径>"
[ -f "${BACKUP}" ] || die "备份文件不存在：${BACKUP}"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 CLI 缺失，无法验证/恢复数据库"

DB="/var/lib/laoyouju/budget/budget.sqlite3"
BK="/var/lib/laoyouju/backups"
TS="$(date +%Y%m%d-%H%M%S)"

echo "[restore] 1/4 校验备份文件完整性..."
R="$(sqlite3 "${BACKUP}" "PRAGMA quick_check;" 2>&1 | tr -d "\r" || true)"
[ "${R}" = "ok" ] || die "备份文件校验失败（${R}）：拒绝恢复"

SAVED=0; SAVED_FILE=""
if [ -f "${DB}" ]; then
  echo "[restore] 2/4 保存当前数据库可恢复副本..."
  SAVED_FILE="${BK}/pre-restore-${TS}.sqlite3"
  sqlite3 "${DB}" ".backup '${SAVED_FILE}'" || die "保存当前数据库副本失败；中止（不覆盖当前数据）"
  R2="$(sqlite3 "${SAVED_FILE}" "PRAGMA quick_check;" 2>&1 | tr -d "\r" || true)"
  [ "${R2}" = "ok" ] || die "当前数据库副本校验失败（${R2}）；中止（不覆盖当前数据）"
  SAVED=1
fi

echo "[restore] 3/4 停服恢复..."
systemctl stop laoyouju-api
rm -f "${DB}-wal" "${DB}-shm"
cp -a "${BACKUP}" "${DB}"
chown laoyouju:laoyouju "${DB}"
systemctl start laoyouju-api

echo "[restore] 4/4 健康检查..."
OK_R=0
for i in $(seq 1 10); do
  sleep 1
  if curl -fsS -m 2 http://127.0.0.1:9000/api/v1/health >/dev/null 2>&1; then
    OK_R=1; break
  fi
done
if [ "${OK_R}" = "1" ]; then
  echo "[restore] 恢复完成，服务健康（原数据库副本：${SAVED_FILE:-无}）"
  exit 0
else
  echo "[restore] 健康检查失败——自动恢复原数据库..."
  if [ "${SAVED}" = "1" ] && [ -n "${SAVED_FILE}" ]; then
    systemctl stop laoyouju-api
    rm -f "${DB}-wal" "${DB}-shm"
    cp -a "${SAVED_FILE}" "${DB}"
    chown laoyouju:laoyouju "${DB}"
    systemctl start laoyouju-api
    echo "[restore] 已恢复原数据库（${SAVED_FILE}）。请检查 journalctl -u laoyouju-api 与备份文件。"
  else
    echo "[restore] 无原数据库副本可用（恢复前数据库不存在）——保持失败状态并报告。"
  fi
  exit 1
fi