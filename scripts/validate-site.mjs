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

/* ---------- 2. 共享资源的指纹引用必须等于本体内容 ---------- */
const cssPath = path.join(root, "assets", "style.css");
const jsPath = path.join(root, "assets", "site-v2.js");
if (!fs.existsSync(cssPath)) errors.push("assets/style.css 不存在（本应由生成器产出）");
if (!fs.existsSync(jsPath)) errors.push("assets/site-v2.js 不存在（手写前端层）");

if (fs.existsSync(cssPath) && fs.existsSync(jsPath)) {
  const ver = { "style.css": md5(cssPath).slice(0, 8), "site-v2.js": md5(jsPath).slice(0, 8) };
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
  notes.push(`指纹 style.css?v=${ver["style.css"]}／site-v2.js?v=${ver["site-v2.js"]}`);
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
for (const r of htmlSet) {
  if (r.startsWith("tw/")) {
    if (!htmlSet.has(r.slice(3))) errors.push(`繁体页 ${r} 没有对应的简体页 ${r.slice(3)}`);
  } else if (!htmlSet.has("tw/" + r)) {
    errors.push(`简体页 ${r} 缺少繁体镜像 tw/${r}`);
  }
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
