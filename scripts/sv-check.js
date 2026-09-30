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
// 有些断言要等微任务（例：分享键走 clipboard.then 才改标签）。它们推进这里，
// 末尾统一 drain 再打印结论 —— 否则 promise 回调会在 process.exit 之后才跑，永远不打印。
const pending = [];
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
  // 「首页」的判据：路径。注意两点：① 别写成 /\/guide\// —— 传相对路径时 f 是
  // "guide/index.html"，前面没斜杠、排除会失效（guide/index.html 曾被当成首页）；
  // ② 别把 tw/ 排除掉 —— tw/index.html 就是繁体首页，它同样没有那枚「回首页」键。
  // 按路径段判最稳：index.html 且不在 guide/ 与 category/ 下。
  const fparts = f.split(/[\\/]/);
  const home = fparts[fparts.length - 1] === "index.html"
    && !fparts.includes("guide") && !fparts.includes("category");
  // 页面显式声明不挂搜索框（用户 2026-09-27 定：首页只要导航 + 列表，不要搜索框）
  const noSearch = doc.body.hasAttribute("data-nosearch");

  ok(doc.querySelector(".read-progress") !== null, "进度条已挂");
  // 「返回顶部」两枚（2026-09-29）：站头工具条里那枚由生成器写在 HTML 上、始终可点；
  // 右下角浮动钮由 site-v2.js 造，滚动一段才浮出（用户追问「到顶部这个是不是要做成浮动的」）。
  const topInBar = doc.querySelector(".toolbar .back-top");
  const topFloat = doc.querySelector("body > .back-top-float");
  ok(topInBar !== null, "工具条里的顶部键已挂（标记来自生成器）");
  ok(topFloat !== null, "右下角浮动钮已挂");
  ok(!!topFloat && topFloat.querySelector("svg") !== null,
    "浮动钮的图标是从工具条那枚克隆来的内联 svg（图标单一出处）");
  ok(!!topFloat && !topFloat.classList.contains("is-on"), "刚打开页面时浮动钮不显示（还没滚动）");
  ok(topInBar === null || topInBar.hidden !== true,
    "工具条里的顶部键始终可点（不随滚动隐藏）");
  if (topFloat) {
    const scrollToArgs = [];
    window.scrollTo = function (a) { scrollToArgs.push(a && typeof a === "object" ? a.top : a); };
    Object.defineProperty(window, "scrollY", { value: 1000, configurable: true, writable: true });
    window.dispatchEvent(new window.Event("scroll"));
    ok(topFloat.classList.contains("is-on"), "滚到 1000px → 浮动钮浮出");
    topFloat.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    ok(scrollToArgs.length > 0 && scrollToArgs[scrollToArgs.length - 1] === 0,
      "点浮动钮 → window.scrollTo(top: 0)");
    window.scrollY = 300;
    window.dispatchEvent(new window.Event("scroll"));
    ok(!topFloat.classList.contains("is-on"), "滚回 300px → 浮动钮隐回去（两个阈值防抖）");
  }
  // 常读总目录这类页本来就没有"条目行"（它列的是常读页本身），没有行就不该出现搜索条
  if (noSearch) {
    ok(!bar, "页面声明 data-nosearch → 不挂搜索条");
  } else {
    ok(!!bar === (rows.length > 0), rows.length ? `可搜索行 [data-srow] = ${rows.length}` : "无条目行 → 不挂搜索条");
  }
  // 分页（生成器 pager_html，2026-09-29）：列表页每 50 条一页。
  // 这里钉三件事：一页不超过 50 条、分页页首/末页的箭头不可点、页码链接是同目录相对路径
  // （写成 ../x-p2.html 在 tw/ 镜像里会跑到 tw/ 根 —— 首次生成就是这么错的）。
  const paged = doc.querySelector(".pager");
  if (paged) {
    ok(rows.length <= 50, `分页页只有一页的量（${rows.length} ≤ 50）`);
    const arrows = paged.querySelectorAll(".pg-arrow");
    const curPage = paged.querySelector(".pg.is-cur");
    const isFirst = curPage && curPage.textContent.trim() === "1";
    const nums = Array.from(paged.querySelectorAll(".pg")).map(e => e.textContent.trim());
    const lastNum = nums.filter(t => /^\d+$/.test(t)).pop();
    ok(!!curPage, "分页条标出当前页");
    const info = (paged.querySelector(".pg-info") || {}).textContent || "";
    const m = info.match(/第\s*(\d+)\/(\d+)\s*页/);
    const curN = m ? +m[1] : (isFirst ? 1 : 2);
    const totalN = m ? +m[2] : 2;
    ok(!!arrows[0] && (curN === 1 ? arrows[0].tagName !== "A" : arrows[0].tagName === "A"),
      curN === 1 ? "第 1 页的「上一页」不可点" : "非首页的「上一页」是真链接");
    ok(!!arrows[1] && (curN === totalN ? arrows[1].tagName !== "A" : arrows[1].tagName === "A"),
      curN === totalN ? "末页的「下一页」不可点" : "非末页的「下一页」是真链接");
    const hrefs = Array.from(paged.querySelectorAll("a.pg")).map(a => a.getAttribute("href"));
    ok(hrefs.length === 0 || hrefs.every(h => h && !h.includes("/")),
      "页码/箭头链接都是同目录相对路径（不带 /）");
    ok(/共\s*\d+\s*篇/.test(paged.textContent) && /搜索/.test(paged.textContent),
      "分页条写明共多少篇、搜索只作用于本页");
    void lastNum;
  }
  /* ---- 站头工具条（简/繁 · 字号 · 日/夜）：图标由生成器写进 HTML，JS 只接行为 ---- */
  const toolbar = doc.querySelector(".toolbar");
  ok(toolbar !== null, "站头工具条已挂（分类下面另起一行）");
  if (toolbar) {
    const tools = toolbar.querySelectorAll(".tool");
    // 首页自己不出「回首页」（已经在首页了），所以首页少一枚。
    // 判据用**文件名**而不是 h1.today —— 那份模板里首页的标题是 h1.home-title，
    // h1.today 早就不在了（老断言靠它，一直在空转）。
    // 「首页」的判据只能有一个：文件路径。
    // 用 h1 类名判过两次都错（模板是 h1.home-title，不是 h1.today → 断言空转）；
    // 用 /index.html$/ 也太松（guide/index.html 是「常读总目录」，不是首页 ——
    // 它会拿到那枚「回首页」键，于是控件数是 5 不是 4，三条断言一起炸）。
    const isFront = home;
    const isPost = /data-page="post"/.test(html);
    const want = isFront ? 4 : (isPost ? 7 : 5);
    ok(tools.length === want, `工具条控件数 = ${want}（实得 ${tools.length}）`);
    const first = toolbar.querySelector(".tool");
    ok(isFront ? first.classList.contains("tool-lang") : first.classList.contains("tool-home"),
      `最左边那枚是${isFront ? "语言" : "回首页"}（实得 ${first.className}）`);
    const homeTool = toolbar.querySelector(".tool-home");
    ok(isFront ? !homeTool : !!homeTool, isFront ? "首页自己不出「回首页」" : "首页外都有「回首页」");
    if (homeTool) ok(/index\.html$/.test(homeTool.getAttribute("href") || ""),
      `回首页指向 ${homeTool.getAttribute("href")}`);
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

  /* ---- 单篇页专测：工具条那枚朗读键的接线 ----
     上面那个 JSDOM 里没有 speechSynthesis，TTS_JS 会在门口安静退出（`if (!("speechSynthesis"
     in window)) return;`），所以这枚键永远是 .is-off —— 必须单独造一个**带 TTS 桩**的
     JSDOM 才测得到真实接线。桩要连 SpeechSynthesisUtterance 一起给，否则点击时抛
     ReferenceError，看起来像"接上了但一按就炸"。 */
  if (/data-page="post"/.test(html)) {
    const dom2 = new JSDOM(html, {
      runScripts: "dangerously",
      pretendToBeVisual: true,
      url: "https://example.test/chinese-daily-brief/posts/x.html",
      beforeParse(w) {
        const spoken = [];
        w.SpeechSynthesisUtterance = function (t) { this.text = t; };
        w.speechSynthesis = {
          cancel() {}, speak(u) { spoken.push(u); }, getVoices() { return []; },
          addEventListener() {}, speaking: false, pending: false, paused: false,
        };
        w.__spoken = spoken;
        // 桌面主路径：没有 navigator.share，只有 clipboard → 点一下应该"复制链接"
        w.__copied = [];
        Object.defineProperty(w.navigator, "clipboard", {
          configurable: true,
          value: { writeText(t) { w.__copied.push(t); return Promise.resolve(); } },
        });
      },
    });
    const { window: w2 } = dom2;
    const doc2 = w2.document;
    if (doc2.readyState === "loading") doc2.dispatchEvent(new w2.Event("DOMContentLoaded"));
    // 分享键的行为在 **site-v2.js**（外部资源，jsdom 不会自动加载），所以要像主循环那样
    // 手动 eval。TTS_JS 是内联脚本、解析时已经跑过了。
    // 顺序跟线上一致：内联脚本先（解析时），site-v2.js 后（defer）。
    try {
      w2.eval(fs.readFileSync(jsFile, "utf8"));
    } catch (e) {
      ok(false, "单篇页里 site-v2.js 抛异常: " + e.message);
    }
    const b2 = doc2.querySelector('.toolbar [data-tool="tts"]');
    ok(!!b2, "单篇页工具条里有朗读键");
    if (b2) {
      ok(!b2.classList.contains("is-off"), "朗读键可见（列表页不写这枚，单篇页才写）");
      ok(doc2.querySelectorAll("h1.art + button.speak").length === 0,
        "不再另造一枚挨着标题的朗读钮");
      const lab = () => b2.querySelector(".tool-label").textContent;
      // 繁体页上的字面是繁体（OpenCC 把内联脚本里的字符串一起转了），所以期望值要跟着 lang 走
      const idle = (doc2.documentElement.getAttribute("lang") || "") === "zh-Hant" ? "朗讀" : "朗读";
      b2.dispatchEvent(new w2.Event("click", { bubbles: true }));
      ok(lab() === "停止" && b2.classList.contains("speaking"),
        `点朗读键 → 标签「${lab()}」且带 .speaking`);
      ok(b2.querySelectorAll("svg").length >= 2, "朗读键里两枚图标（喇叭 + 方块）都在，不是被文字覆盖掉");
      b2.dispatchEvent(new w2.Event("click", { bubbles: true }));
      ok(lab() === idle && !b2.classList.contains("speaking"),
        `再点一次 → 回到「${lab()}」并摘掉 .speaking`);
    }
    // 分享键：桌面路径（有 clipboard、没有 navigator.share）→ 复制当前页地址
    const sb = doc2.querySelector('.toolbar [data-tool="share"]');
    ok(!!sb, "单篇页工具条里有分享键");
    if (sb) {
      ok(sb.querySelectorAll("svg").length === 1, "分享键带内联图标");
      const slab = () => sb.querySelector(".tool-label").textContent;
      const before = slab();
      sb.dispatchEvent(new w2.Event("click", { bubbles: true }));
      ok(w2.__copied.length === 1 && /\/posts\/x\.html$/.test(w2.__copied[0]),
        `点分享键 → 复制了当前页地址：${w2.__copied[0] || "（没复制）"}`);
      const copiedMsg = /zh-Hant/.test(doc2.documentElement.getAttribute("lang") || "")
        ? "已複製連結" : "已复制链接";
      // 标签是在 clipboard.then 里改的 —— 要等一个微任务才看得到
      pending.push(Promise.resolve().then(() => {
        ok(slab() === copiedMsg, `分享键标签回执「${slab()}」（原「${before}」）`);
      }));
    }
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

Promise.all(pending).then(() => {
  console.log(bad ? `\n=== ${bad} 项 FAILED` : "\n=== 全部通过");
  process.exit(bad ? 1 : 0);
});