import {
  ApiErrorResponseSchema,
  AskSuccessResponseSchema,
  type ApiErrorResponse,
  type AskSuccessResponse,
} from "@laoyouju/shared";

/** API 基础地址：读取公开变量 NEXT_PUBLIC_API_BASE_URL（构建期内联）。仅为地址，绝不包含任何密钥。 */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

export type AskStatus = "idle" | "loading" | "answered" | "needs_clarification" | "out_of_scope" | "error";

export interface AskUiState {
  status: AskStatus;
  data?: AskSuccessResponse;
  errorMessage?: string;
  statusCode?: number;
}

/**
 * 严格归一化 API 响应（不允许把未知 JSON 强断言为成功结构）：
 * - 成功响应必须通过 AskSuccessResponseSchema（zod safeParse）；未知 outcome 属于契约失败；
 * - 契约失败的“成功”状态码 → 稳定错误提示（绝不默认当成 out_of_scope）；
 * - 错误响应通过 ApiErrorResponseSchema 时按错误码给出用户可读提示；结构不符 → 通用稳定提示；
 * - 任何情况下不把服务端内部信息透出。
 */
export function normalizeAskResponse(statusCode: number, body: unknown): AskUiState {
  if (body !== null && typeof body === "object") {
    const success = AskSuccessResponseSchema.safeParse(body);
    if (success.success) {
      const outcome = success.data.outcome;
      if (outcome === "answered") {
        return { status: "answered", data: success.data };
      }
      if (outcome === "needs_clarification") {
        return { status: "needs_clarification", data: success.data };
      }
      return { status: "out_of_scope", data: success.data };
    }
  }

  if (statusCode >= 200 && statusCode < 300) {
    // 成功状态码但结构不符合契约：稳定错误（未知 outcome 不得当 out_of_scope 处理）。
    return { status: "error", statusCode, errorMessage: "服务返回的内容不符合契约，暂无法展示。请稍后再试。" };
  }

  const errParsed = ApiErrorResponseSchema.safeParse(body);
  const err = errParsed.success ? (errParsed.data as ApiErrorResponse).error : undefined;
  let message = err?.message ?? "请求未能完成，请稍后再试。";
  if (statusCode === 503 && err?.code === "SERVICE_NOT_READY") {
    message = "问答服务尚未配置密钥，当前无法生成回答。";
  } else if (statusCode === 503 && err?.code === "RATE_LIMITED") {
    message = "请求过于频繁，请稍后再试。";
  } else if (statusCode === 429) {
    // Phase 8：限流 / 全局额度 / kill switch —— 直接使用服务端稳定中文文案。
    message = err?.message ?? "请求过于频繁，请稍后再试。";
  } else if (statusCode === 502 && err?.code === "UPSTREAM_ERROR") {
    message = "生成服务暂时不可用，请稍后再试。";
  } else if (statusCode === 400) {
    message = "问题不符合要求，请检查后重试（例如：包含文字内容、长度在 2～500 字之间）。";
  }
  return { status: "error", statusCode, errorMessage: message };
}

export async function submitQuestion(question: string): Promise<AskUiState> {
  if (API_BASE_URL === "") {
    return { status: "error", errorMessage: "问答服务尚未配置，无法提交问题。" };
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ question }),
    });
  } catch {
    return { status: "error", errorMessage: "暂时无法连接到问答服务，请稍后再试。" };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // 网关层 429（非 JSON）同样给出友好提示。
    if (res.status === 429) {
      return { status: "error", statusCode: 429, errorMessage: "请求过于频繁，请稍后再试。" };
    }
    return { status: "error", statusCode: res.status, errorMessage: "服务返回了无法解析的响应。" };
  }

  return normalizeAskResponse(res.status, body);
}

export const EXAMPLE_QUESTIONS: readonly string[] = [
  "公司违法解除劳动合同，我可以主张哪些补偿？",
  "公司拖欠我半年工资，怎么追讨？",
  "加班费应该怎么计算？",
  "入职后一直没签书面劳动合同，能要二倍工资吗？",
  "试用期内被辞退，合法吗？",
  "单位不给缴社保，我能主张什么？",
];
