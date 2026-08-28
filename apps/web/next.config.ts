import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // 【临时环境兼容措施，不是正常生产方案】
  // 真实原因：本机构建沙箱禁止子进程管道 stdio，Next 构建期内部的 TypeScript 校验
  // （spawn 子进程）会触发 EPERM，删除本项后构建在 "Running TypeScript ..." 步骤失败
  // （实际失败证据见 Phase 1B-FIX 报告：spawn EPERM，exit 1）。
  // 即使保留本项，类型检查也不会被跳过：
  //  - Web 构建脚本为 `tsc --noEmit && next build`，先通过 tsc 才会执行 next build（fail-closed）；
  //  - 根 build 脚本先递归执行所有工作区 typecheck，再执行构建。
  // 解除条件：在无此沙箱限制的环境（标准 CI / 开发机）中删除本项，恢复 Next 构建期原生类型校验。
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
