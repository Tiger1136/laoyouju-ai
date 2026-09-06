#requires -Version 5.1
<#
 劳有据 AI —— Windows 开发机 → 服务器源码同步（Phase 9A.1）
 用法（Windows PowerShell 5.1，使用系统自带 ssh/scp/tar，无额外工具依赖）：
   打包验证（不联网）： powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\sync-src.ps1 -PackageOnly
   完整同步：         powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\sync-src.ps1 -HostAlias laoyouju_lh
 说明：
   - 仓库路径：git rev-parse --show-toplevel + Resolve-Path 得到绝对路径（仅作正斜杠归一化，用字符码避免转义陷阱）；
   - 文件清单来自 git（ls-files -co --exclude-standard）：包含工作树已修改与未跟踪的 Phase 9/9A 文件，
     并按 .gitignore 排除 .git、.env*、密钥、node_modules、构建缓存（.next/out/dist/.pnpm-store/.corepack/content/.index）与临时目录；
   - 额外排除根目录 .env；归档内容做必做校验（AGENTS.md、package.json、deploy/vps/scripts/install.sh 存在且无敏感/缓存条目）；
   - 首次同步不依赖服务器 laoyouju 用户组：远端解包到独立临时目录（root:root），校验必备文件后原子替换 /opt/laoyouju/src，
     重复同步通过“整体换目录”不遗留已删除旧文件；替换失败自动保留原源码目录并清理本次临时目录；用户/权限由 install.sh 负责；
   - SSH 别名与目标路径经严格字符校验（字母数字 . _ - /），避免字符串拼接注入；输出不含公网 IP 与凭据。
#>
param(
  [string]$HostAlias = "",
  [string]$DestDir = "/opt/laoyouju/src",
  [switch]$PackageOnly
)
$ErrorActionPreference = "Stop"

function Fail([string]$msg) { Write-Error $msg; exit 1 }
function AssertSafeToken([string]$value, [string]$what) {
  if ($value -notmatch "^[A-Za-z0-9_.-]+$") { Fail ($what + " 含非法字符（仅允许字母/数字/. /_ /-）：" + $value) }
  return $value
}
function AssertSafeDest([string]$value) {
  if ($value -notmatch "^/[A-Za-z0-9/_.-]+$") { Fail ("目标目录非法（必须为绝对路径且无空格/特殊字符）：" + $value) }
  if ($value -match "\.\.|//|/$") { Fail ("目标目录非法（不得包含 .. 空段或尾斜杠）：" + $value) }
  return $value
}

$DestDir = AssertSafeDest $DestDir
if ($HostAlias -ne "") { $HostAlias = AssertSafeToken $HostAlias "SSH 别名" }
if ($HostAlias -eq "" -and (-not $PackageOnly)) { Fail "需要 -HostAlias（或仅打包验证使用 -PackageOnly）" }

# ---- 仓库绝对路径（Resolve-Path；正斜杠归一化用字符码，避免 Replace("","/") 一类运行期错误）----
$gitRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $gitRoot) { Fail "请在 git 仓库内运行（git rev-parse --show-toplevel 失败）" }
$gitRoot = ($gitRoot | Select-Object -First 1).Trim()
$resolved = Resolve-Path -LiteralPath $gitRoot -ErrorAction SilentlyContinue
if (-not $resolved) { Fail ("Resolve-Path 无法解析仓库路径：" + $gitRoot) }
$repo = $resolved.Path.Replace([char]92, [char]47)
Write-Host ("[sync] 仓库: " + $repo)

$tmpRoot = Join-Path $env:TEMP ("laoyouju-sync-" + [guid]::NewGuid().ToString("N"))
$listFile = Join-Path $tmpRoot "file-list.txt"
$archive = Join-Path $tmpRoot "laoyouju-src.tar.gz"
$remoteTmp = "/tmp/laoyouju-sync-" + [guid]::NewGuid().ToString("N") + ".tar.gz"
$networkUsed = $false
try {
  New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
  # 1) 文件清单：git 跟踪 + 未跟踪但未忽略（含工作树已修改/未跟踪文件）
  & git -C $repo ls-files -co --exclude-standard | Out-File -FilePath $listFile -Encoding ascii
  if ($LASTEXITCODE -ne 0) { Fail ("git ls-files 失败 (exit " + $LASTEXITCODE + ")") }
  $count = (Get-Content $listFile | Measure-Object -Line).Lines
  if ($count -eq 0) { Fail "文件清单为空，中止（避免空部署）" }
  # 2) 打包（额外排除根目录 .env；成员为相对路径，远端解包无需 strip）
  & tar -czf $archive -C $repo -T $listFile --exclude "./.env"
  if ($LASTEXITCODE -ne 0) { Fail ("tar 打包失败 (exit " + $LASTEXITCODE + ")") }
  if (-not (Test-Path $archive)) { Fail "归档文件未生成" }
  # 3) 归档内容必做校验（真实读取归档成员）
  $members = & tar -tzf $archive
  if ($LASTEXITCODE -ne 0) { Fail ("归档读取失败 (exit " + $LASTEXITCODE + ")") }
  $required = @("AGENTS.md", "package.json", "deploy/vps/scripts/install.sh")
  foreach ($req in $required) { if (-not ($members -contains $req)) { Fail ("归档缺少必要文件：" + $req) } }
  $forbidden = @("(^|/)node_modules", "(^|/)\.git($|/)", "(^|/)\.next", "(^|/)out($|/)", "(^|/)dist($|/)", "(^|/)_scratch($|/)", "(^|/)\.pnpm-store", "(^|/)\.corepack", "(^|/)deploy/api/", "(^|/)\.env($|/)", "(^|/)\.env\.local")
  foreach ($pat in $forbidden) { foreach ($m in $members) { if ($m -match $pat) { Fail ("归档包含应排除的条目：" + $m) } } }
  Write-Host ("[sync] 文件数: " + $count + "（归档校验通过）")
  if ($PackageOnly) {
    Write-Host "[sync] PackageOnly 模式：打包+校验完成，未传输。退出 0。"
    exit 0
  }
  # 4) 传输到远端 /tmp（独立临时路径)
  $networkUsed = $true
  & scp -q $archive ("{0}:{1}" -f $HostAlias, $remoteTmp)
  if ($LASTEXITCODE -ne 0) { Fail ("scp 传输失败 (exit " + $LASTEXITCODE + ")；请先配置 SSH 别名并执行 ssh " + $HostAlias + " 验证指纹") }
  # 5) 远端：独立临时目录解包 -> 校验必备文件 -> 原子替换 DEST（失败保留旧目录并清理临时目录；不做任何 chown/chmod，用户与权限由 install.sh 设置）
  $remoteScript = @'
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "ERR: must run as root" >&2; exit 1; }
ARCHIVE="$1"; DEST="$2"
PARENT="$(dirname "$DEST")"
STAGE=""; OLD=""
cleanup() {
  if [ -n "$STAGE" ] && [ -e "$STAGE" ]; then rm -rf "$STAGE"; fi
  if [ -n "$OLD" ] && [ -e "$OLD" ] && [ ! -e "$DEST" ]; then mv "$OLD" "$DEST" 2>/dev/null || true; fi
}
trap cleanup EXIT
mkdir -p "$PARENT"
STAGE="$(mktemp -d "$PARENT/.laoyouju-stage-XXXXXX")"
echo "[sync-remote] stage=$STAGE"
tar -xzf "$ARCHIVE" -C "$STAGE"
test -f "$STAGE/AGENTS.md" || { echo "ERR: AGENTS.md missing" >&2; exit 1; }
test -f "$STAGE/package.json" || { echo "ERR: package.json missing" >&2; exit 1; }
test -f "$STAGE/deploy/vps/scripts/install.sh" || { echo "ERR: install.sh missing" >&2; exit 1; }
if [ -e "$DEST" ]; then
  OLD="$PARENT/.laoyouju-src-old-$$"
  rm -rf "$OLD"
  mv "$DEST" "$OLD"
fi
mv "$STAGE" "$DEST"
STAGE=""
rm -rf "$OLD"; OLD=""
echo "[sync-remote] done $DEST"
'@
  $remoteScript | & ssh $HostAlias ("sudo bash -s -- " + $remoteTmp + " " + $DestDir)
  if ($LASTEXITCODE -ne 0) { Fail ("远端部署失败 (exit " + $LASTEXITCODE + ")；原源码目录应已保留，本次临时目录已清理") }
  Write-Host ("[sync] 完成 → " + $DestDir + "（用户/权限将在 install.sh 中设置；root:root 首次同步安全）")
} finally {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $tmpRoot
  if ($networkUsed) { & ssh $HostAlias ("rm -f " + $remoteTmp) 2>$null | Out-Null }
}