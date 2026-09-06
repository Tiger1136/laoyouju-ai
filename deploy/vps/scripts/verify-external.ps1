#requires -Version 5.1
<#
 劳有据 AI —— Windows 开发机外部公网验证（Phase 9A.1）
 用法（Windows PowerShell）：
   powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\verify-external.ps1 -HostAlias laoyouju_lh
 说明：
   - 在开发机上通过公网 IPv4 真正访问 80 端口（不是服务器访问自身公网 IP）；
   - 公网 IP 从服务器 metadata 取得，仅保存在内存变量；所有输出只显示脱敏值（x.x.x.*）；
   - 验证前先重载服务（sudo systemctl restart laoyouju-api，清除上一轮限流计数，保证计数从零开始）；
   - 计数规则：第 1 次 POST（正确 Origin）→ 200；随后 5 次（共 6 次在窗口内）逐次断言 200；第 7 次更换伪造 X-Forwarded-For → 必须 429；循环内每次响应都断言，不静默吞掉提前出现的 429；
   - 验证使用 out_of_scope 问题（不调用真实模型；服务器保持 LIMIT_KILL_SWITCH=on）；
   - 任一失败退出码非 0；不打印完整公网 IP。
#>
param(
  [Parameter(Mandatory = $true)][string]$HostAlias,
  [int]$HttpTimeoutSec = 10
)
$ErrorActionPreference = "Stop"
if ($HostAlias -notmatch "^[A-Za-z0-9_.-]+$") { Write-Host "[verify-external] ERROR: SSH 别名含非法字符"; exit 2 }
function Mask-IPv4([string]$ip) { $p = $ip.Split("."); return ($p[0] + "." + $p[1] + "." + $p[2] + ".*") }
$pass = 0; $fail = 0
function Check([string]$name, [bool]$ok) { if ($ok) { $script:pass++; Write-Host ("[verify-external] PASS: " + $name) } else { $script:fail++; Write-Host ("[verify-external] FAIL: " + $name) } }

# 1) 取得公网 IP（仅内存变量；绝不打印完整 IP）
$pub = (& ssh $HostAlias "curl -fsS -m 3 http://metadata.tencentyun.com/latest/meta-data/public-ipv4" 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $pub) { Write-Host "[verify-external] ERROR: 无法取得服务器公网 IP（请先检查 SSH 别名）"; exit 2 }
$pub = ($pub | Select-Object -First 1).Trim()
Write-Host ("[verify-external] 目标公网 IP（脱敏）: " + (Mask-IPv4 $pub))
$base = "http://" + $pub

# 2) 前置：重载 API 服务并等待就绪（恢复限流计数基线；不调用模型）
& ssh $HostAlias "sudo systemctl restart laoyouju-api" | Out-Null
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  try { $r = Invoke-WebRequest ($base + "/api/v1/health") -UseBasicParsing -TimeoutSec 5 -Headers @{ Origin = $base }; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch { }
}
Check "服务重启后健康检查就绪(基线已重置，0 次 ask 请求)" $ready

# 3) 静态页面与刷新路由
foreach ($p in @("/","/laws/","/cases/","/topics/","/ask/","/about/methodology/","/sitemap.xml","/robots.txt")) {
  try { $r = Invoke-WebRequest ($base + $p) -UseBasicParsing -TimeoutSec $HttpTimeoutSec; Check ("GET " + $p + " → 200") ($r.StatusCode -eq 200) }
  catch { $st = $_.Exception.Response.StatusCode.value__; Check ("GET " + $p + " → " + $st) $false }
}

# 4) 同源 API（携带正确 Origin）；ACAO 必须精确匹配
try {
  $h = Invoke-WebRequest ($base + "/api/v1/health") -UseBasicParsing -TimeoutSec $HttpTimeoutSec -Headers @{ Origin = $base }
  $acao = $h.Headers["Access-Control-Allow-Origin"]
  Check "/api/v1/health 同源 Origin → 200 且 ACAO 精确匹配" (($h.StatusCode -eq 200) -and ($acao -eq $base))
} catch { Check "/api/v1/health 同源 Origin" $false }

# 5) 恶意 Origin → 403
try {
  $evil = Invoke-WebRequest ($base + "/api/v1/health") -UseBasicParsing -TimeoutSec $HttpTimeoutSec -Headers @{ Origin = "http://evil.example.com" }
  Check ("恶意 Origin 被拒绝（应 403，得到 " + $evil.StatusCode + "）") ($evil.StatusCode -eq 403)
} catch { $st = $_.Exception.Response.StatusCode.value__; Check ("恶意 Origin 拒绝（HTTP " + $st + "）") ($st -eq 403) }

# 6) 客户端限流计数（重启后第 1 次 POST 为已计入的 1 次 → 第 6 次仍在窗口内）
#    第 7 次更换伪造 X-Forwarded-For 必须 429；循环内每次响应都断言。
$askBody = '{"question":"How to boil water"}'
$ok = $false
try {
  $r1st = Invoke-WebRequest ($base + "/api/v1/ask") -Method POST -ContentType "application/json" -Headers @{ Origin = $base } -Body $askBody -UseBasicParsing -TimeoutSec $HttpTimeoutSec
  $ok = ($r1st.StatusCode -eq 200) -and ($r1st.Content -match "out_of_scope")
} catch { }
Check "第 1 次（已计入）：同源 POST /ask → 200 且 out_of_scope（不调用模型）" $ok
$midOk = $true; $midDetail = ""
for ($i = 2; $i -le 6; $i++) {
  $st = 0
  try { $r = Invoke-WebRequest ($base + "/api/v1/ask") -Method POST -ContentType "application/json" -Headers @{ Origin = $base } -Body $askBody -UseBasicParsing -TimeoutSec $HttpTimeoutSec; $st = $r.StatusCode } catch { $st = $_.Exception.Response.StatusCode.value__ }
  if ($st -ne 200) { $midOk = $false; $midDetail = ("第 " + $i + " 次实际返回 " + $st) }
}
Check ("第 2..6 次（窗口内共 6 次）逐次断言均为 200" + $(if ($midDetail) { "；" + $midDetail } else { "" })) $midOk
try {
  $r7 = Invoke-WebRequest ($base + "/api/v1/ask") -Method POST -ContentType "application/json" -Headers @{ Origin = $base; "X-Forwarded-For" = "198.51.100.20" } -Body $askBody -UseBasicParsing -TimeoutSec $HttpTimeoutSec
  Check ("第 7 次更换伪造 X-Forwarded-For → 必须 429（实际 " + $r7.StatusCode + "）") ($r7.StatusCode -eq 429)
} catch { $st = $_.Exception.Response.StatusCode.value__; Check ("第 7 次更换伪造 X-Forwarded-For → 429（HTTP " + $st + "）") ($st -eq 429) }

# 7) 9000 外部不可达（Phase 9B：改用 HTTP 探测——必须【得不到】本服务健康响应；
#     说明：部分开发机出口网络为透明代理，原始 TCP Connect 会被网关“代答成功”，因此以 HTTP 探测为准：
#     只有收到 200 且 body 含 "ok":true 的健康响应才视为可达；拒绝/502/超时/畸形响应均视为不可达）
$reachable = $false
$probe = $null
try { $probe = Invoke-WebRequest ("http://" + $pub + ":9000/api/v1/health") -UseBasicParsing -TimeoutSec 5 } catch { }
if ($null -ne $probe -and $probe.StatusCode -eq 200 -and ($probe.Content -match '"ok":true')) { $reachable = $true }
Check "公网 :9000 不可达（HTTP 探测未得到本服务健康响应）" (-not $reachable)

Write-Host ("[verify-external] PASS=" + $pass + " FAIL=" + $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }