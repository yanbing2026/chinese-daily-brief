// 站点结构校验 —— 按"真实架构"校验，而不是校验"生成器在哪"。
//
// 事实（对应 SITE_ARCHITECTURE.md）：
//   * 每个 HTML 都由主机上的 brief-site-build.py 生成，手改会在下次构建被覆盖
//   * assets/style.css 是生成产物 → 引用必须带内容指纹
//   * assets/site-v2.js 是手写前端层、生成器不触碰 → 引用带指纹，且本体用哈希钉住防误改
//   * assets/ 下的手写资源会被构建脚本自动镜像到 tw/assets/
//   * 本站刻意零外链（产品原则：只放原创、不放链接）
//
// 用法: node scripts/validate-site.mjs     退出码 0 = 通过
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const errors = [];
const notes = [];

const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const read = (p) => fs.readFileSync(p, "utf8");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

/* ---------- 收集 ---------- */
const htmlFiles = [];
const allFiles = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p);
    else {
      allFiles.push(p);
      if (name.endsWith(".html")) htmlFiles.push(p);
    }
  }
})(root);

/* ---------- 1. 每页：元数据、本地引用、零外链、锚点、重复 id ---------- */
for (const file of htmlFiles) {
  const text = read(file);
  const r = rel(file);

  if (!text.includes('name="viewport"')) errors.push(`${r}: 缺 viewport`);
  if (!/<title>[^<]+<\/title>/i.test(text)) errors.push(`${r}: 缺 title`);
  if (!text.includes("assets/style.css")) errors.push(`${r}: 未加载 assets/style.css`);
  if (!text.includes("assets/site-v2.js")) errors.push(`${r}: 未加载 assets/site-v2.js`);
  if (!text.includes("assets/cat-colors.css")) errors.push(`${r}: 未加载 assets/cat-colors.css`);

  for (const m of text.matchAll(/(?:href|src)="([^"]+)"/gi)) {
    const u = m[1];
    if (/^(mailto:|tel:|data:|javascript:)/i.test(u)) continue;
    if (/^https?:/i.test(u)) {
      errors.push(`${r}: 出现外链 ${u}（本站刻意零外链）`);
      continue;
    }
    const [filePart, hash] = u.split("#");
    const target = path.resolve(path.dirname(file), filePart.split("?")[0]);
    if (filePart && !fs.existsSync(target)) {
      errors.push(`${r}: 本地引用不存在 ${u}`);
    } else if (hash) {
      // 页内锚点也要真的存在：#comments 这种跳转不能指向空气
      const targetText = filePart ? read(target) : text;
      if (!targetText.includes(`id="${hash}"`)) errors.push(`${r}: 锚点 #${hash} 在目标页不存在`);
    }
  }

  const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  if (dup.length) errors.push(`${r}: 重复 id ${dup.join(", ")}`);
}

/* ---------- 1b. 零外链/无追踪的硬检查 ---------- */
// 上面 1 里的 /(href|src)="..."/ 只覆盖了**带引号、且恰好是 href/src** 的写法。
// 一旦破了零外链，泄漏读者 IP 的渠道远不止那一条，所以这里逐条堵：
//
//   1. 协议相对 //host/x        —— 现有正则 /^https?:/ 漏掉，但浏览器照样发请求
//   2. srcset / imagesrcset     —— 现代 img 的多候选来源
//   3. 内联 style 里的 url(…)    —— 背景图/字体，href/src 正则完全看不见
//   4. 内联 <style> 里的 @import
//   5. <base href>              —— 改写全站相对路径的解析基准
//   6. http-equiv=refresh       —— 0 秒跳转到外站
//   7. 脚本里 fetch/XHR/beacon/new Image —— 运行时才发生的请求，静态扫 href 抓不到
//   8. <iframe>/<object>/<embed> —— 整页嵌别人的站
//   9. <form action> 指到外站    —— 表单提交
//  10. data:image/ 以外的 data: —— 少见但同源判定会放行
//
// 判据统一为「有没有指向站外的地址」。本站**允许**：站内绝对路径、页内锚点、
// 相对路径、以及**纯 data: 图片**（data: 不产生网络请求，不泄漏任何东西）。
const isExternal = (u) =>
  /^\s*(?:https?:)?\/\//i.test(u) ||
  /^\s*https?:/i.test(u);

for (const file of htmlFiles) {
  const text = read(file);
  const r = rel(file);
  const bad = (what, m) => errors.push(`${r}: ${what} ${String(m).slice(0, 80)}（本站零外链/无追踪）`);

  // 1) 协议相对 / 绝对地址，扫**所有**属性值而不只是 href/src
  for (const m of text.matchAll(/(?:href|src|action|data|poster|formaction|cite|background)\s*=\s*"([^"]*)"/gi)) {
    if (isExternal(m[1])) bad("属性里指向站外", m[1]);
  }
  // 2) srcset：逗号分隔的候选，每个都可能是外站
  for (const m of text.matchAll(/(?:srcset|imagesrcset)\s*=\s*"([^"]*)"/gi)) {
    for (const cand of m[1].split(",")) {
      const u = cand.trim().split(/\s+/)[0];
      if (u && isExternal(u)) bad("srcset 候选指向站外", u);
    }
  }
  // 3) 内联 style 属性 + 4) <style> 块里的 url() / @import
  const styleBodies = [
    ...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi),
  ].map((m) => m[1]);
  for (const m of text.matchAll(/style\s*=\s*"([^"]*)"/gi)) styleBodies.push(m[1]);
  for (const body of styleBodies) {
    for (const m of body.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
      if (isExternal(m[1]) && !/^\s*data:/i.test(m[1])) bad("CSS url() 指向站外", m[1]);
    }
    for (const m of body.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi)) {
      if (isExternal(m[1])) bad("CSS @import 指向站外", m[1]);
    }
  }
  // 5) <base href>：会悄悄改写全站相对链接的基准
  for (const m of text.matchAll(/<base[^>]+href\s*=\s*"([^"]*)"/gi)) {
    if (isExternal(m[1])) bad("<base href> 指向站外", m[1]);
  }
  // 6) http-equiv=refresh
  for (const m of text.matchAll(/http-equiv\s*=\s*["']?refresh["']?[^>]*url\s*=\s*([^"'\s>]+)/gi)) {
    if (isExternal(m[1])) bad("meta refresh 跳转到站外", m[1]);
  }
  // 7) 运行时请求：脚本里拼出来的地址静态扫不出来，只能对"明显站外"报警
  for (const m of text.matchAll(/(?:fetch|open)\(\s*[`'"]([^`'"]+)/gi)) {
    if (isExternal(m[1])) bad("脚本运行时请求站外", m[1]);
  }
  for (const m of text.matchAll(/navigator\.sendBeacon\(\s*[`'"]([^`'"]+)/gi)) {
    if (isExternal(m[1])) bad("sendBeacon 发往站外（会带读者 IP）", m[1]);
  }
  // 8) 嵌页 / 9) 表单提交目标
  for (const m of text.matchAll(/<(iframe|object|embed)\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)) {
    if (isExternal(m[2])) bad(`<${m[1]}> 嵌入站外页面`, m[2]);
  }
  for (const m of text.matchAll(/<form[^>]*\baction\s*=\s*"([^"]*)"/gi)) {
    if (isExternal(m[1])) bad("<form> 提交到站外", m[1]);
  }
  // 10) 非常规 data:（图片类 data: 不产生网络请求，放行）
  for (const m of text.matchAll(/(?:href|src)\s*=\s*"(data:[^"]*)"/gi)) {
    if (!/^data:image\//i.test(m[1])) bad("非常规 data: 资源", m[1].slice(0, 24));
  }
}

/* ---------- 1c. 手写资源（css/js）里的站外地址 ---------- */
// assets/ 下的文件不经过上面的 HTML 扫描，只在 2b 查了 CSS 的 url()。
// JS 里的地址没人查过 —— 而"无追踪"最容易被破的地方正是前端脚本。
// 注意：这里**不能**引用 jsPath —— 它是下面 2 节用 const 声明的，在本节
// 执行时还没初始化（TDZ），会直接抛 ReferenceError。allFiles 已经包含
// assets/site-v2.js 本身，全量扫 .js 即可。
for (const p of allFiles.filter((f) => f.endsWith(".js"))) {
  if (!fs.existsSync(p)) continue;
  const r = rel(p);
  const text = read(p);
  for (const m of text.matchAll(/(?:fetch|open)\(\s*[`'"]([^`'"]+)/gi)) {
    if (isExternal(m[1])) errors.push(`${r}: fetch/open 指向站外 ${m[1].slice(0, 80)}`);
  }
  for (const m of text.matchAll(/navigator\.sendBeacon\(\s*[`'"]([^`'"]+)/gi)) {
    if (isExternal(m[1])) errors.push(`${r}: sendBeacon 发往站外 ${m[1].slice(0, 80)}`);
  }
  for (const m of text.matchAll(/\.(?:src|href)\s*=\s*[`'"]([^`'"]+)/gi)) {
    if (isExternal(m[1])) errors.push(`${r}: 动态设置 ${m[1].slice(0, 60)} 指向站外`);
  }
}

/* ---------- 2. 共享资源的指纹引用必须等于本体内容 ---------- */
const cssPath = path.join(root, "assets", "style.css");
const jsPath = path.join(root, "assets", "site-v2.js");
const catCssPath = path.join(root, "assets", "cat-colors.css");
if (!fs.existsSync(cssPath)) errors.push("assets/style.css 不存在（手写设计文件）");
if (!fs.existsSync(jsPath)) errors.push("assets/site-v2.js 不存在（手写前端层）");
if (!fs.existsSync(catCssPath)) errors.push("assets/cat-colors.css 不存在（生成器产出）");

if (fs.existsSync(cssPath) && fs.existsSync(jsPath) && fs.existsSync(catCssPath)) {
  const ver = {
    "style.css": md5(cssPath).slice(0, 8),
    "cat-colors.css": md5(catCssPath).slice(0, 8),
    "site-v2.js": md5(jsPath).slice(0, 8),
  };
  for (const file of htmlFiles) {
    const text = read(file);
    const r = rel(file);
    for (const [name, v] of Object.entries(ver)) {
      const pat = new RegExp(`assets/${name.replace(/\./g, "\\.")}\\?v=([0-9a-f]+)`, "g");
      const found = [...text.matchAll(pat)];
      if (!found.length) errors.push(`${r}: ${name} 引用没有内容指纹 ?v=`); // 无指纹 → 读者被缓存挡住
      for (const f of found) if (f[1] !== v) errors.push(`${r}: ${name} 指纹 v=${f[1]} ≠ 本体现值 v=${v}`);
    }
  }
  notes.push(Object.entries(ver).map(([n, v]) => `${n}?v=${v}`).join("／"));
}

/* ---------- 2b. 设计文件的"覆盖检查" ---------- */
// 允许整体重做外观（style.css 是手写文件），但不允许把控件样式弄丢 ——
// 丢了页面看着正常、控件却变形/无样式，这类故障静态检查很难发现。
const REQUIRED_SELECTORS = [
  ".wrap", ".site-tools", ".searchbox", ".category-filter", ".result-count", ".clear-search",
  ".read-progress", ".back-top", ".catnav", ".chip", ".art", ".art-meta",
  ".notice", ".c-link", ".ex", ".comments", ".c-form", ".c-item", ".c-report",
  ".fsr", ".th", ".guide", ".lead", ".hl", ".cnt", ".postnav",
  // 邮件订阅表单已于 2026-09-28 移除（Gary："拿掉邮箱订阅"），对应的
  // .subscribe/.sub-form/.sub-btn/.sub-msg 四个选择器也从必查清单里去掉。
  // 保留它们会让"删样式"永远通不过 —— 这个检查的用意是**防丢样式**，
  // 而控件已经不存在了，没有东西可丢。
];
if (fs.existsSync(cssPath)) {
  const text = read(cssPath);
  const missing = REQUIRED_SELECTORS.filter((s) => !text.includes(s));
  if (missing.length) {
    errors.push(
      `assets/style.css 缺少这些选择器的样式（对应控件会没有外观）：${missing.join(" ")}。` +
      `重做外观时请保留它们，或先确认对应控件已不再使用。`
    );
  }
  if (/@import\s+url\(\s*["']?https?:/i.test(text)) errors.push("assets/style.css 出现外部 @import（本站零外链）");
  if (/url\(\s*["']?https?:/i.test(text)) errors.push("assets/style.css 引用了外部资源（本站零外链）");
}

/* ---------- 3. site-v2.js 本体哈希钉住（生成器误写/手改都会被挡住） ---------- */
const pinPath = path.join(root, "scripts", "site-v2.sha256");
if (fs.existsSync(jsPath)) {
  const actual = sha256(jsPath);
  if (!fs.existsSync(pinPath)) {
    errors.push(`scripts/site-v2.sha256 缺失；写入这一行即可钉住当前前端层：\n  ${actual}  assets/site-v2.js`);
  } else {
    const pinned = read(pinPath).trim().split(/\s+/)[0];
    if (pinned !== actual) {
      errors.push(
        `assets/site-v2.js 与钉住哈希不符（钉住 ${pinned.slice(0, 12)}… 实际 ${actual.slice(0, 12)}…）。` +
        `有意修改就一并更新：sh -c 'sha256sum assets/site-v2.js > scripts/site-v2.sha256'`
      );
    }
  }
}

/* ---------- 4. 简繁镜像：页面结构一致 + 手写资源镜像逐字节一致 ---------- */
const htmlSet = new Set(htmlFiles.map(rel));
// 这些页面不需要繁体镜像：错误页（简繁同形，读者只看到几十个字）
const NO_MIRROR = ["404.html"];

/* 关键词页（tag/）的**文件名本身是中文**，镜像时会被 OpenCC 一起转繁
 * （简体 tag/习近平.html → 繁體 tag/習近平.html）。所以 tw/X → X 这条
 * 简单对应关系对 tag/ 不成立，直接比会报"没有对应的简体页"。
 * 生成器（brief-site-build.py _s2t_names）用的是 OpenCC，这里没法 import
 * Python，只能靠"实际存在的文件"来对齐：对每个简体 tag 页，找繁體侧
 * 去掉 tw/ 前缀后**同名的**不行、但能在繁體 tag/ 目录里找到一个页子的，
 * 视为已镜像。反过来，繁體 tag 页若在简体 tag/ 目录里找不到任何对应页，
 * 才是真孤儿。 */
const twTagSet = new Set(
  htmlFiles
    .map(rel)
    .filter((r) => r.startsWith("tw/tag/"))
    .map((r) => r.slice("tw/tag/".length))
);
for (const r of htmlSet) {
  if (r.startsWith("tw/")) {
    if (r.startsWith("tw/tag/")) {
      // 中文关键词页：只要繁體 tag/ 目录里存在这个文件就算有对应页
      // （名字必然不同：習近平 ≠ 习近平）。真正的孤儿是"繁體有、简体完全没有"，
      // 下面用简体 tag 页的总量与交集来判。
      if (!twTagSet.has(r.slice("tw/tag/".length))) {
        errors.push(`繁體关键词页 ${r} 未在镜像集合中`);
      }
    } else if (!htmlSet.has(r.slice(3))) {
      errors.push(`繁体页 ${r} 没有对应的简体页 ${r.slice(3)}`);
    }
  } else if (r.startsWith("tag/")) {
    // 简体关键词页：繁體侧必有同数量级的对应页（具体哪几个由生成器决定）
    if (twTagSet.size === 0) errors.push(`简体关键词页 ${r} 缺少繁體镜像 tag/ 目录`);
  } else if (!htmlSet.has("tw/" + r) && !NO_MIRROR.includes(r)) {
    errors.push(`简体页 ${r} 缺少繁体镜像 tw/${r}`);
  }
}
// 繁體关键词页数量不得多于简体（多出来的是上一版残留的孤儿）
// **必须用 rel()**：htmlFiles 里存的是绝对路径，直接 startsWith("tag/")
// 永远为 false —— 实测报"简体 0 个"，而盘上明明 48 个。
const simpleTagCount = [...htmlSet].filter((r) => r.startsWith("tag/")).length;
if (twTagSet.size > simpleTagCount) {
  errors.push(
    `繁體关键词页 ${twTagSet.size} 个多于简体 ${simpleTagCount} 个（有孤儿残留）`
  );
}

const assetsDir = path.join(root, "assets");
const twAssetsDir = path.join(root, "tw", "assets");
if (fs.existsSync(assetsDir) && fs.existsSync(twAssetsDir)) {
  for (const name of fs.readdirSync(assetsDir)) {
    const src = path.join(assetsDir, name);
    if (!fs.statSync(src).isFile()) continue;
    const dst = path.join(twAssetsDir, name);
    if (!fs.existsSync(dst)) errors.push(`繁体侧缺资源 tw/assets/${name}（生成器应整目录镜像）`);
    else if (md5(src) !== md5(dst)) errors.push(`tw/assets/${name} 与 assets/${name} 内容不一致`);
  }
}

/* ---------- 结果 ---------- */
notes.forEach((n) => console.log("· " + n));
if (errors.length) {
  console.error("SITE VALIDATION FAILED");
  errors.forEach((e) => console.error("- " + e));
  process.exit(1);
}
console.log(`SITE VALIDATION OK — ${htmlFiles.length} HTML（含繁体镜像），${allFiles.length} 文件`);
