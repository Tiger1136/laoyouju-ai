import { DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL } from "@laoyouju/shared";
import {
  resolveWsaOptions,
  TencentWSASearchProvider,
  type SearchProvider,
} from "@laoyouju/search";
import { normalizePeerAddress } from "./http.js";

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** 从环境变量解析 DeepSeek 配置（仅服务端；baseUrl/model 有非敏感默认值）。 */
export function resolveDeepSeekConfig(env: NodeJS.ProcessEnv = process.env): DeepSeekConfig {
  return {
    apiKey: env.DEEPSEEK_API_KEY ?? "",
    baseUrl: (env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, ""),
    model: env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
  };
}

/**
 * 从环境变量解析联网搜索 Provider：WSA_API_KEY 未配置时返回 undefined（本地知识库仍可工作）；
 * Key 只从服务端环境变量读取，绝不写入源码/前端/日志/报告。
 */
export function resolveSearchProvider(env: NodeJS.ProcessEnv = process.env): SearchProvider | undefined {
  const options = resolveWsaOptions(env);
  if (options.apiKey.trim() === "") {
    return undefined;
  }
  return new TencentWSASearchProvider(options);
}

/** 允许的 CORS Origin：合并 ALLOWED_ORIGINS 与 WEB_ALLOWED_ORIGIN（去重、去空白）。 */
export function resolveAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = [env.ALLOWED_ORIGINS, env.WEB_ALLOWED_ORIGIN].filter((v) => v !== undefined && v !== "").join(",");
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(parts)];
}

/**
 * Phase 9：受信任反向代理地址列表（TRUSTED_PROXY，逗号分隔，如 127.0.0.1,::1）。
 * 只有来自这些 peer 的请求才会采用 X-Forwarded-For 作为客户端 IP；
 * 未配置时不信任任何转发头（客户端 IP 取 socket 对端地址）。
 */
export function resolveTrustedProxies(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.TRUSTED_PROXY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(normalizePeerAddress)
    .filter((s) => s.length > 0);
}