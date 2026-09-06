import { createApiServer } from "./app.js";
import { resolveAllowedOrigins, resolveTrustedProxies } from "./config.js";
import { resolveHost, resolvePort } from "./listen.js";

const port = resolvePort(process.env.PORT);

// Phase 9A：HOST 显式非法 → 拒绝启动（失败开放禁止；绝不回退到 0.0.0.0）。
// 未配置 HOST 时 resolveHost 返回兼容默认 0.0.0.0（CloudBase 平台需要）。
let host: string;
try {
  host = resolveHost(process.env.HOST);
} catch (err) {
  console.error(`[laoyouju-api] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const allowedOrigins = resolveAllowedOrigins(process.env);
const trustedProxies = resolveTrustedProxies(process.env);

const server = createApiServer({ allowedOrigins, trustedProxies });

server.listen(port, host, () => {
  console.log(`[laoyouju-api] listening on ${host}:${port}`);
});
