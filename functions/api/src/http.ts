import type { IncomingMessage, ServerResponse } from "node:http";

/** 所有 JSON 响应的公共响应头。 */
export function commonHeaders(requestId: string): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  };
}

/** 发送 JSON 响应（body 为已序列化对象）。 */
export function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(statusCode, { ...commonHeaders(requestId), ...extraHeaders });
  res.end(JSON.stringify(payload));
}

export type ReadBodyResult =
  | { ok: true; body: string }
  | { ok: false; code: "PAYLOAD_TOO_LARGE" | "INTERNAL_ERROR" };

/**
 * 读取请求体并限制原始字节数。
 * 超过 limit 时立即返回 PAYLOAD_TOO_LARGE 并销毁连接（防止继续读取）。
 */
export function readBodyWithLimit(req: IncomingMessage, limit: number): Promise<ReadBodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const finish = (result: ReadBodyResult): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    req.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > limit) {
        // 超限：立即结算为 PAYLOAD_TOO_LARGE，但不销毁连接（销毁会导致客户端收不到 413 响应）。
        // 停止缓冲后续 chunk（仅继续计数），由上层发送 413 后结束。
        finish({ ok: false, code: "PAYLOAD_TOO_LARGE" });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!settled) {
        finish({ ok: true, body: Buffer.concat(chunks).toString("utf8") });
      }
    });

    req.on("error", () => {
      finish({ ok: false, code: "INTERNAL_ERROR" });
    });
  });
}

/** 是否允许该 Origin（精确白名单；undefined 表示非浏览器请求，允许进入）。 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (origin === undefined) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

/** 设置 CORS 响应头（仅当 Origin 通过校验后调用；绝不反射未校验的 Origin）。
 *  allowMethods 为 OPTIONS 预检时按路由设置的允许方法；普通响应使用默认值（无害）。 */
export function corsHeaders(origin: string, allowMethods = "GET, POST, OPTIONS"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": allowMethods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

/** 仅带 Vary: Origin 的响应头（Origin 被拒绝或不需要 ACAO 时使用）。 */
export function varyOriginHeader(): Record<string, string> {
  return { "Vary": "Origin" };
}

/**
 * OPTIONS 预检响应头（仅已知路径可 204）。
 * - 总是包含 `Vary: Origin` 与按路由设置的 `Access-Control-Allow-Methods`；
 * - 仅当 Origin 通过白名单校验时才包含精确 `Access-Control-Allow-Origin`；
 * - 未知路径/被拒绝 Origin 不得反射未校验的 Origin。
 */
export function preflightHeaders(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  allowMethods: string,
): Record<string, string> {
  if (origin !== undefined && isOriginAllowed(origin, allowedOrigins)) {
    return corsHeaders(origin, allowMethods);
  }
  return { "Vary": "Origin", "Access-Control-Allow-Methods": allowMethods };
}

/** 是否为 application/json（容忍 charset 后缀）。 */
export function isJsonContentType(contentType: string | undefined): boolean {
  if (contentType === undefined) {
    return false;
  }
  const mediaType = contentType.split(";", 1)[0]?.trim() ?? "";
  return mediaType === "application/json";
}

/**
 * 归一化 peer/代理地址（用于信任边界比较）：
 * - IPv4-mapped IPv6（::ffff:127.0.0.1）→ IPv4；
 * - localhost → 127.0.0.1；
 * - 其他按小写去空白原样返回；空 → ""。
 */
export function normalizePeerAddress(addr: string | undefined): string {
  if (addr === undefined) {
    return "";
  }
  let a = addr.trim().toLowerCase();
  if (a === "localhost") {
    return "127.0.0.1";
  }
  if (a.startsWith("::ffff:")) {
    a = a.slice(7);
  }
  return a;
}
