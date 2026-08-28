# 临时：无【】标记的官方案例 PDF → phase7b 分节文本（标题在正文行首+含“基本案情”为正文）。
# 用法: python _pdf_to_batch2.py <url> <slug> [--save]
import re
import io
import sys
import urllib.request
from pypdf import PdfReader

url, slug = sys.argv[1], sys.argv[2]
save = "--save" in sys.argv

data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
reader = PdfReader(io.BytesIO(data))
text = "\n".join((p.extract_text() or "") for p in reader.pages)
# 合并换行（去除词级碎片），保留“案例标题行”识别所需的行结构：以 标题关键词 为界。
flat = re.sub(r"[ \t\u3000]+", " ", "".join(text.split("\n")))

KW = ["基本案情", "申请人请求", "处理结果", "裁决结果", "裁判结果", "执行结果", "案例分析", "典型意义", "争议焦点", "案号", "仲裁请求", "本委认为", "裁判理由"]

def find_case_starts(flat):
    # 正文标题行：行首“数字+.” 且其后 400 字内含“基本案情”（目录行不会）。
    out = []
    for m in re.finditer(r"(?:^|(?<=。))([一二三四五六七八九十\d]+\.\s*[^\n]{2,120}?)(?=基本案情|\.{2,}|$)", flat):
        pass
    # 简化：定位每个“基本案情”的起点，标题取前面最近的“N.”标题样式文本。
    starts = [m.start() for m in re.finditer(r"基本案情", flat)]
    return starts

starts = find_case_starts(flat)
print("[pdf2] chars", len(flat), "基本案情x", len(starts))
lines = []
cases = 0
for i, pos in enumerate(starts):
    beg = pos
    end = starts[i + 1] if i + 1 < len(starts) else len(flat)
    chunk = flat[beg:end]
    if len(chunk) > 6000:
        chunk = chunk[:6000]
    # 切块：关键词作为块边界
    spans = []
    for kw in KW:
        for m in re.finditer(re.escape(kw), chunk):
            spans.append((m.start(), kw))
    spans.sort()
    blocks = {}
    for idx, (s, kw) in enumerate(spans):
        e = spans[idx + 1][0] if idx + 1 < len(spans) else len(chunk)
        blocks.setdefault(kw, chunk[s + len(kw):e].strip()[:1500])
    facts = blocks.get("基本案情", "")
    if not facts:
        continue
    # 标题：正文标题 = 自 pos 向前直到上一个“。”的片段中含“N.”的标题；取下界。
    head = flat[:beg].rstrip("。； ")
    mt = list(re.finditer(r"([一二三四五六七八九十\d]+[.、]\s*[^。；.]{2,100})$", flat[:beg].rstrip()))
    title = mt[-1].group(1).strip() if mt else head[-80:].split("基本案情")[0]
    title = re.sub(r"^[一二三四五六七八九十\d]+[.、]\s*", "", title)
    title = title.strip("名.。… ").strip()
    docno = blocks.get("案号", "未公布")
    reason = blocks.get("案例分析") or blocks.get("典型意义") or blocks.get("本委认为") or blocks.get("裁判理由") or ""
    reason = reason if len(reason) >= 20 else ""
    result = blocks.get("处理结果") or blocks.get("裁决结果") or blocks.get("裁判结果") or blocks.get("执行结果") or ""
    result = result if len(result) >= 8 else ""
    cases += 1
    lines.append(f"====CASE:{cases}====")
    lines.append(f"【标题】{title[:300]}")
    lines.append(f"【基本案情】{facts[:900]}")
    if result:
        lines.append(f"【处理结果】{result[:500]}")
    if reason:
        lines.append(f"【裁判要旨】{reason[:1200]}")
    lines.append(f"【案号】{docno}")
    lines.append("")
    print(f"#{cases} title[{len(title)}] facts[{len(facts)}] result[{len(result)}] reason[{len(reason)}] :: {title[:36]}")

if save:
    import os
    os.makedirs("content/raw/cases/phase7b", exist_ok=True)
    with open(f"content/raw/cases/phase7b/{slug}.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("[pdf2] saved", slug, "cases=", cases)
