#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— SQLite 预算库在线备份（Phase 9A 简化版）
# 要求：sqlite3 CLI 必须存在（install.sh 已保证）；仅使用 SQLite 在线 .backup；
# 备份完成后对备份文件执行 PRAGMA quick_check 且结果必须为 ok。
# sqlite3 缺失 / .backup 失败 / 完整性检查失败 → 中止（不使用不完整的 WAL 复制假装成功）。
# 保留最近 7 份；不删除其他备份；不删除任何持久化数据。
# ============================================================
set -euo pipefail
die() { echo "[backup] ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "以 root 运行"

command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 CLI 缺失（请运行 install.sh 或手动安装 sqlite3）；中止备份（不使用复制替代）"

DB="/var/lib/laoyouju/budget/budget.sqlite3"
BK="/var/lib/laoyouju/backups"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="${BK}/budget-${TS}.sqlite3"
VERIFY="${BK}/budget-${TS}.verify.txt"

mkdir -p "${BK}"
if [ ! -f "${DB}" ]; then
  echo "[backup] 数据库不存在（尚未产生数据）——跳过（记录为空备份状态）"
  exit 0
fi

echo "[backup] 使用 SQLite 在线 .backup：${DB} → ${DEST}"
sqlite3 "${DB}" ".backup '${DEST}'" || die "在线备份失败（.backup 非零退出）"
echo "[backup] 校验备份完整性..."
R="$(sqlite3 "${DEST}" "PRAGMA quick_check;" 2>&1 | tr -d "\r" || true)"
if [ "${R}" != "ok" ]; then
  rm -f "${DEST}"
  die "备份完整性检查未通过：${R}；已删除该备份（不会把不完整副本当作成功备份）"
fi
echo "[backup] 备份完成且 quick_check=ok：${DEST}"

# 记录当前版本
if [ -L /opt/laoyouju/current ]; then
  readlink -f /opt/laoyouju/current > "${BK}/release-${TS}.txt" || true
fi

# 保留最近 7 份备份（只清理备份目录中的历史备份文件，不触碰任何数据/版本）
ls -1t "${BK}"/budget-*.sqlite3 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "[backup] 完成"