#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— 服务器本机健康检查（Phase 9A）
# 断言：API 监听 127.0.0.1:9000（不暴露公网）；Nginx 80 提供静态前端与 /api 反代；
#       health 200；应用状态活跃；SQLite 预算库存在且 quick_check=ok。
# 退出码契约：全部通过 → 0；任一失败 → 非 0（由 deploy/vps/tests/deploy-config.test.mjs 断言，防止反转）。
# ============================================================
set -uo pipefail
OK=1
pass() { echo "[health] PASS: $*"; }
fail() { echo "[health] FAIL: $*"; OK=0; }

curl -fsS -m 3 http://127.0.0.1:9000/api/v1/health >/dev/null 2>&1 && pass "Node API 本机 health 200" || fail "Node API 本机 health 失败"
systemctl is-active --quiet laoyouju-api 2>/dev/null && pass "systemd laoyouju-api active" || fail "systemd laoyouju-api 未激活"
systemctl is-active --quiet nginx 2>/dev/null && pass "nginx active" || fail "nginx 未激活"
curl -fsS -m 3 http://127.0.0.1/api/v1/health >/dev/null 2>&1 && pass "Nginx → /api/v1/health 200" || fail "Nginx → /api/v1/health 失败"
curl -fsSI -m 3 http://127.0.0.1/ 2>/dev/null | head -1 | grep -q "200" && pass "Nginx 静态首页 200" || fail "Nginx 静态首页 失败"

# SQLite 预算库状态（文件存在 + 完整性 quick_check 结果必须为 ok）
DB="/var/lib/laoyouju/budget/budget.sqlite3"
if command -v sqlite3 >/dev/null 2>&1; then
  if [ -f "${DB}" ]; then
    QCK="$(sqlite3 "${DB}" "PRAGMA quick_check;" 2>/dev/null || true)"
    if [ "${QCK}" = "ok" ]; then pass "SQLite 预算库存在且 quick_check=ok"; else fail "SQLite quick_check 异常（${QCK:-无法读取}）"; fi
  else
    pass "SQLite 预算库尚未创建（首次运行属正常；BUDGET_STORE=sqlite 配置已就绪）"
  fi
else
  fail "sqlite3 CLI 缺失（安装脚本应保证存在）"
fi

# 9000 必须只绑定回环
if command -v ss >/dev/null 2>&1; then
  BIND="$(ss -tlnp 2>/dev/null | grep ":9000 " || true)"
  echo "${BIND}" | grep -q "127.0.0.1:9000" && pass "9000 绑定 127.0.0.1" || fail "9000 未绑定 127.0.0.1（检查 HOST=127.0.0.1）"
  if echo "${BIND}" | grep -qE "0.0.0.0:9000|\[\]:9000|::]:9000"; then
    fail "9000 绑定了公网地址（0.0.0.0/::）——必须立即修复"
  else
    pass "9000 未绑定公网地址"
  fi
elif command -v netstat >/dev/null 2>&1; then
  netstat -tlnp 2>/dev/null | grep ":9000 " | grep -q "127.0.0.1" && pass "9000 绑定 127.0.0.1" || fail "9000 未绑定 127.0.0.1"
else
  fail "无 ss/netstat，无法断言 9000 绑定地址"
fi

# 公网视角（外部）验证由开发机 verify-external.ps1 执行；本脚本只断言服务器内绑定/服务状态。
echo ""
if [ "${OK}" = "1" ]; then
  echo "[health] 全部通过"
  exit 0
else
  echo "[health] 存在失败项"
  exit 1
fi