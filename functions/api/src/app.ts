import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  API_VERSION,
  MAX_REQUEST_BODY_BYTES,
  parseAskRequest,
  type ApiErrorResponse,
} from "@laoyouju/shared";
import { canonicalize } from "@laoyouju/retrieval";
import {
  corsHeaders,
  isJsonContentType,
  isOriginAllowed,
  normalizePeerAddress,
  preflightHeaders,
  readBodyWithLimit,
  sendJson,
  varyOriginHeader,
} from "./http.js";
import { createDefaultAskContext, runAsk, type AskContext } from "./ask.js";
import { limitMessage, type LimitCode } from "./limit.js";

export interface ApiServerOptions {
  /** 精确 Origin 白名单（逗号分隔；空数组 = 未配置，fail-closed）。 */
  allowedOrigins?: readonly string[];
  /** 问答上下文（默认读取环境变量并使用全局 fetch；测试可注入 mock）。 */
  askContext?: AskContext;
  /** 受信任代理 peer 地址列表（Phase 9：只有这些对端的 X-Forwarded-For 才被采用；默认空 = 不信任转发头）。 */
  trustedProxies?: readonly string[];
}

const HEALTH_PATH = "/v1/health";
const ASK_PATH = "/v1/ask";
const DEFAULT_ORIGIN_FOR_URL = "http://internal";

/** 把网关转发路径归一化：CloudBase 网关 gatewayPath=/api 时会剥离前缀并转发 /v1/*，本地直连为 /api/v1/*。二者都接受。 */
function normalizePath(pathname: string): string {
  return pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
}

/** 是否经由 CloudBase HTTP 访问服务（网关）转发：此时 CORS 由网关负责，函数不应再叠加 CORS 头（避免重复 ACAO/Vary）。 */
function isBehindCloudBaseGateway(req: IncomingMessage): boolean {
  return req.headers["x-cloudbase-request-id"] !== undefined || req.headers["x-cloudbase-session-id"] !== undefined;
}

interface RouteInfo {
  methods: ReadonlySet<string>;
  allow: string;
}

const ROUTES: ReadonlyMap<string, RouteInfo> = new Map([
  [HEALTH_PATH, { methods: new Set(["GET"]), allow: "GET, OPTIONS" }],
  [ASK_PATH, { methods: new Set(["POST"]), allow: "POST, OPTIONS" }],
]);

interface ErrorBody {
  code: ApiErrorResponse["error"]["code"];
  message: string;
  retryable: boolean;
}

/**
 * handleAsk 返回的结构化结果。
 * 只描述“希望提交的响应”，绝不由 handleAsk 直接写入 socket；
 * 由外层唯一的 respond 统一提交一次，从而保证每次请求最多一次 writeHead 与 end。
 */
interface AskDecision {
  statusCode: number;
  errorCode: string | null;
  payload: unknown;
  /** Phase 8：429 时建议客户端等待秒数（写 Retry-After 头）。 */
  retryAfter?: number | undefined;
}

/**
 * 创建服务端（不监听端口；由 server.ts 负责 listen，便于测试随机端口）。
 * 响应只能通过闭包内的 respond/respondError 提交；任何内部处理器不得直接写 res。
 */
export function createApiServer(options: ApiServerOptions = {}): ReturnType<typeof createServer> {
  const allowedOrigins: readonly string[] = options.allowedOrigins ?? [];
  const askContext: AskContext = options.askContext ?? createDefaultAskContext();
  // Phase 9：信任边界——只有来自这些 peer（本机 Nginx）的转发头才被采用；未配置则一律不信任转发头。
  const trustedProxySet = new Set(
    (options.trustedProxies ?? []).map(normalizePeerAddress).filter((s) => s.length > 0),
  );

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    let responded = false;
    let finished = false;
    let pathname = "/";

    // 唯一响应提交路径：任何响应都必须经此提交，最多一次 writeHead 与 end。
    const respond = (
      statusCode: number,
      payload: unknown,
      extraHeaders: Record<string, string> = {},
    ): void => {
      if (responded) {
        return;
      }
      responded = true;
      // 本地直接访问时始终带 Vary: Origin；网关模式下 CORS 头由网关负责，函数不再输出。
      sendJson(res, statusCode, payload, requestId, { ...(gateway ? {} : varyOriginHeader()), ...extraHeaders });
    };

    const respondError = (
      statusCode: number,
      error: ErrorBody,
      extraHeaders: Record<string, string> = {},
    ): void => {
      respond(statusCode, buildErrorBody(requestId, error), extraHeaders);
    };

    // 仅记录白名单字段；绝不记录 question、body、headers、环境变量。永不发送/补发响应。
    const finish = (statusCode: number, errorCode?: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      const durationMs = Date.now() - startedAt;
      const entry: Record<string, string | number | undefined> = {
        requestId,
        method: req.method ?? "GET",
        pathname,
        statusCode,
        durationMs,
        errorCode,
      };
      console.log(JSON.stringify(entry));
    };

    const origin = req.headers.origin;
    const originAllowed = isOriginAllowed(origin, allowedOrigins);
    const method = req.method ?? "GET";
    // 网关模式：CORS 由 CloudBase 网关负责，函数不再输出 CORS 头，避免重复 ACAO/Vary。
    const gateway = isBehindCloudBaseGateway(req);
    const corsForErrors: Record<string, string> = gateway ? {} : varyOriginHeader();

    // 1. CORS 校验：带 Origin 的浏览器请求必须命中白名单；未配置白名单时 fail-closed。
    if (origin !== undefined && !originAllowed) {
      respondError(
        403,
        { code: "ORIGIN_NOT_ALLOWED", message: "来源不被允许", retryable: false },
        corsForErrors,
      );
      finish(403, "ORIGIN_NOT_ALLOWED");
      return;
    }

    // 2. 安全解析 pathname（兼容网关剥离 /api 前缀后的 /v1/* 与本地 /api/v1/*）；失败直接 400。
    try {
      pathname = normalizePath(new URL(req.url ?? "/", DEFAULT_ORIGIN_FOR_URL).pathname);
    } catch {
      respondError(
        400,
        { code: "INVALID_REQUEST", message: "请求路径无效", retryable: false },
        corsForErrors,
      );
      finish(400, "INVALID_REQUEST");
      return;
    }

    const route = ROUTES.get(pathname);

    // 3. OPTIONS 预检：只有已知路由才允许 204；未知路径一律 404 且不反射 ACAO。
    if (method === "OPTIONS") {
      if (route === undefined) {
        respondError(
          404,
          { code: "NOT_FOUND", message: "接口不存在", retryable: false },
          corsForErrors,
        );
        finish(404, "NOT_FOUND");
        return;
      }
      res.writeHead(204, gateway ? { "Vary": "Origin" } : preflightHeaders(origin, allowedOrigins, route.allow));
      res.end();
      responded = true;
      finish(204);
      return;
    }

    // 非 OPTIONS：未知路径一律 404。
    if (route === undefined) {
      respondError(
        404,
        { code: "NOT_FOUND", message: "接口不存在", retryable: false },
        corsForErrors,
      );
      finish(404, "NOT_FOUND");
      return;
    }

    const actualHeaders = gateway
      ? {}
      : origin !== undefined && originAllowed
        ? corsHeaders(origin)
        : varyOriginHeader();

    // 4. 方法校验（OPTIONS 已在上面单独处理）。
    if (!route.methods.has(method)) {
      respondError(
        405,
        { code: "METHOD_NOT_ALLOWED", message: "请求方法不被允许", retryable: false },
        { ...actualHeaders, Allow: route.allow },
      );
      finish(405, "METHOD_NOT_ALLOWED");
      return;
    }

    if (pathname === HEALTH_PATH) {
      respond(
        200,
        {
          ok: true,
          apiVersion: API_VERSION,
          service: "laoyouju-api",
          status: "scaffold",
        },
        actualHeaders,
      );
      finish(200);
      return;
    }

    // ---- POST /api/v1/ask ----
    // handleAsk 只返回结构化结果；唯一响应 writer（respond）在此提交一次。
    void handleAsk(req, requestId, askContext, trustedProxySet)
      .then((decision) => {
        const headers =
          decision.retryAfter !== undefined
            ? { ...actualHeaders, "Retry-After": String(decision.retryAfter) }
            : actualHeaders;
        respond(decision.statusCode, decision.payload, headers);
        finish(decision.statusCode, decision.errorCode ?? undefined);
      })
      .catch(() => {
        // 兜底：只有尚未提交/尚未结束响应时才发送 500，避免重复写头或写已结束的连接。
        if (!res.headersSent && !res.writableEnded) {
          respondError(
            500,
            { code: "INTERNAL_ERROR", message: "服务内部错误", retryable: true },
            actualHeaders,
          );
        }
        finish(500, "INTERNAL_ERROR");
      });
  });
}

function buildErrorBody(requestId: string, error: ErrorBody): ApiErrorResponse {
  return {
    ok: false,
    apiVersion: API_VERSION,
    requestId,
    error,
  };
}

function errorDecision(
  requestId: string,
  statusCode: number,
  code: ApiErrorResponse["error"]["code"],
  message: string,
): AskDecision {
  return {
    statusCode,
    errorCode: code,
    payload: buildErrorBody(requestId, { code, message, retryable: false }),
  };
}

/**
 * 处理 /api/v1/ask（只返回结构化结果，绝不写 socket）。
 * 处理顺序：Content-Type → body 限制 → JSON 解析 → 对象检查 → 共享 schema 校验 → 检索/模型。
 * 当前阶段：检索与 DeepSeek 生成均在服务端；缺 Key/上游异常返回稳定错误；资料不足返回诚实的 insufficient。
 */
async function handleAsk(
  req: IncomingMessage,
  requestId: string,
  askContext: AskContext,
  trustedProxySet: ReadonlySet<string>,
): Promise<AskDecision> {
  // 1. Content-Type。
  if (!isJsonContentType(req.headers["content-type"])) {
    return errorDecision(requestId, 415, "UNSUPPORTED_MEDIA_TYPE", "请求体必须是 application/json");
  }

  // 2. body 字节限制。
  const bodyResult = await readBodyWithLimit(req, MAX_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    if (bodyResult.code === "PAYLOAD_TOO_LARGE") {
      return errorDecision(requestId, 413, "PAYLOAD_TOO_LARGE", "请求体过大");
    }
    return errorDecision(requestId, 500, "INTERNAL_ERROR", "服务内部错误");
  }

  // 3. JSON 解析。
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyResult.body);
  } catch {
    return errorDecision(requestId, 400, "INVALID_REQUEST", "请求体不是合法 JSON");
  }

  // 4. 顶层必须是对象。
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorDecision(requestId, 400, "INVALID_REQUEST", "请求体必须是 JSON 对象");
  }

  // 5. 共享 schema 严格校验（trim、长度、拒绝未知字段；错误不回显问题原文）。
  const parsedRequest = parseAskRequest(parsed);
  if (!parsedRequest.success) {
    const firstIssue = parsedRequest.error.issues[0];
    const field = firstIssue?.path.join(".") ?? "根";
    return errorDecision(requestId, 400, "INVALID_REQUEST", `请求参数无效（${field}）`);
  }

  // 5b. 拒绝纯标点/无实质内容的问题（如“，。！？”或“????”），避免无意义调用。
  const question = parsedRequest.data.question;
  if (canonicalize(question).length === 0) {
    return errorDecision(requestId, 400, "INVALID_REQUEST", "问题无效：请用文字描述你的问题");
  }

  // 5c. Phase 8：入口客户端限频（每客户端分钟/日；无 Origin 的脚本请求同样受限）。
  //     失败返回 HTTP 429 + Retry-After；客户端标识取「受信任代理」提供的 X-Forwarded-For 首地址
  //     （不可逆哈希存储；未在 TRUSTED_PROXY 白名单中的对端不采用转发头，防止伪造转发头绕过限流）。
  if (askContext.guard !== undefined) {
    const clientIp = clientIpOf(req, trustedProxySet);
    const decision = askContext.guard.checkClient(clientIp);
    if (!decision.allowed) {
      return limitDecision(requestId, decision);
    }
  }

  // 6. 检索 + 模型生成（服务端唯一可信边界）。
  const outcome = await runAsk(question, requestId, askContext);
  return {
    statusCode: outcome.status,
    errorCode: outcome.errorCode,
    payload: outcome.payload,
    retryAfter: outcome.retryAfter,
  };
}

/**
 * 客户端 IP（Phase 9 信任边界）：
 * - 仅当对端在受信任代理白名单（TRUSTED_PROXY）中，或请求来自 CloudBase 网关（保留旧环境行为）时，
 *   才采用 X-Forwarded-For 首地址作为客户端 IP；
 * - 其他情况一律使用 socket 对端地址（不沿用可能含伪造内容的转发头链）；
 * - 返回值为原始 IP 字符串（调用方再做不可逆哈希存储）。
 */
function clientIpOf(req: IncomingMessage, trustedProxySet: ReadonlySet<string>): string | undefined {
  const peer = normalizePeerAddress(req.socket.remoteAddress);
  const trustProxy = trustedProxySet.has(peer) || isBehindCloudBaseGateway(req);
  if (trustProxy) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.trim() !== "") {
      const first = fwd.split(",")[0]?.trim();
      if (first !== undefined && first !== "") {
        return first;
      }
    }
  }
  return peer === "" ? undefined : peer;
}

/** Phase 8：429 决策（AskDecision 携带 retryAfterSeconds 供外层写 Retry-After 头）。 */
function limitDecision(
  requestId: string,
  decision: { allowed: boolean; code: string; retryAfterSeconds: number },
): AskDecision {
  return {
    statusCode: 429,
    errorCode: "RATE_LIMITED",
    payload: {
      ok: false,
      apiVersion: API_VERSION,
      requestId,
      error: {
        code: "RATE_LIMITED",
        message: limitMessage(decision.code as LimitCode),
        retryable: true,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    },
    retryAfter: decision.retryAfterSeconds,
  };
}