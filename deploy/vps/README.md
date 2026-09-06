# deploy/vps —— 腾讯云轻量应用服务器（Lighthouse）部署材料（Phase 9 / 9A）

> 目标：把“劳有据 AI”从 CloudBase 专用部署方式适配到普通 Linux 单机（腾讯云轻量应用服务器），
> 在不解析域名、不做 HTTPS 的前提下，通过服务器公网 IPv4 完成 HTTP 验证（本阶段仅以“服务器端自检＋开发机外部验证”组合提供证据）。
> 本目录全部为**模板与说明**，不含任何密钥、服务器地址或凭据；密钥只存在于服务器受限环境文件中。

## 1. 结构

| 路径 | 用途 |
|---|---|
| `deploy/vps/nginx/laoyouju.conf` | Nginx 站点模板（80：静态前端 + /api/ 反代本机 Node；敏感路径正则经契约测试验证） |
| `deploy/vps/systemd/laoyouju-api.service` | systemd 模板（`__NODE_BIN__` 占位符由 install.sh 注入 Node 真实绝对路径；安全加固） |
| `deploy/vps/systemd/journald-laoyouju.conf` | journald 日志上限（应用日志轮转） |
| `deploy/vps/env/laoyouju.env.example` | 服务端环境变量示例（**首次公网部署默认 LIMIT_KILL_SWITCH=on、DEEPSEEK_API_KEY 留空**） |
| `deploy/vps/scripts/install.sh` | 服务器一次性幂等安装（OpenCloudOS/RHEL conf.d 与 Debian sites-enabled 双布局；冲突安全停止；SELinux 最小策略） |
| `deploy/vps/scripts/sync-src.ps1` | **Windows 开发机**同步脚本（PowerShell 5.1 + 系统自带 ssh/scp/tar；git 文件清单） |
| `deploy/vps/scripts/publish.sh` | 服务器构建发布（版本目录 + 原子切换 + 失败自动回滚 + restorecon） |
| `deploy/vps/scripts/backup.sh` | SQLite 在线 .backup + 完整性校验（sqlite3 缺失/校验失败即中止） |
| `deploy/vps/scripts/restore.sh` | 恢复（先校验备份、保存当前库副本、健康失败自动回滚原库） |
| `deploy/vps/scripts/rollback.sh` | 版本回滚（切换 current 软链 + 重启） |
| `deploy/vps/scripts/healthcheck.sh` | 服务器本机健康检查（服务/Nginx/SQLite/9000 绑定；退出码契约有测试） |
| `deploy/vps/scripts/verify-public.sh` | **服务器端自检**（服务器访问自身公网 IP，**不是**外部验证） |
| `deploy/vps/scripts/verify-external.ps1` | **Windows 开发机**外部公网验证（真实外部视角；IP 输出脱敏） |
| `deploy/vps/scripts/firewall.sh` | 最小防火墙（22/80；拒绝 9000；默认 dry-run，--apply 生效） |
| `deploy/vps/tests/deploy-config.test.mjs` | 部署配置契约测试（node 运行；随 `pnpm run check` 执行；16 项） |

## 2. 目录与运行边界（发布/数据/环境/日志分离）

| 内容 | 位置 | 说明 |
|---|---|---|
| 发布版本 | `/opt/laoyouju/releases/<ts>` | 每个版本一个目录（含 node_modules 与构建产物），`/opt/laoyouju/current` symlink 指向当前版本；发布失败保留上一版本 |
| 源码同步区 | `/opt/laoyouju/src` | sync-src.ps1 的目标（可随时被覆盖；不作为运行目录） |
| 持久化数据 | `/var/lib/laoyouju/budget/budget.sqlite3` | SQLite 预算库（WAL）；**绝不放在发布目录/前端产物/Git 内**；普通发布/回滚不触碰 |
| 备份 | `/var/lib/laoyouju/backups/` | `backup.sh` 输出（每份均经 quick_check 校验；保留 7 份） |
| 环境配置 | `/etc/laoyouju/laoyouju.env` | 0600 root:laoyouju（仅服务用户/root 可读）；密钥只存在于此处 |
| 日志 | journald（64M 上限）+ `/var/log/nginx/laoyouju.*.log` | Nginx 用系统自带 logrotate |

所有权：服务以专用低权限用户 `laoyouju`（system、nologin）运行；发布目录 root:laoyouju 只读；数据/日志属主 laoyouju。

## 3. 服务器前置条件（用户手动完成）

1. 服务器已购买腾讯云轻量应用服务器（OpenCloudOS Server 9 或其他 Linux），**Node.js 22.12.0 已安装**（`node -v`）。
2. 本机已配置**安全的 SSH 入口**（密钥登录、仅授权管理机；禁用密码登录）。示例（本机 `~/.ssh/config`）：
   ```
   Host laoyouju_lh
     HostName <服务器IPv4>          # 请勿在聊天/报告中明文传递
     User root
     IdentityFile ~/.ssh/id_ed25519
   ```
   并执行一次 `ssh laoyouju_lh`（**注意命令是 `ssh ` 加别名，不是 `ssh-laoyouju_lh`**），把主机指纹加入 known_hosts。
3. 腾讯云控制台“防火墙/安全组”仅放行 22 与 80（**不得放行 9000**）。
4. `corepack` 可用（Node 22 自带；不可用时执行 `sudo npm install -g pnpm@11.24.0 --registry=https://registry.npmjs.org/`）。

> 未完成上述最小安全配置前，**不要**把服务器地址或口令发给任何人/任何会话。

## 4. 安装（一次性；幂等；请在服务器上以 root 执行）

```powershell
# 0) 无网络预检（可选，Phase 9A.1）：打包+校验（git 清单/必备文件/敏感条目/临时清理），不连接服务器
powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\sync-src.ps1 -PackageOnly
# 1) Windows 开发机同步源码到服务器（首次同步为 root:root 解包；用户与权限由 install.sh 设置；远端独立临时目录+原子替换）
powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\sync-src.ps1 -HostAlias laoyouju_lh
# 2) 服务器上执行安装（创建用户、目录、systemd、nginx（事务式）、环境文件、防火墙、SELinux 最小策略）
ssh laoyouju_lh "sudo bash /opt/laoyouju/src/deploy/vps/scripts/install.sh"
# 3) 编辑服务器环境文件（首次公网部署：保持 LIMIT_KILL_SWITCH=on、DEEPSEEK_API_KEY 留空；仅填写 ALLOWED_ORIGINS）
ssh laoyouju_lh "sudo vi /etc/laoyouju/laoyouju.env"
```

`laoyouju.env` 关键项：`HOST=127.0.0.1`；`BUDGET_STORE=sqlite` + `BUDGET_SQLITE_PATH=/var/lib/laoyouju/budget/budget.sqlite3`；
`TRUSTED_PROXY=127.0.0.1`；`ALLOWED_ORIGINS=http://<公网IP>`（浏览器同源 POST 仍携带 Origin，必须精确配置、不带端口）；
`LIMIT_KILL_SWITCH=on`（默认；真实模型测试另行授权后改 off）；`DEEPSEEK_API_KEY=`（留空）。

## 5. 发布新版本（每次迭代；在服务器上以 root 执行；幂等；失败自动回滚）

```bash
sudo bash /opt/laoyouju/current/deploy/vps/scripts/publish.sh
```

`publish.sh` 流程：前置检查 → **备份**（首次为空部署记录）→ 复制源码到新版本目录 → `pnpm install --frozen-lockfile`（官方 registry）→
lint/typecheck/构建（前端默认同源 /api/，不注入 NEXT_PUBLIC_*）→ 内容校验 → 权限 → **restorecon（SELinux 上下文恢复）** → 原子切换 → 重启 →
健康检查（失败自动回滚）→ 保留最近 3 个版本。

## 6. 回滚 / 备份 / 恢复

```bash
sudo bash /opt/laoyouju/current/deploy/vps/scripts/rollback.sh        # 版本回滚（数据不动）
sudo bash /opt/laoyouju/current/deploy/vps/scripts/backup.sh         # SQLite 在线备份（quick_check 校验）
sudo bash /opt/laoyouju/current/deploy/vps/scripts/restore.sh /var/lib/laoyouju/backups/budget-<ts>.sqlite3
```

恢复前会校验备份并**保存当前库可恢复副本**；恢复后健康检查失败会自动还原原库。普通发布/回滚**不会删除**持久化数据。

## 7. 验证（两层，缺一不可）

```bash
# 服务器端：服务状态 / Nginx 反代 / SQLite / 9000 仅绑定 127.0.0.1（本机）
ssh laoyouju_lh "sudo bash /opt/laoyouju/current/deploy/vps/scripts/healthcheck.sh"
# 服务器端自检（可选）：curl 自身公网 IP 走一遍；不是外部验证
ssh laoyouju_lh "sudo bash /opt/laoyouju/current/deploy/vps/scripts/verify-public.sh"
```

```powershell
# 开发机（Windows）：从公网真实访问 80 端口 + 9000 外部不可达（IP 输出脱敏）
powershell -ExecutionPolicy Bypass -File deploy\vps\scripts\verify-external.ps1 -HostAlias laoyouju_lh
```

`verify-external.ps1` 覆盖：静态页/刷新路由 200、同源 /api/v1/health（携带正确 Origin，ACAO 精确）、POST /api/v1/ask 无模型路径 200、
恶意 Origin 403、伪造 X-Forwarded-For 第 7 次仍 429、**公网 :9000 连接不可达**。

## 8. 防火墙（最小）

```bash
sudo bash /opt/laoyouju/current/deploy/vps/scripts/firewall.sh --apply
```

规则：入站仅 22/tcp、80/tcp；**9000/tcp 一律拒绝**；出站不限制（需访问 DeepSeek/WSA API 与 npm 官方 registry）。
控制台安全组（云防火墙）与系统防火墙（ufw/firewalld）两层均按同一最小原则配置。

## 9. SELinux（OpenCloudOS 默认 Enforcing）

- install.sh 检测 `getenforce`；Enforcing 时设置最小策略：`semanage fcontext -t httpd_sys_content_t /opt/laoyouju(/.*)?` + `restorecon -RF`；
  `semanage port -a -t http_port_t -p tcp 9000`（Nginx 反代本机 9000 的最小授权，不开放全局 httpd_can_network_connect）。
- 发布（publish.sh）会对新版本静态文件 `restorecon -RF` 恢复上下文。
- **绝不关闭 SELinux**（脚本内无 setenforce；缺少 semanage 时安全停止并报告）。

## 10. 与 CloudBase 的关系（保留不删除）

- 旧 CloudBase 环境（laoyouju-demo-d0g2c7d8sb319ddf3）与部署方案**原样保留**；本阶段**未修改** cloudbaserc.json、未部署到 CloudBase、未删除任何云资源。
- 服务端通过 `BUDGET_STORE` 选择预算存储：`sqlite`（VPS）/ `cloudbase`（旧环境）；缺失或非法 → 真实模型调用安全失败（STORE_ERROR 429），绝不静默降级内存预算。
- 前端默认同源 `/api/`（VPS）；CloudBase 部署仍可显式配置 `NEXT_PUBLIC_API_BASE_URL`。

## 11. 安全边界（再次强调）

- 域名：本阶段**不解析域名到服务器**；Nginx `server_name _`，仅 IP 访问。
- HTTPS/证书：本阶段**不申请、不配置**。
- 密钥：只存在于 `/etc/laoyouju/laoyouju.env`（0600）；任何输出不包含密钥或完整公网 IP。
- 首次公网 IP 部署默认 `LIMIT_KILL_SWITCH=on`、`DEEPSEEK_API_KEY` 留空（无需用户填写/传递任何 Key）；真实模型测试另行授权。
- 不安装宝塔、WordPress、Hermes、OpenClaw、DeepSeek Harness 等无关软件；不引入云数据库/CDN/WAF/付费证书。