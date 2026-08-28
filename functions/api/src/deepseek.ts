import type { DeepSeekConfig } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekCallOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface DeepSeekResult {
  content: string;
}

export type UpstreamErrorKind = "missing" | "timeout" | "rate" | "status" | "malformed" | "network";

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status: number | undefined;
  constructor(kind: UpstreamErrorKind, status?: number) {
    super(`upstream error: ${kind}${status !== undefined ? ` (${status})` : ""}`);
    this.name = "UpstreamError";
    this.kind = kind;
    this.status = status;
  }
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "AbortError" || err.name === "TimeoutError";
  }
  return false;
}

/**
 * 调用 DeepSeek OpenAI-compatible chat completions（原生 fetch，不引入 SDK）。
 * - 使用 Bearer 鉴权；超时通过 AbortController 实现；
 * - **显式关闭思考模式**（thinking: { type: "disabled" }）：网页端为公网同步 HTTP 链路，
 *   必须把单次请求控制在链路超时之前；思考模式会显著拉长首 token 与总时长（实测 20s+ 后 502）；
 * - 默认模型超时 15 秒（必须为检索、解析与网关返回预留时间，默认值不超过 15s）；
 * - 上游 429 记为 rate、5xx 记为 status、超时/中止 记为 timeout、响应结构异常记为 malformed；
 * - 只做一次调用，不自动重试（避免重复扣费）。
 */
export async function chatCompletion(
  config: DeepSeekConfig,
  messages: ChatMessage[],
  options: DeepSeekCallOptions = {},
): Promise<DeepSeekResult> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxTokens = options.maxTokens ?? 1300;

  if (config.apiKey === "") {
    throw new UpstreamError("missing");
  }

  const url = `${config.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: false,
        response_format: { type: "json_object" },
        // 非思考模式：满足网页同步响应需求（显式指定，避免默认思考模式拉长响应时间）。
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) {
      throw new UpstreamError("timeout");
    }
    throw new UpstreamError("network");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new UpstreamError("rate");
  }
  if (res.status >= 500) {
    throw new UpstreamError("status", res.status);
  }
  if (!res.ok) {
    throw new UpstreamError("status", res.status);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new UpstreamError("malformed");
  }

  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new UpstreamError("malformed");
  }
  return { content };
}
