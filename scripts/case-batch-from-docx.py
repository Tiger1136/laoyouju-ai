# 临时：官方 DOCX 案例批次 → phase7b 分节文本
# 用法: python _docx_to_batch.py <url> <slug> [--save]
import re
import io
import sys
import zipfile
import urllib.request
from xml.etree import ElementTree as ET

url, slug = sys.argv[1], sys.argv[2]
save = "--save" in sys.argv

data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=60).read()
zf = zipfile.ZipFile(io.BytesIO(data))
xml = zf.read("word/document.xml").decode("utf-8")
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
paras = ["".join(t.text or "" for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")) for p in ET.fromstring(xml).iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")]
text = "\n".join(p for p in paras if p.strip())

KW = ["基本案情", "申请人请求", "处理结果", "裁决结果", "裁判结果", "执行结果", "案例分析", "典型意义", "争议焦点", "案号", "仲裁请求", "本委认为", "裁判理由"]
starts = [m.start() for m in re.finditer(r"基本案情", text)]
print("[docx] paras", len(paras), "chars", len(text), "基本案情x", len(starts))
lines = []
cases = 0
for i, pos in enumerate(starts):
    beg = pos
    end = starts[i + 1] if i + 1 < len(starts) else len(text)
    chunk = text[beg:end][:7000]
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
    head = text[:beg].rstrip("。； ")
    mt = list(re.finditer(r"([一二三四五六七八九十\d]+[.、]\s*[^。；.]{2,100})$", head))
    title = re.sub(r"^[一二三四五六七八九十\d]+[.、]\s*", "", mt[-1].group(1) if mt else head[-80:])
    title = title.strip("：.。… ")
    reason = blocks.get("案例分析") or blocks.get("典型意义") or blocks.get("本委认为") or blocks.get("裁判理由") or ""
    reason = reason if len(reason) >= 20 else ""
    result = blocks.get("处理结果") or blocks.get("裁决结果") or blocks.get("裁判结果") or blocks.get("执行结果") or ""
    result = result if len(result) >= 8 else ""
    docno = blocks.get("案号", "未公布")
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
    print("[docx] saved", slug, "cases=", cases)
