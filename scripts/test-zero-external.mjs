#!/usr/bin/env node
// 零外链检查的**自测**：往站点副本里注入外链写法，确认 validate-site.mjs 真的会报。
//
// 为什么需要：Gary 2026-09-27 要求把"零外链/无追踪"从人工承诺变成自动校验。
// 但一条从没触发过的检查等于没有检查 —— 规则写错了、正则写窄了，全都不会有人
// 知道，只能等线上真被破。所以这里对 1b/1c 的每条判据各造一个阳性样本，
// 跑一遍校验脚本，确认每条都报出对应的错误信息。
//
// **全程在副本上做，不碰真站点**。早先版本是往真 index.html 里注入再还原，
// 一旦中途异常退出，线上首页就带着外链躺在那儿了 —— 那正好是这套检查要防的
// 事故。validate-site.mjs 以 process.cwd() 为站点根，所以整目录拷进 tmp 即可。
//
// 先确认"未注入时"是干净的：否则"没报错"证明不了任何事。
//
// 用法: node scripts/test-zero-external.mjs     退出码 0 = 通过

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zeroext-"));

/** 拷一份可运行的最小站点：校验脚本要的 HTML + assets + scripts + 404 */
fs.cpSync(root, tmp, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(root, src);
    if (!rel) return true;
    if (rel.startsWith(".git") || rel.startsWith("node_modules")) return false;
    return true;
  },
});

const validator = path.join(tmp, "scripts", "validate-site.mjs");
const victim = path.join(tmp, "index.html");
const original = fs.readFileSync(victim, "utf8");

/** 在副本上跑一次校验；返回全部输出（成功时 stdout 是 OK 那行） */
function validateOnce() {
  try {
    return execFileSync("node", [validator], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return (e.stdout || "") + (e.stderr || "");
  }
}
const inject = (snippet) => fs.writeFileSync(victim, original.replace("</body>", snippet + "</body>"));

/** 每条判据：注入的片段 + 期望在校验输出里出现的关键词 */
const CASES = [
  ["协议相对外链", `<a href="//cdn.example.com/x.js">x</a>`, "属性里指向站外"],
  ["绝对外链 img", `<img src="https://tracker.example.com/p.gif">`, "属性里指向站外"],
  ["srcset 外站", `<img srcset="//cdn.example.com/a.png 1x" src="a.png">`, "srcset 候选指向站外"],
  ["内联 style 的 url()", `<div style="background:url(https://cdn.example.com/b.png)">x</div>`, "CSS url() 指向站外"],
  ["style 块里的 url()", `<style>.a{background:url(//cdn.example.com/c.png)}</style>`, "CSS url() 指向站外"],
  ["@import", `<style>@import url("//cdn.example.com/d.css");</style>`, "CSS @import 指向站外"],
  ["base href", `<base href="https://evil.example.com/">`, "<base href> 指向站外"],
  ["meta refresh", `<meta http-equiv="refresh" content="0;url=https://evil.example.com/">`, "meta refresh 跳转到站外"],
  ["fetch 站外", `<script>fetch("https://api.example.com/collect")</script>`, "脚本运行时请求站外"],
  ["sendBeacon 站外", `<script>navigator.sendBeacon('https://track.example.com/b')</script>`, "sendBeacon 发往站外"],
  ["iframe", `<iframe src="https://ads.example.com/"></iframe>`, "嵌入站外页面"],
  ["form action", `<form action="https://collect.example.com/p"><input></form>`, "<form> 提交到站外"],
  ["非常规 data:", `<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>`, "非常规 data: 资源"],
];

/** 不该报的：这些都不产生站外请求 */
const ALLOWED = [
  ["站内相对链接", `<a href="posts/2026-09-27-disc-walmart-72629d.html">x</a>`],
  ["页内锚点", `<a href="#comments">x</a>`],
  ["站内绝对路径", `<a href="/index.html">x</a>`],
  ["纯 data: 图片", `<img src="data:image/png;base64,iVBORw0KGgo=">`],
  ["mailto", `<a href="mailto:a@b.com">x</a>`],
];

let bad = 0;
fs.writeFileSync(victim, original);
const base = validateOnce();
if (!/SITE VALIDATION OK/.test(base)) {
  console.log("✗ 副本基线就不干净，站点当前已有校验错误：\n" + base.slice(0, 800));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
console.log("✓ 基线：未注入时副本校验通过\n");

for (const [name, snippet, expect] of CASES) {
  inject(snippet);
  const out = validateOnce();
  const hit = out.includes(expect);
  if (!hit) bad++;
  console.log(`  ${hit ? "✓" : "✗"} ${name} → 期望报错含「${expect}」`);
  if (!hit) console.log(`      实际输出：\n${out.slice(0, 500)}`);
}

for (const [name, snippet] of ALLOWED) {
  inject(snippet);
  const out = validateOnce();
  const noisy = /（本站零外链\/无追踪）/.test(out);
  if (noisy) bad++;
  console.log(`  ${noisy ? "✗" : "✓"} ${name} 不该被报为外链`);
  if (noisy) console.log(`      实际输出：\n${out.slice(0, 500)}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log();
if (bad) {
  console.log(`${bad} 项失败（真站点未被触碰）`);
  process.exit(1);
}
console.log(`全部 ${CASES.length} 条阳性 + ${ALLOWED.length} 条阴性通过；真站点未被触碰`);
