#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— 最小防火墙规则（Phase 9；服务器 root）
# 默认 dry-run；--apply 生效。原则：入站仅 22/80；9000 一律拒绝；
# 出站不限制（需访问 DeepSeek/WSA API 与 npm 官方 registry）。
# 云控制台安全组也按同一最小原则配置（重点：不得放行 9000）。
# ============================================================
set -euo pipefail

APPLY=0
case "${1:-}" in
  --apply) APPLY=1 ;;
  *) echo "[firewall] dry-run 模式（加 --apply 生效）" ;;
esac
run() {
  if [ "${APPLY}" = "1" ]; then
    echo "[firewall] $*"; "$@"
  else
    echo "[firewall] (dry-run) $*"
  fi
}

if command -v ufw >/dev/null 2>&1; then
  run ufw allow 22/tcp
  run ufw allow 80/tcp
  run ufw deny 9000/tcp
  [ "${APPLY}" = "1" ] && run ufw --force enable
  [ "${APPLY}" = "1" ] && ufw status verbose
elif command -v firewall-cmd >/dev/null 2>&1; then
  run firewall-cmd --permanent --add-service=ssh
  run firewall-cmd --permanent --add-service=http
  run firewall-cmd --permanent --add-rich-rule='rule family=ipv4 port port=9000 protocol=tcp reject'
  [ "${APPLY}" = "1" ] && run firewall-cmd --reload
else
  echo "[firewall] 未检测到 ufw/firewalld：请使用云控制台安全组（仅放行 22/80；拒绝 9000）"
  echo "[firewall] 若使用 nftables/iptables，请人工配置：入站 ACCEPT 22/80、DROP 9000，默认 DROP 入站"
fi
