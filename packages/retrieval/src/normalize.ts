import { createHash } from "node:crypto";

/**
 * 确定性的中文文本规范化，用于：
 *  - 计算 provision 的 textSha256（与 sourceText 规范化后一致）；
 *  - 生成 n-gram 索引（2-gram + 3-gram）。
 *
 * 规则（与 docs 中的检索规范一致）：
 *  - Unicode NFKC 规范化（统一全角/半角）；
 *  - ASCII 字母统一小写；
 *  - 去除所有空白（含全角空格 \u3000、零宽空格）；
 *  - 去除无意义标点与符号，但保留中文（含 CJK 字母）、ASCII 字母、数字与“条号/数字”等
 *    有意义信息。
 * 该函数必须跨进程完全可复现（相同输入 -> 相同输出）。
 */

/** 保留字符：Unicode 字母（含 CJK 与拉丁）、数字，以及个别有意义符号。 */
const KEEP_RE = /[^\p{L}\p{N}]/gu;

export function canonicalize(text: string): string {
  // NFKC：统一全角/半角与兼容字形
  const nfkc = text.normalize("NFKC");
  // 小写（仅影响 ASCII 字母；CJK 无大小写）
  const lowered = nfkc.toLowerCase();
  // 去除空白（含 NFKC 后可能出现的普通空格与全角空格）
  const noWs = lowered.replace(/[\s\u3000\u200b\u00a0]+/gu, "");
  // 去除标点/符号等无意义字符（保留字母、数字，从而保留“第四十七条”“百分之五十”等）
  return noWs.replace(KEEP_RE, "");
}

/** 计算规范化 sourceText 的 SHA-256（十六进制，小写）。 */
export function computeTextSha256(text: string): string {
  return createHash("sha256").update(canonicalize(text), "utf8").digest("hex");
}
