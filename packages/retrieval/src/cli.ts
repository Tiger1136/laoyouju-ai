import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildIndex, queryIndex } from "./bm25.js";
import { buildCatalog } from "./catalog.js";
import { loadContent, resolveContentRoot } from "./load.js";
import { stableStringify } from "./stable.js";
import { validateContent } from "./validate.js";

function defaultIndexPath(): string {
  return join(resolveContentRoot(), ".index", "index.json");
}

function cmdValidate(): number {
  const result = validateContent();
  console.log(
    `[content:validate] laws=${result.lawCount} cases=${result.caseCount} provisions=${result.provisionCount} registry=${result.registryEntryCount}`,
  );
  if (result.ok) {
    console.log("[content:validate] PASS");
    return 0;
  }
  for (const issue of result.issues) {
    console.error(`[content:validate] FAIL ${issue.code}: ${issue.message}`);
  }
  console.error(`[content:validate] FAIL (${result.issues.length} issues)`);
  return 1;
}

function cmdBuild(args: string[]): number {
  const indexPath = args[0] ?? defaultIndexPath();
  const loaded = loadContent();
  const validate = validateContent(loaded);
  if (!validate.ok) {
    for (const issue of validate.issues) {
      console.error(`[retrieval:build] 校验未通过 ${issue.code}: ${issue.message}`);
    }
    console.error("[retrieval:build] 内容校验未通过，未生成索引");
    return 1;
  }
  const index = buildIndex(loaded.laws, loaded.cases);
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, stableStringify(index), "utf8");
  console.log(`[retrieval:build] OK docs=${index.docs.length} index=${indexPath}`);
  return 0;
}

function cmdQuery(args: string[]): number {
  const query = args[0] ?? "";
  const topKRaw = Number(args[1] ?? "5");
  const topic = args[2] ?? undefined;
  const topK = Number.isInteger(topKRaw) && topKRaw > 0 ? topKRaw : 5;
  const loaded = loadContent();
  const index = buildIndex(loaded.laws, loaded.cases);
  const results = queryIndex(index, query, topK, topic);
  console.log(`[retrieval:query] query="${query}" topK=${topK} topic=${topic ?? "all"} hits=${results.length}`);
  for (const r of results) {
    console.log(
      `${r.score.toFixed(4)}\t${r.kind}\t${r.docId}\t${r.chunkId}\t${r.locator}\t[${r.topicIds.join(",")}]\t${r.title}`,
    );
  }
  return 0;
}

function cmdCatalog(): number {
  const catalog = buildCatalog();
  console.log("[retrieval:catalog] laws:", catalog.laws.length, "cases:", catalog.cases.length);
  for (const t of catalog.topics) {
    console.log(`  ${t.id}: provisions=${t.provisionCount} cases=${t.caseCount}`);
  }
  return 0;
}

function usage(): void {
  console.log(`用法: node dist/cli.js <command> [args...]
  validate                       校验内容库与 source registry（content:validate）
  build [indexPath]              构建 BM25 索引（retrieval:build）
  query <文本> [topK] [topicId]  执行检索（retrieval:query）
  catalog                        输出内容目录摘要（web 构建期数据源）
`);
}

function main(): number {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "validate":
      return cmdValidate();
    case "build":
      return cmdBuild(rest);
    case "query":
      return cmdQuery(rest);
    case "catalog":
      return cmdCatalog();
    default:
      usage();
      return command === undefined ? 0 : 2;
  }
}

process.exitCode = main();