// Phase 9A：监听参数解析测试（HOST 失败关闭 / PORT 回退语义）。
// 运行：node tests/listen.test.mjs（依赖 dist 先构建）
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHost, resolvePort, DEFAULT_HOST, DEFAULT_PORT } from "../dist/listen.js";

test("HOST 缺失/空白 → 兼容默认 0.0.0.0（CloudBase 兼容，不影响旧环境）", () => {
  assert.equal(resolveHost(undefined), DEFAULT_HOST);
  assert.equal(resolveHost(""), DEFAULT_HOST);
  assert.equal(resolveHost("   "), DEFAULT_HOST);
  assert.equal(DEFAULT_HOST, "0.0.0.0");
});

test("HOST 合法回环/全部接口/IPv6/主机名 → 原样返回", () => {
  for (const ok of ["127.0.0.1", "0.0.0.0", "::1", "::", "localhost", "my-node", "a.b.c.example", "127.0.0.2", "1.2.3.4"]) {
    assert.equal(resolveHost(ok), ok, ok);
  }
});

test("HOST 显式非法 → 抛错（拒绝启动，绝不回退 0.0.0.0）", () => {
  for (const bad of ["9.9.9.999", "1.2.3", "256.1.1.1", "bad host", "127.0.0.1:9000", "/etc/hosts", "evil/../0.0.0.0", "-bad", "bad-", "a..b", "a_b", "x".repeat(300)]) {
    assert.throws(() => resolveHost(bad), undefined, "应拒绝: " + bad);
  }
});

test("HOST 前后空白被修剪（合法值带空白不误判）", () => {
  assert.equal(resolveHost("  127.0.0.1  "), "127.0.0.1");
  assert.equal(resolveHost("\tlocalhost\n"), "localhost");
});

test("PORT：缺失/非法回退 9000；合法范围原样", () => {
  assert.equal(resolvePort(undefined), DEFAULT_PORT);
  assert.equal(resolvePort("0"), DEFAULT_PORT);
  assert.equal(resolvePort("-1"), DEFAULT_PORT);
  assert.equal(resolvePort("65536"), DEFAULT_PORT);
  assert.equal(resolvePort("abc"), DEFAULT_PORT);
  assert.equal(resolvePort("9000"), 9000);
  assert.equal(resolvePort(" 19000 "), 19000);
  assert.equal(resolvePort("65535"), 65535);
});
