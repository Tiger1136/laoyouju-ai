#!/usr/bin/env bash
# ============================================================
# 劳有据 AI —— 服务器端自检（Phase 9A；在服务器上运行；输出脱敏）
# 说明：本脚本从“服务器本机”通过自身公网 IP 走一遍 HTTP 路径，仅作为服务器端自检；
#       它“不是”外部公网验证（属于服务器访问自身公网 IP）。
#       真实外部验证必须由开发机执行：powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\verify-external.ps1 -HostAlias <别名>
# 输出中公网 IP 一律脱敏（x.x.x.*）；不输出密钥。
# ============================================================
set -uo pipefail
OK=1
pass() { echo "[verify] PASS: $*"; }
fail() { echo "[verify] FAIL: $*"; OK=0; }
mask() { printf '%s' "${1:-}" | awk -F. '{print $1"."$2"."$3".*"}'; }

# 公网 IP（实例 metadata；输出脱敏）
PUB=""
for src in "http://metadata.tencentyun.com/latest/meta-data/public-ipv4"; do
  PUB="$(curl -fsS -m 3 "${src}" 2>/dev/null || true)"
  [ -n "${PUB}" ] && break
done
echo "[verify] 服务器公网 IP（脱敏）：$(mask "${PUB}")"
echo "[verify] 检查指纹：$(md5sum /opt/laoyouju/current/functions/api/dist/server.js 2>/dev/null | awk '{print $1}' || true)"
[ -n "${PUB}" ] || { fail "无法取得公网 IP（metadata 失败）"; }

R="curl -fsS -m 6"

# ---- 1. 静态资源 ----
for p in "/" "/laws/" "/cases/" "/topics/" "/ask/" "/about/methodology/" "/sitemap.xml" "/robots.txt"; do
  code="$(curl -s -o /dev/null -m 6 -w '%{http_code}' "http://${PUB}${p}" 2>/dev/null || echo 000)"
  case "${code}" in
    200) pass "GET ${p} → 200" ;;
    *)   fail "GET ${p} → ${code}" ;;
  esac
done

# ---- 2. 客户端静态资源（首屏 chunk 可加载）----
CHUNK="$(curl -s -m 6 "http://${PUB}/" 2>/dev/null | grep -oE 'href="[^"]+.css"|src="[^"]+.js"' | head -1 | sed -E 's/^(href|src)="//; s/"$//' || true)"
if [ -n "${CHUNK}" ] && curl -s -o /dev/null -m 6 -w '' "http://${PUB}${CHUNK}" 2>/dev/null; then
  pass "静态 chunk 可加载"
else
  fail "静态 chunk 校验失败"
fi

# ---- 3. 前端同源 /api/ ----
H="$(curl -s -m 6 "http://${PUB}/api/v1/health" 2>/dev/null || true)"
echo "${H}" | grep -q '"ok":true' && pass "/api/v1/health 同源 200 且 payload 正常" || fail "/api/v1/health 校验失败"

# ---- 4. 无模型路径（out_of_scope / 400）----
R1="$(curl -s -m 6 -o /dev/null -w '%{http_code}' -X POST "http://${PUB}/api/v1/ask" -H 'Content-Type: application/json' -d '{"question":"怎么做红烧肉"}' 2>/dev/null || echo 000)"
[ "${R1}" = "200" ] && pass "out_of_scope 200（不调用模型）" || fail "out_of_scope → ${R1}"
R2="$(curl -s -m 6 -o /dev/null -w '%{http_code}' -X POST "http://${PUB}/api/v1/ask" -H 'Content-Type: application/json' -d '{"question":"  "}' 2>/dev/null || echo 000)"
[ "${R2}" = "400" ] && pass "参数校验 400" || fail "参数校验 → ${R2}"

# ---- 5. 客户端限流（同源请求；伪造转发头不生效）----
HDRS='-H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.77"'
for i in 1 2 3 4 5 6; do
  curl -s -m 6 -o /dev/null "http://${PUB}/api/v1/ask" -H 'Content-Type: application/json' -H "X-Forwarded-For: 203.0.113.77" -d '{"question":"怎么做红烧肉"}' >/dev/null 2>&1 || true
done
R7="$(curl -s -m 6 -o /dev/null -w '%{http_code}' "http://${PUB}/api/v1/ask" -H 'Content-Type: application/json' -H "X-Forwarded-For: 198.51.100.9" -d '{"question":"怎么做红烧肉"}' 2>/dev/null || echo 000)"
[ "${R7}" = "429" ] && pass "伪造转发头无法绕过客户端限流（第 7 次 429）" || fail "伪造转发头绕过/不达预期 → ${R7}（预期 429）"

# ---- 6. 9000 公网不可达（服务器→自身公网 IP；仅自检参考；外部不可达以 verify-external.ps1 为准）----
C9="$(curl -s -m 4 -o /dev/null -w '%{http_code}' "http://${PUB}:9000/" 2>/dev/null || echo REFUSED)"
case "${C9}" in
  REFUSED|000) pass "公网 :9000 不可达（拒绝/超时）" ;;
  *) fail "公网 :9000 可达（${C9}）——必须立即修复防火墙/监听地址" ;;
esac
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null | grep ':9000 ' | grep -q '127.0.0.1' && pass "ss 确认 9000 仅绑定 127.0.0.1" || fail "ss 未确认 9000 仅绑定 127.0.0.1"
  ss -tlnp 2>/dev/null | grep ':9000 ' | grep -qE '0.0.0.0|::' && fail "9000 存在公网绑定" || pass "9000 无公网绑定"
fi

# ---- 7. 日志脱敏扫描（不输出日志内容；仅匹配敏感模式）----
LOGS="$(journalctl -u laoyouju-api --no-pager -n 200 2>/dev/null || true)"
echo "${LOGS}" | grep -qE 'sk-[A-Za-z0-9]{16,}' && fail "应用日志疑似含密钥" || pass "应用日志无 sk- 密钥"
echo "${LOGS}" | grep -qE 'DEEPSEEK_API_KEY=[A-Za-z0-9]' && fail "应用日志疑似含环境变量值" || pass "应用日志无环境变量值"
if [ -f /var/log/nginx/laoyouju.access.log ]; then
  grep -qE 'sk-[A-Za-z0-9]{16,}' /var/log/nginx/laoyouju.access.log && fail "Nginx 日志疑似含密钥" || pass "Nginx 日志无 sk- 密钥"
fi

echo ""
if [ "${OK}" = "1" ]; then echo "[verify] 全部通过"; exit 0; else echo "[verify] 存在失败项（按本阶段约定：失败优先回滚，不得关闭限流/扩大端口）"; exit 1; fi
