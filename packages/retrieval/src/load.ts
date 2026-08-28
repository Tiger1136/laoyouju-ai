import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CaseSourceSchema,
  ContentDocumentSchema,
  LawSourceSchema,
  SourceRegistrySchema,
  type CaseSource,
  type ContentDocument,
  type LawSource,
  type SourceRegistry,
} from "./schemas.js";

export interface LoadedContent {
  laws: LawSource[];
  cases: CaseSource[];
  documents: ContentDocument[];
  registry: SourceRegistry;
}

export const DEFAULT_CONTENT_ROOT = "content";

/** 从 cwd 向上查找包含 content/laws 目录的仓库根，避免从 apps/web 等子包运行时找不到 content。 */
export function findContentRoot(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, DEFAULT_CONTENT_ROOT);
    if (existsSync(join(candidate, "laws"))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

/** 从当前模块位置解析 content 根（云端作为 cwd 失效时的兜底；esbuild 打包后 import.meta.url 指向 dist/server.js，
 *  其相邻 ../content 即部署包中的内容目录）。 */
function contentRootFromModule(): string | undefined {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidate = resolve(here, "..", "content");
    if (existsSync(join(candidate, "laws"))) {
      return candidate;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/** 解析内容库根目录（按优先级：显式 override > RETRIEVAL_CONTENT_ROOT > 向上查找 > 模块相邻 > cwd/content）。 */
export function resolveContentRoot(override?: string): string {
  if (override !== undefined && override !== "") {
    return resolve(process.cwd(), override);
  }
  const envRoot = process.env.RETRIEVAL_CONTENT_ROOT;
  if (envRoot !== undefined && envRoot !== "") {
    return resolve(process.cwd(), envRoot);
  }
  return (
    findContentRoot() ??
    contentRootFromModule() ??
    resolve(process.cwd(), DEFAULT_CONTENT_ROOT)
  );
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort(); // 确定性：按文件名排序
}

function readDocument(file: string, abs: string): ContentDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`内容文件 JSON 解析失败 (${file}): ${msg}`);
  }
  const parsed = ContentDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.join(".") ?? "根";
    throw new Error(`内容文件 schema 校验失败 (${file}) 字段 ${where}: ${first?.message}`);
  }
  return parsed.data;
}

/** 加载 source registry（content/sources/registry.json）。文件缺失时抛错。 */
export function loadSourceRegistry(root?: string): SourceRegistry {
  const contentRoot = resolveContentRoot(root);
  const file = join(contentRoot, "sources", "registry.json");
  if (!existsSync(file)) {
    throw new Error(`source registry 缺失: ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`source registry JSON 解析失败: ${msg}`);
  }
  const parsed = SourceRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.join(".") ?? "根";
    throw new Error(`source registry schema 校验失败 字段 ${where}: ${first?.message}`);
  }
  return parsed.data;
}

/**
 * 加载内容库（laws/ 与 cases/ 下的每个 JSON 文件为一个文档）。
 * 文件按文件名排序以保证确定性。schema 校验失败会抛出带文件名与字段的错误。
 */
export function loadContent(root?: string): LoadedContent {
  const contentRoot = resolveContentRoot(root);
  const lawsDir = join(contentRoot, "laws");
  const casesDir = join(contentRoot, "cases");

  const laws: LawSource[] = [];
  const cases: CaseSource[] = [];
  const documents: ContentDocument[] = [];

  for (const file of listJsonFiles(lawsDir)) {
    const doc = readDocument(file, join(lawsDir, file));
    const law = LawSourceSchema.parse(doc);
    laws.push(law);
    documents.push(law);
  }
  for (const file of listJsonFiles(casesDir)) {
    const doc = readDocument(file, join(casesDir, file));
    const c = CaseSourceSchema.parse(doc);
    cases.push(c);
    documents.push(c);
  }

  const registry = loadSourceRegistry(contentRoot);

  return { laws, cases, documents, registry };
}