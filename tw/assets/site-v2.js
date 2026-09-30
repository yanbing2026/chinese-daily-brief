/* 站点交互：搜索、类别筛选、阅读进度条、返回顶部。
 *
 * 与建站脚本的契约（**改选择器前先看 brief-site-build.py**）：
 *   [data-srow]             每一"条"可被搜索/筛选的内容行（首页卡片、栏目页/往期/常读页的 li）
 *   行上的 data-cat          该行所属栏目键（如 uscis），类别筛选直接读它
 *   .catnav a[data-cat]      栏目导航链接：既是分类页入口，也是筛选下拉的选项来源
 *   h1.today                 首页标记。只有它存在时才是首页专属功能（类别筛选）
 *
 * 走 data 属性而不是类名：同一份脚本要用在结构差别很大的几页上（首页是 article 卡片，
 * 栏目/往期/常读页是 li），类名会漂，数据属性是显式契约。
 * 本文件是"共享资源"，建站脚本不会覆盖它；但 assets/style.css 是生成物，样式必须写在
 * brief-site-build.py 里，否则一次重建就没了。
 */
(function () {
  "use strict";
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  // 界面文案按页面语言出：繁体镜像页是同一份脚本，以前这里硬编码简体，
  // 于是繁体版里搜索框写着"搜索本站内容…"、筛选写着"全部类别" —— i18n 漏网。
  var L = (document.documentElement.lang || "zh-Hans").indexOf("Hant") >= 0
    ? { search: "搜尋本站內容…", clear: "清除", found: "找到 ", item: " 項",
        filter: "按類別篩選", all: "全部類別" }
    : { search: "搜索本站内容…", clear: "清除", found: "找到 ", item: " 项",
        filter: "按类别筛选", all: "全部类别" };

  ready(function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll("[data-srow]"));
    var isHome = !!document.querySelector("h1.today");
    var nav = document.querySelector(".catnav");

    function norm(s) {
      return (s || "").toLowerCase().replace(/\s+/g, "");
    }

    /* ---- 工具条：搜索框（首页再加类别筛选） ----
       首页例外：用户 2026-09-27 明确说首页的搜索框「也拿掉，首页就只留导航 +
       说明文字」。首页后来又改回列 10 条（不分分类），行回来了、工具条也会跟着回来，
       所以这里要显式看 body 上的开关，不能只看 rows.length。 */
    var bar = null, input = null, clear = null, count = null, categoryValue = "";
    var noSearch = document.body.hasAttribute("data-nosearch");
    if (rows.length && !noSearch) {
      bar = document.createElement("div");
      bar.className = "site-tools";
      bar.innerHTML =
        '<label class="searchbox"><span aria-hidden="true">⌕</span>' +
        '<input type="search" placeholder="' + L.search + '" aria-label="' + L.search + '"></label>' +
        '<button type="button" class="clear-search" hidden>' + L.clear + '</button>' +
        '<span class="result-count" aria-live="polite"></span>';
      var anchor = nav || document.querySelector(".wrap > h1") || document.querySelector("h1");
      if (anchor) anchor.insertAdjacentElement("afterend", bar);
      else document.body.insertBefore(bar, document.body.firstChild);
      input = bar.querySelector("input");
      clear = bar.querySelector(".clear-search");
      count = bar.querySelector(".result-count");
    }

    function run() {
      if (!rows.length || !input) return;
      var q = norm(input.value), shown = 0;
      rows.forEach(function (el) {
        var catOk = !categoryValue || (el.getAttribute("data-cat") || "") === categoryValue;
        var hit = catOk && (!q || norm(el.innerText || el.textContent).indexOf(q) >= 0);
        el.hidden = !hit;
        if (hit) shown++;
      });
      clear.hidden = !q;
      count.textContent = q ? L.found + shown + L.item : "";
    }

    if (bar) {
      input.addEventListener("input", run);
      clear.addEventListener("click", function () {
        input.value = "";
        run();
        input.focus();
      });
    }

    /* ---- 首页：类别即时筛选（选项来自导航那排栏目链接，自带中文标签与篇数） ---- */
    if (isHome && bar && nav) {
      var links = Array.prototype.slice.call(nav.querySelectorAll("a[data-cat]"));
      if (links.length > 1) {
        var filter = document.createElement("select");
        filter.className = "category-filter";
        filter.setAttribute("aria-label", L.filter);
        var all = document.createElement("option");
        all.value = "";
        all.textContent = L.all;
        filter.appendChild(all);
        links.forEach(function (a) {
          var o = document.createElement("option");
          o.value = a.getAttribute("data-cat");
          o.textContent = (a.textContent || "").trim();
          filter.appendChild(o);
        });
        bar.appendChild(filter);
        filter.addEventListener("change", function () {
          categoryValue = filter.value;
          run();
        });
      }
    }

    /* 「今日快速入口」已删除（用户 2026-09-27、2026-09-28 两次要求拿掉）。

       它原来是纯 JS 动态生成的：找到 .site-tools 或 .catnav，往后面插一个
       <aside class="today-focus">。所以**即使生成器不再输出容器，只要那个
       宿主元素还在，这个区块就会自己长回来** —— 2026-09-27 用户看到的
       "5 个编号链接渲染出来是空的"，就是这么来的：容器已被删，JS 还在跑。

       连同 L.focus / L 里的 i18n 文案一起清掉。留着就是一颗定时炸弹：
       哪天 .site-tools 重新出现，区块就自己回来了。 */
    void 0;

    /* ---- 全站：阅读进度条 + 返回顶部 ---- */
    var progress = document.createElement("div");
    progress.className = "read-progress";
    /* 「顶部」有两枚，各有各的活：
       ① 站头工具条里那枚（生成器写在 HTML 上，class="tool back-top" data-tool="top"）——
          与其它控件对齐、始终可点，位置不跳；
       ② 右下角浮动钮 —— 用户 2026-09-29 追问「到顶部这个是不是要做成浮动的」。
          单篇页 1500–2800 字，手机上要划三四屏才回到站头，那排键**恰好在最需要它的时候
          够不着**。所以滚动一段后浮出来、回到上面就隐回去。
       浮动钮的图标**从工具条那枚克隆**，不另画一份：图标只有生成器一个出处，
       以后改线宽/形状两处一起变（预览脚本骗人的教训：渲染路径必须与真实来源一致）。 */
    var isHant = (document.documentElement.lang || "").toLowerCase().indexOf("hant") >= 0;
    var topLabel = isHant ? "回到頂部" : "回到顶部";
    var rowTop = document.querySelector('.toolbar [data-tool="top"]');
    if (rowTop) {
      rowTop.title = topLabel;
      rowTop.setAttribute("aria-label", topLabel);
      rowTop.addEventListener("click", toTop);
    }

    var floatTop = document.createElement("button");
    floatTop.className = "back-top back-top-float";
    floatTop.type = "button";
    floatTop.title = topLabel;
    floatTop.setAttribute("aria-label", topLabel);
    var floatIcon = rowTop && rowTop.querySelector("svg");
    if (floatIcon) floatTop.appendChild(floatIcon.cloneNode(true));
    else floatTop.textContent = "↑";        // 没有工具条的页面（老页面/404）：退回文字箭头
    floatTop.addEventListener("click", toTop);
    document.body.appendChild(progress);
    document.body.appendChild(floatTop);

    function toTop() {
      var noMotion = false;
      try { noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
      window.scrollTo({ top: 0, behavior: noMotion ? "auto" : "smooth" });
    }

    /* 两个阈值（600 出、400 回）：单阈值时手指停在临界点上，钮会一闪一闪。
       visibility 走 CSS（.back-top-float 默认透明且不可点），JS 只切一个类。 */
    var SHOW_AT = 600, HIDE_AT = 400;
    function scrollUI() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var y = window.scrollY || doc.scrollTop || 0;
      progress.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + "%";
      var on = floatTop.classList.contains("is-on");
      if (!on && y > SHOW_AT) floatTop.classList.add("is-on");
      else if (on && y < HIDE_AT) floatTop.classList.remove("is-on");
    }
    window.addEventListener("scroll", scrollUI, { passive: true });
    window.addEventListener("resize", scrollUI);
    scrollUI();
  });

  /* ---- 单篇页：分享键（零外链、零追踪） ----
   * 只用浏览器自带能力，按可用性依次退让：
   *   navigator.share（系统分享面板）→ navigator.clipboard（复制链接）
   *   → execCommand("copy") 兜底 → 还不行就提示手动复制。
   * **绝不接第三方分享服务**（AddThis/百度分享那类）：那等于把每次分享都拿去追踪，
   * 与本站「零外链、零追踪、无广告」的承诺正面冲突 —— 那正是这个站存在的理由。
   * 分享的是当前页地址（location.href）：简体页分出去还是简体页，繁体页还是繁体页。
   * 按钮标记由生成器写在站头工具条里（只有单篇页有），这里只接行为。 */
  var shareBtn = document.querySelector('.toolbar [data-tool="share"]');
  if (shareBtn) {
    var shareLabel = shareBtn.querySelector(".tool-label") || shareBtn;
    var shareIdle = shareLabel.textContent;
    var shareTimer = null;
    // 繁体页上的字面要跟着走：site-v2.js 是共享资源、**不经过 OpenCC**，
    // 写死的简体字在繁体页上会很扎眼
    var hant = (document.documentElement.getAttribute("lang") || "") === "zh-Hant";
    var MSG_COPIED = hant ? "已複製連結" : "已复制链接";
    var MSG_MANUAL = hant ? "請長按複製" : "请长按复制";
    function flash(txt) {
      shareLabel.textContent = txt;
      if (shareTimer) clearTimeout(shareTimer);
      shareTimer = setTimeout(function () { shareLabel.textContent = shareIdle; }, 1800);
    }
    function copyFallback(url) {
      try {
        var ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        var done = document.execCommand && document.execCommand("copy");
        document.body.removeChild(ta);
        flash(done ? MSG_COPIED : MSG_MANUAL);
      } catch (e) { flash(MSG_MANUAL); }
    }
    shareBtn.addEventListener("click", function () {
      var url = location.href;
      var h1 = document.querySelector("h1.art") || document.querySelector("h1");
      var title = ((h1 && h1.textContent) || document.title || "").replace(/\s+/g, " ").trim();
      if (navigator.share) {
        // 系统面板自己会给反馈；读者取消（AbortError）也不要弹错
        navigator.share({ title: title, url: url })["catch"](function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { flash(MSG_COPIED); },
                                               function () { copyFallback(url); });
        return;
      }
      copyFallback(url);
    });
  }
})();
