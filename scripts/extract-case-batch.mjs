// 案例批次转换器（Phase 7B，auditable）：从结构化官方页面提取案例分节块。
// 用法：node scripts/extract-case-batch.mjs <url> <slug> <caseCount> [--write]
// 规则：
//  - 只处理页面正文中【基本案情】开始的结构化分节（官方典型案例页面常见）；
//  - 字段按页面原样摘录（不转述），仅按上限截断（“……（官方页面摘要节选）”），不编造；
//  - 页面无【案号】→ 输出“未公布”；
//  - 输出 content/raw/cases/phase7b/<slug>.txt（====CASE:N==== + 【标题】【基本案情】【处理结果】【裁判要旨】【案号】）；
//  - 打印每案例字段长度与“未公布”计数，供人工抽检。
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_DIR = join(REPO, "content", "raw", "cases", "phase7b");

const url = process.argv[2];
const slug = process.argv[3];
const expectCount = Number(process.argv[4] ?? 0);
const writeOut = process.argv.includes("--write");
const titlesArgIdx = process.argv.indexOf("--titles");
const titlesArg = titlesArgIdx >= 0 ? (process.argv[titlesArgIdx + 1] ?? "").split("|") : [];

if (!url || !slug) {
  console.error("usage: node scripts/extract-case-batch.mjs <url> <slug> <caseCount> [--write]");
  process.exit(1);
}

const html = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) })).text();
let txt = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(?:p|div|h[1-6]|li|tr|td|th)>/gi, "\n")
  .replace(/<(?:p|div|h[1-6]|li|tr|td|th)[^>]*>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
  .replace(/&mdash;|&ndash;/g, "-")
  .replace(/&amp;/g, "&")
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
  .replace(/[\u3000\u200b]/g, " ")
  .split("\n").map((s) => s.replace(/[ \t]+/g, " ").trim()).filter((s) => s.length > 0).join("\n");

// 去除页面页脚噪音（版权/备案/地址等），避免混入最后一个案例块。
for (const foot of ["版权所有", "京ICP", "公网安备", "网站地图", "地址：", "技术支持"]) {
  const idx = txt.indexOf(foot);
  if (idx > 0) txt = txt.slice(0, idx);
}

// 以【基本案情】为案例起点切分：每个案例 = 上一案例结束 到 本案例正文终点。
let starts = [...txt.matchAll(/【基本案情】/g)].map((m) => m.index);
let plainHeadings = null;
if (starts.length === 0) {
  // 指导性案例/部分页面使用纯文字标题（关键词/裁判要点/基本案情/裁判结果/裁判理由/相关法条）。
  const lines = txt.split("\n");
  const HEAD_RE = /^(?:[一二三四五六七八九十]+、)?(关键词|裁判要点|基本案情|裁判结果|裁判理由|相关法条|指导意义|典型意义|争议焦点|案号|处理结果|诉讼请求|案例分析|裁判要旨)/;
  starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEAD_RE.test(lines[i].trim()) && lines[i].trim().includes("基本案情")) starts.push(lines.slice(0, i).join("\n").length);
  }
  if (starts.length === 0) {
    console.error("[convert] 页面无【基本案情】分节，请人工处理:", url);
    process.exit(2);
  }
  plainHeadings = HEAD_RE;
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max) + "……（官方页面摘要节选至" + max + "字）";
}

// 从 case-start 向后取到下一 case-start 或结尾，得到该案例整段。
const cases = [];
for (let i = 0; i < starts.length; i++) {
  const begin = starts[i];
  const end = i + 1 < starts.length ? starts[i + 1] : txt.length;
  let chunk = txt.slice(begin, end);
  // 案例块可能吸收下一案例标题行：按行首“案例N”标记截断。
  const hdr = chunk.search(/\n案例\s*[一二三四五六七八九十\d]+\s*(?:[.、．：:]|\n)|\n\s*[\/\\]*\s*案例\s*[一二三四五六七八九十\d]+\s*[\/\\]*\s*\n/);
  if (hdr > 0) chunk = chunk.slice(0, hdr);
  // 块切分：【X】...【Y】；纯文字标题页面按 标题行 切块。
  const blocks = {};
  if (plainHeadings) {
    const lines = chunk.split("\n");
    let key = null;
    for (const line of lines) {
      const t = line.trim();
      const hm = plainHeadings.exec(t);
      if (hm) {
        key = hm[1];
        blocks[key] = "";
        const rest = t.slice(hm[0].length).replace(/^[：:\s]+/, "");
        if (rest.length > 0) blocks[key] = rest;
        continue;
      }
      if (key !== null && blocks[key] !== undefined) {
        blocks[key] = (blocks[key] + "\n" + t).trim();
      }
    }
  } else {
    const blockRe = /【([^】]{1,12})】([\s\S]*?)(?=【[^】]{1,12}】|$)/g;
    for (const bm of chunk.matchAll(blockRe)) {
      blocks[bm[1]] = bm[2].trim();
    }
  }
  if (!blocks["基本案情"]) continue;
  // 标题策略（按页面通用结构）：
  // 1) 若页面存在“目录”式紧凑案例目录（相邻 案例N 标记间距 <300 字符），目录条目即官方案例标题；
  // 2) 否则取【基本案情】前最近 4 行的标题窗口。
  const markerRe = /案例\s*[一二三四五六七八九十\d]+\s*[.、．：:]/g;
  const markers = [...txt.matchAll(markerRe)].map((m) => ({ index: m.index, end: m.index + m[0].length }));
  const tocTitles = [];
  for (let i = 0; i < markers.length; i++) {
    const next = markers[i + 1];
    const dist = next ? next.index - markers[i].end : 100000;
    if (dist < 300) {
      tocTitles.push(txt.slice(markers[i].end, next ? next.index : txt.length).replace(/\s+/g, "").replace(/^——+/, "").replace(/——+/g, "——").trim());
    }
  }
  let titleLine = "";
  let docNo = "未公布";
  if (plainHeadings) {
    // 指导性案例页：案例编号行 + 标题行（（…）发布说明行为噪音）。
    const beforeLines = txt.slice(0, begin).split("\n").filter((s) => s.trim().length > 0);
    let giIdx = -1;
    for (let k = beforeLines.length - 1; k >= 0; k--) {
      if (/^指导性案例\d+号$|^指导案例\d+号$/.test(beforeLines[k].trim())) {
        giIdx = k;
        break;
      }
    }
    if (giIdx >= 0) {
      docNo = beforeLines[giIdx].trim();
      const parts = [];
      for (const s of beforeLines.slice(giIdx + 1, giIdx + 10)) {
        const t = s.trim();
        if (t === "" || /^（|^\(|^最高人民法院|^关键词|^民事\/|^裁判要点|^基本案情|^裁判结果|^裁判理由|^相关法条/.test(t)) {
          break;
        }
        parts.push(t);
      }
      titleLine = parts.join("").replace(/\s+/g, "").slice(0, 300);
    }
  }
  if (!titleLine && titlesArg.length === starts.length) {
    // 官方页面目录标题手工对照（逐批核验后传入；与页面原文逐字一致）。
    titleLine = titlesArg[i] ?? "";
  }
  if (!titleLine && tocTitles.length === starts.length) {
    // 目录条目数与正文案例数一致：按序对照取官方完整标题。
    titleLine = tocTitles[i] ?? "";
  }
  if (!titleLine) {
    const beforeLines = txt.slice(0, begin).split("\n").filter((s) => s.length > 0);
    const win = beforeLines.slice(-4);
    const markerTest = (s) =>
      /^案例\s*[一二三四五六七八九十\d]+\s*$/.test(s.replace(/[\/\s]/g, "")) ||
      /^案例\s*[一二三四五六七八九十\d]+\s*[.、．：:]/.test(s) ||
      /\/\s*案例\s*[一二三四五六七八九十\d]+\s*\//.test(s);
    const idx = win.findIndex(markerTest);
    const headLines = idx >= 0
      ? win.slice(idx).map((s, k) => {
          if (k !== 0) return s;
          const seg = s.split("/").map((x) => x.trim()).filter(Boolean);
          const mi = seg.findIndex((x) => /^案例\s*[一二三四五六七八九十\d]+$/.test(x));
          if (mi >= 0) return seg.slice(mi + 1).join("");
          return s.replace(/^案例\s*[一二三四五六七八九十\d]+\s*[.、．：:]\s*/, "").replace(/^[\/\\\s]*案例\s*[一二三四五六七八九十\d]+\s*[\/\\\s]*/, "");
        })
      : win;
    const parts = [];
    for (const s of headLines) {
      const t = s.trim();
      if (t === "" || /^(裁判要点|基本案情|裁判结果|裁判理由|关键词|相关法条|典型意义|争议焦点|案号)/.test(t) || /^——+$|^案例[一二三四五六七八九十\d]+$|来源|发布时间|首页|所在位置|打印|字号/.test(t)) {
        break;
      }
      parts.push(t);
    }
    titleLine = parts.join("").replace(/\s+/g, "").replace(/^——+/, "").replace(/——+/g, "——").slice(0, 300);
  }
  cases.push({
    title: titleLine,
    facts: truncate(blocks["基本案情"], 900),
    focus: blocks["争议焦点"] ? truncate(blocks["争议焦点"], 300) : "",
    result: truncate(blocks["处理结果"] ?? blocks["裁判结果"] ?? blocks["裁决结果"] ?? blocks["执行结果"] ?? "", 500),
    reasoning: truncate([blocks["裁判要点"], blocks["裁判要旨"], blocks["案例分析"], blocks["典型意义"], blocks["裁判理由"]].filter(Boolean).join("；"), 1200),
    docNo: (plainHeadings ? docNo : blocks["案号"]?.trim()) || "未公布",
  });
}

console.log("[convert] 案例数:", cases.length, "(expect", expectCount + (expectCount ? "" : " 未知") + ")");
const lines = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  console.log(`#${i + 1} 标题[${c.title.length}] 案情[${c.facts.length}] 结果[${c.result.length}] 要旨[${c.reasoning.length}] 案号=${c.docNo === "未公布" ? "未公布" : c.docNo.slice(0, 30)}`);
  if (c.title.length === 0) console.log(`#${i + 1} !! 标题为空`);
  if (c.result.length === 0) console.log(`#${i + 1} !! 处理结果为空`);
  lines.push(`====CASE:${i + 1}====`);
  lines.push(`【标题】${c.title || "（标题未识别，需人工补）"}`);
  if (c.focus) lines.push(`【争议焦点】${c.focus}`);
  lines.push(`【基本案情】${c.facts}`);
  lines.push(`【处理结果】${c.result || "（官方页面未单独公布处理结果）"}`);
  if (c.reasoning) lines.push(`【裁判要旨】${c.reasoning}`);
  lines.push(`【案号】${c.docNo}`);
  lines.push("");
}

if (writeOut) {
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, slug + ".txt");
  writeFileSync(out, lines.join("\n"), "utf8");
  console.log("[convert] 已写入:", out);
  if (expectCount > 0 && cases.length !== expectCount) {
    console.log("[convert] !! 案例数与预期不符:", cases.length, "!= ", expectCount);
    process.exit(3);
  }
} else {
  console.log(lines.join("\n"));
}
