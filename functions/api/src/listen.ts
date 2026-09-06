/**
 * Phase 9A：监听参数解析（纯函数，便于测试）。
 *
 * HOST 失败开放禁止（fail-closed）：
 * - HOST 未配置/空白 → 保留兼容默认 0.0.0.0（CloudBase 平台需要）；
 * - 合法 IPv4 / IPv6 / 主机名 → 原样返回；
 * - 显式配置了非法值 → 抛出异常，由 server.ts 拒绝启动（绝不回退到 0.0.0.0）。
 */
import { isIP } from "node:net";

export const DEFAULT_PORT = 9000;
/** CloudBase 兼容默认；VPS 部署必须显式配置 HOST=127.0.0.1（见 deploy/vps/env）。 */
export const DEFAULT_HOST = "0.0.0.0";

export function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`[laoyouju-api] 无效 PORT 环境变量，使用默认端口 ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return parsed;
}

/** 主机名：字母数字与点/连字符，不以连字符或点开头/结尾，长度 ≤ 253。 */
const HOSTNAME_RE = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/;
/** 形似 IPv4（仅数字与点）但不是合法 IP 的值（如 9.9.9.999）→ 视为非法。 */
const LOOKS_LIKE_IP_RE = /^[0-9.]+$/;

export function resolveHost(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_HOST;
  }
  const host = raw.trim();
  if (isIP(host) !== 0) {
    return host;
  }
  if (LOOKS_LIKE_IP_RE.test(host)) {
    throw new Error("非法 HOST 值（形似 IP 但不是合法 IP）— 进程拒绝启动");
  }
  if (host.length > 253 || !HOSTNAME_RE.test(host)) {
    throw new Error("非法 HOST 值（不是合法 IP 或主机名）— 进程拒绝启动");
  }
  return host;
}
