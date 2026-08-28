import { createApiServer } from "./app.js";
import { resolveAllowedOrigins } from "./config.js";

const DEFAULT_PORT = 9000;

function resolvePort(raw: string | undefined): number {
  if (raw === undefined) {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`[laoyouju-api] 无效 PORT 环境变量，使用默认端口 ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return parsed;
}

const port = resolvePort(process.env.PORT);
const allowedOrigins = resolveAllowedOrigins(process.env);

const server = createApiServer({ allowedOrigins });

server.listen(port, "0.0.0.0", () => {
  console.log(`[laoyouju-api] listening on 0.0.0.0:${port} (scaffold)`);
});
