// 北京人社局典型案例页 → phase7b 分节文本（案例N：标题 + 案情简介/仲裁请求/处理结果/案例评析/仲裁委员会提示）
// 用法: node _bj_extract.mjs <url> <slug> <caseCount> [--write]
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_DIR = join(REPO, "content", "raw", "cases", "phase7b");

const url = process.argv[2];
const slug = process.argv[3];
const want = Number(process.argv[4] ?? 0);
const writeOut = process.argv.includes("--write");

const t = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
const b = t.indexOf("<body");
let txt = t.slice(b)
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&emsp;/g, " ")
  .replace(/&#\d+;/g, (m) => String.fromCharCode(Number(m.slice(2, -1))))
  .replace(/[\u3000\u200b]/g, " ")
  .split("\n").map((s) => s.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
// 截掉页脚
for (const f of ["网站标识码", "主办单位", "扫一扫", "分享到", "移动版", "门户网站", "京ICP", "政府网站"] ) {
  const i = txt.indexOf(f);
  if (i > 1000) txt = txt.slice(0, i);
}

const HEAD = ["案情简介", "仲裁请求", "处理结果", "案例评析", "仲裁委员会提示", "案件评析", "事实与理由", "本委认为", "裁决如下", "争议焦点"];
// 官方页面存在“案 情 简 介”式字间空格：按关键词逐字放宽匹配并归一化。
for (const kw of HEAD) {
  txt = txt.replace(new RegExp(kw.split("").join("\\s*"), "g"), kw);
}

// 案例切分点（正文为连续文本，案例标记不限于行首）
const caseMarkers = [...txt.matchAll(/案例\s*(\d+)\s*[：:.]\s*/g)].map((m) => ({ idx: m.index, end: m.index + m[0].length, no: Number(m[1]) }));
if (caseMarkers.length === 0) {
  console.error("[bj] 未找到案例N：标记");
  process.exit(2);
}
console.log("[bj] cases=", caseMarkers.length, "want", want, "first:", JSON.stringify(txt.slice(caseMarkers[0].idx, caseMarkers[0].idx + 60)));

const lines = [];
let count = 0;
for (let c = 0; c < caseMarkers.length; c++) {
  const begin = caseMarkers[c].end;
  const end = c + 1 < caseMarkers.length ? caseMarkers[c + 1].idx : txt.length;
  let chunk = txt.slice(begin, end);
  // 标题：到第一个 标题关键词 或 行为止
  const headIdx = HEAD.reduce((best, k) => {
    const i = chunk.indexOf(k);
    return i >= 0 && (best < 0 || i < best) ? i : best;
  }, -1);
  const title = (headIdx > 0 ? chunk.slice(0, headIdx).trim() : chunk.slice(0, 80).trim()).replace(/^[\s：:、.]+/, "");
  // 字段切分
  const spans = [];
  for (const k of HEAD) {
    for (const m of chunk.matchAll(new RegExp(k, "g"))) {
      if (m.index < (headIdx > 0 ? headIdx : 0)) continue;
      spans.push({ at: m.index, k });
    }
  }
  spans.sort((a, b) => a.at - b.at);
  const blocks = {};
  for (let i = 0; i < spans.length; i++) {
    const e = i + 1 < spans.length ? spans[i + 1].at : chunk.length;
    blocks[spans[i].k] = (blocks[spans[i].k] || "") + chunk.slice(spans[i].at + spans[i].k.length, e).trim().slice(0, 1600);
  }
  const facts = blocks["案情简介"] || blocks["事实与理由"] || "";
  const result = blocks["处理结果"] || blocks["裁决如下"] || "";
  const reason = ([blocks["案例评析"], blocks["案件评析"], blocks["仲裁委员会提示"], blocks["本委认为"]].filter(Boolean).join("；")) || "";
  if (!facts) {
    console.log(`[bj] #${caseMarkers[c].no} 无案情简介，跳过`);
    continue;
  }
  count++;
  const nn = String(count).padStart(2, "0");
  console.log(`#${nn} title[${title.length}] facts[${facts.length}] result[${result.length}] reason[${reason.length}] :: ${title.slice(0, 34)}`);
  lines.push(`====CASE:${nn}====`);
  lines.push(`【标题】${title.length > 300 ? title.slice(0, 300) : title}`);
  lines.push(`【基本案情】${facts.length > 900 ? facts.slice(0, 900) + "……（官方页面摘要节选）" : facts}`);
  if (result) lines.push(`【处理结果】${result.length > 500 ? result.slice(0, 500) + "……（官方页面摘要节选）" : result}`);
  if (reason) lines.push(`【裁判要旨】${reason.length > 1200 ? reason.slice(0, 1200) + "……（官方页面摘要节选）" : reason}`);
  lines.push(`【案号】未公布`);
  lines.push("");
}

if (writeOut) {
  mkdirSync(OUT_DIR, { recursive: true });
  const p = join(OUT_DIR, slug + ".txt");
  writeFileSync(p, lines.join("\n"), "utf8");
  console.log("[bj] saved", p, "cases=", count);
} else {
  console.log(lines.join("\n").slice(0, 600));
}
