// CloudBase HTTP 云函数部署包构建脚本（Monorepo 打包）。
// - 将 functions/api 的运行时代码连同 @laoyouju/shared、@laoyouju/retrieval、zod 打包为单文件 ESM bundle，
//   避免依赖本机 pnpm workspace symlink；
// - 复制 content/laws、content/cases 等问答所需资料；
// - 复制 scf_bootstrap 启动脚本；
// - 生成最小 package.json（无 node_modules 依赖，installDependency=false）。
// 产物：<仓库根>/deploy/api（已 gitignore）。
import { build } from "esbuild";
import { cpSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // functions/api/scripts
const apiRoot = join(here, ".."); // functions/api
const repoRoot = join(apiRoot, "..", ".."); // repo root
const deployDir = join(repoRoot, "deploy", "api");

rmSync(deployDir, { recursive: true, force: true });
mkdirSync(join(deployDir, "dist"), { recursive: true });
mkdirSync(join(deployDir, "content"), { recursive: true });

await build({
  entryPoints: [join(apiRoot, "dist", "server.js")],
  outfile: join(deployDir, "dist", "server.js"),
  bundle: true,
  platform: "node",
  target: "node20.19",
  format: "esm",
  sourcemap: false,
  minify: false,
  logLevel: "info",
  // Phase 9：better-sqlite3 为原生模块，不能打入单文件 bundle；CloudBase 运行时使用
  // BUDGET_STORE=cloudbase（或不配置=安全失败），永远不会加载该模块（sqlite-budget.ts 内惰性 import）。
  external: ["better-sqlite3"],
});

cpSync(join(repoRoot, "content", "laws"), join(deployDir, "content", "laws"), { recursive: true });
cpSync(join(repoRoot, "content", "cases"), join(deployDir, "content", "cases"), { recursive: true });
// Phase 7A：运行时加载需要 source registry（content/sources/registry.json）。
cpSync(join(repoRoot, "content", "sources", "registry.json"), join(deployDir, "content", "sources", "registry.json"));
cpSync(join(apiRoot, "scf_bootstrap"), join(deployDir, "scf_bootstrap"));

writeFileSync(
  join(deployDir, "package.json"),
  JSON.stringify(
    { name: "laoyouju-api", version: "0.0.0", private: true, type: "module", main: "dist/server.js" },
    null,
    2,
  ) + "\n",
);

// Phase 8：构建期 kill switch（管理员紧急开关，默认关闭=服务可用）。
// 操作：KILL_SWITCH_BUILD=on node scripts/build-deploy.mjs 后重新 tcb fn deploy 即暂停真实模型调用；
// 恢复：不带该变量重新构建部署。不触碰任何环境变量/密钥。
const killSwitchBuild = (process.env.KILL_SWITCH_BUILD ?? "").trim().toLowerCase() === "on";
writeFileSync(
  join(deployDir, "runtime-config.json"),
  JSON.stringify({ killSwitch: killSwitchBuild }, null, 2) + "\n",
);

// 复制一份本地验证用的说明（非必需，仅为交接记录）。
writeFileSync(
  join(deployDir, "DEPLOY_PACKAGE.md"),
  "本目录为 CloudBase HTTP 云函数 laoyouju-api 的部署包（由 pnpm run build:deploy 生成）。\n" +
    "- 入口：scf_bootstrap -> node dist/server.js（监听 9000 端口）。\n" +
    "- 运行时代码已由 esbuild 打包（含 shared/retrieval/search/zod），不依赖 pnpm workspace symlink。\n" +
    "- content/ 为问答所需资料（laws、cases、sources/registry.json）。\n" +
    "- 需要环境变量：DEEPSEEK_API_KEY（控制台人工配置）；DEEPSEEK_BASE_URL/DEEPSEEK_MODEL 可选；WSA_API_KEY 可选（未配置时联网搜索不可用，本地知识库仍工作）。\n",
);

console.log(`deploy api built -> ${deployDir}`);
