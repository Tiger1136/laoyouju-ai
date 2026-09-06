#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— 开发机 → 服务器源码同步（Phase 9）
# 在开发机（Windows Git Bash/WSL/任意 Linux）运行：
#   bash deploy/vps/scripts/sync-src.sh <ssh别名> [目标目录]
# 例：bash deploy/vps/scripts/sync-src.sh laoyouju_lh
# 只同步仓库源码与部署材料；不带 node_modules/构建产物/Git 元数据/密钥文件。
# ============================================================
set -euo pipefail

TARGET="${1:?用法: sync-src.sh <ssh别名 或 user@host> [目标目录]}"
DEST="${2:-/opt/laoyouju/src}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

[ -d "${ROOT}/.git" ] || { echo "[sync] 这不是仓库根目录（${ROOT}）" >&2; exit 1; }
command -v rsync >/dev/null 2>&1 || { echo "[sync] 本机需要 rsync（Windows 可用 Git Bash 自带的 rsync）" >&2; exit 1; }

rsync -az --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.pnpm-store' \
  --exclude '.corepack' \
  --exclude 'dist' \
  --exclude 'out' \
  --exclude 'coverage' \
  --exclude '.git' \
  --exclude 'content/.index' \
  --exclude 'deploy/api' \
  --exclude '_scratch' \
  --exclude '.dsh' \
  --exclude '.agent-sessions' \
  --exclude '*.log' \
  --exclude '.env' \
  --exclude '.env.*' \
  "${ROOT}/" "${TARGET}:${DEST}/"

echo "[sync] 完成 → ${TARGET}:${DEST}/"
