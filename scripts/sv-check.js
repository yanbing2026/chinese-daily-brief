/* sv-check.js —— 用 jsdom 真跑 assets/site-v2.js，验证搜索/筛选/进度条在各类页面上真的能用。
 *
 * 为什么不用浏览器：这台主机没有浏览器。jsdom 能跑真实 DOM + 脚本，足以验证
 * "控件挂上去了吗、点击/输入后行数变了吗"这类断言。
 *
 * 用法: node sv-check.js <首页.html> [栏目页.html ...]
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const files = process.argv.slice(2);
if (!files.length) {
  console.error("用法: node sv-check.js <页面.html> ...");
  process.exit(2);
}

let bad = 0;
const ok = (cond, msg) => {
  console.log((cond ? "  ✓ " : "  ✗ ") + msg);
  if (!cond) bad++;
};

for (const f of files) {
  const html = fs.readFileSync(f, "utf8");
  const dir = path.dirname(path.resolve(f));
  console.log(`\n=== ${f}`);
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: undefined,
    pretendToBeVisual: true,
    url: "https://example.test/chinese-daily-brief/" + path.basename(dir) + "/",
  });
  const { window } = dom;
  // 页面里的 <script src> 不会自动加载（resources 未开），手动注入本地 site-v2.js
  const src = path.join(dir, "..", "assets", "site-v2.js");
  const alt = path.join(dir, "assets", "site-v2.js");
  const jsFile = fs.existsSync(src) ? src : alt;
  // 用 window.eval 直接跑：注入 <script> 在 jsdom 里偶发不执行，eval 一定跑，异常还能抓到
  try {
    window.eval(fs.readFileSync(jsFile, "utf8"));
  } catch (e) {
    console.log("  ✗ 脚本抛异常: " + e.message);
    bad++;
    continue;
  }
  const doc = window.document;
  // jsdom 从字符串建树后 readyState 仍是 "loading"，而 DOMContentLoaded 已经过去了 ——
  // 脚本里的 ready() 会挂上监听器但永远等不到事件（现象：脚本没报错却什么都没做）。
  if (doc.readyState === "loading") {
    doc.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  }
  console.log("  readyState=" + doc.readyState);

  const rows = doc.querySelectorAll("[data-srow]");
  const bar = doc.querySelector(".site-tools");
  const nav = doc.querySelector(".catnav");
  const isHome = !!doc.querySelector("h1.today");
  const home = /index\.html$/.test(f) && !/\/category\/|\/guide\/|\/tw\//.test(f);
  // 页面显式声明不挂搜索框（用户 2026-09-27 定：首页只要导航 + 列表，不要搜索框）
  const noSearch = doc.body.hasAttribute("data-nosearch");

  ok(doc.querySelector(".read-progress") !== null, "进度条已挂");
  ok(doc.querySelector(".back-top") !== null, "返回顶部按钮已挂");
  ok(doc.querySelector(".back-top").hidden === true, "返回顶部初始隐藏");
  // 常读总目录这类页本来就没有"条目行"（它列的是常读页本身），没有行就不该出现搜索条
  if (noSearch) {
    ok(!bar, "页面声明 data-nosearch → 不挂搜索条");
  } else {
    ok(!!bar === (rows.length > 0), rows.length ? `可搜索行 [data-srow] = ${rows.length}` : "无条目行 → 不挂搜索条");
  }
  /* ---- 站头工具条（简/繁 · 字号 · 日/夜）：图标由生成器写进 HTML，JS 只接行为 ---- */
  const toolbar = doc.querySelector(".toolbar");
  ok(toolbar !== null, "站头工具条已挂（分类下面另起一行）");
  if (toolbar) {
    const tools = toolbar.querySelectorAll(".tool");
    ok(tools.length === 3, `工具条三枚控件（实得 ${tools.length}）`);
    ok(toolbar.querySelectorAll(".tool .ic").length >= tools.length,
      `每枚控件都有内联 SVG 图标（共 ${toolbar.querySelectorAll(".tool .ic").length} 枚）`);
    ok(!!toolbar.querySelector('[data-tool="fs"] .tool-label')
       && !!toolbar.querySelector('[data-tool="theme"] .tool-label'),
      "字号/日夜控件各带一个文字标签（.tool-label）");
    const lang = toolbar.querySelector(".tool-lang");
    ok(!!lang && /\.html$/.test(lang.getAttribute("href") || ""),
      `语言切换指向真实页面（不是占位的 #）：${lang && lang.getAttribute("href")}`);
    const fsb = toolbar.querySelector('[data-tool="fs"]');
    const l0 = fsb.querySelector(".tool-label").textContent;
    const h0 = doc.documentElement.style.fontSize;
    fsb.dispatchEvent(new window.Event("click", { bubbles: true }));
    ok(fsb.querySelector(".tool-label").textContent !== l0,
      `点字号键 → 标签「${l0}」→「${fsb.querySelector(".tool-label").textContent}」`);
    ok(doc.documentElement.style.fontSize !== h0,
      `根字号真的变了：${h0 || "默认"} → ${doc.documentElement.style.fontSize || "默认"}`);
    const thb = toolbar.querySelector('[data-tool="theme"]');
    const t0 = thb.querySelector(".tool-label").textContent;
    thb.dispatchEvent(new window.Event("click", { bubbles: true }));
    const scheme = doc.documentElement.getAttribute("data-theme");
    ok(thb.querySelector(".tool-label").textContent !== t0 && /^(light|dark)$/.test(scheme || ""),
      `点日夜键 → 「${t0}」→「${thb.querySelector(".tool-label").textContent}」（data-theme=${scheme}）`);
  }



  if (!rows.length) continue;
  ok(!!rows[0].getAttribute("data-cat"), "行上带 data-cat");
  // 「今日快速入口」已按用户要求删除（用户 2026-09-27、09-28 两次要求）。
  // 反向断言：它**不该**出现 —— 该区块是 JS 动态生成的，生成器删了容器
  // 不等于它消失，宿主元素（.site-tools/.catnav）一在它就自己长回来。
  // 位置很重要：必须在下面 `if (noSearch) continue;` **之前** —— 首页声明了
  // data-nosearch，写在后面就永远不执行（我第一版就是这么写的）。
  ok(doc.querySelector(".today-focus") === null, "今日快速入口已移除");

  if (noSearch) continue;      // 无搜索条，下面的搜索/清除/计数断言都不适用

  const input = bar.querySelector("input");
  const clear = bar.querySelector(".clear-search");
  const count = bar.querySelector(".result-count");
  const filter = bar.querySelector(".category-filter");
  ok(input !== null, "搜索输入框存在");
  ok(clear.hidden === true, "清除按钮初始隐藏");
  if (!isHome) ok(!filter, "栏目页/往期/常读页不出现类别筛选（只有首页需要）");

  // 真输入一个词
  const sample = (rows[0].textContent || "").replace(/\s+/g, "").slice(0, 4);
  input.value = sample;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const visible = Array.prototype.filter.call(doc.querySelectorAll("[data-srow]"), (r) => !r.hidden);
  ok(visible.length > 0 && visible.length <= rows.length, `搜「${sample}」→ 显示 ${visible.length}/${rows.length}`);
  ok(/找到 \d+ [项項]/.test(count.textContent), `结果计数已更新：${count.textContent}`);
  ok(clear.hidden === false, "有输入时清除按钮出现");

  // 清除还原
  clear.dispatchEvent(new window.Event("click", { bubbles: true }));
  const after = Array.prototype.filter.call(doc.querySelectorAll("[data-srow]"), (r) => !r.hidden);
  ok(after.length === rows.length, `清除后全部恢复（${after.length}）`);

  if (home) {
    ok(!!filter, "首页出现类别筛选下拉");
    if (filter) {
      const opts = Array.prototype.slice.call(filter.querySelectorAll("option"));
      ok(opts.length === nav.querySelectorAll("a[data-cat]").length + 1,
        `下拉选项数 = 栏目数 + 全部类别（${opts.length}）`);
      // 断言的是"别把英文键直接当标签"（AI 这类栏目本身就带拉丁字母，不能要求每个字都是汉字）
      const labels = opts.slice(1).map((o) => o.textContent.trim());
      const bare = opts.slice(1).filter((o) => o.textContent.trim() === o.value);
      ok(bare.length === 0, `选项不是裸键：${labels.slice(0, 4).join(" / ")}`);
      // 真选一个类别
      const target = opts[1].value;
      filter.value = target;
      filter.dispatchEvent(new window.Event("change", { bubbles: true }));
      const shown = Array.prototype.filter.call(doc.querySelectorAll("[data-srow]"),
        (r) => !r.hidden).map((r) => r.getAttribute("data-cat"));
      ok(shown.length > 0 && shown.every((c) => c === target),
        `选「${opts[1].textContent}」→ 只剩 ${shown.length} 条，全部来自 ${target}`);
      // 类别 + 搜索并存
      input.value = "zzz-不存在-zzz";
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      const none = Array.prototype.filter.call(doc.querySelectorAll("[data-srow]"), (r) => !r.hidden);
      ok(none.length === 0, "类别 + 搜索同时生效（不存在的词 → 0 条）");
    }
  }
}

console.log(bad ? `\n=== ${bad} 项 FAILED` : "\n=== 全部通过");
process.exit(bad ? 1 : 0);