/* 站点交互：搜索、类别筛选、今日快速入口、阅读进度条、返回顶部。
 *
 * 与建站脚本的契约（**改选择器前先看 brief-site-build.py**）：
 *   [data-srow]             每一"条"可被搜索/筛选的内容行（首页卡片、栏目页/往期/常读页的 li）
 *   行上的 data-cat          该行所属栏目键（如 uscis），类别筛选直接读它
 *   .catnav a[data-cat]      栏目导航链接：既是分类页入口，也是筛选下拉的选项来源
 *   h1.today                 首页标记。只有它存在时才是首页专属功能（类别筛选、今日快速入口）
 *   article h1.art           首页卡片标题（今日快速入口取它）
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
        filter: "按類別篩選", all: "全部類別", focus: "今日快速入口" }
    : { search: "搜索本站内容…", clear: "清除", found: "找到 ", item: " 项",
        filter: "按类别筛选", all: "全部类别", focus: "今日快速入口" };

  ready(function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll("[data-srow]"));
    var isHome = !!document.querySelector("h1.today");
    var nav = document.querySelector(".catnav");

    function norm(s) {
      return (s || "").toLowerCase().replace(/\s+/g, "");
    }

    /* ---- 工具条：搜索框（首页再加类别筛选） ---- */
    var bar = null, input = null, clear = null, count = null, categoryValue = "";
    if (rows.length) {
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
      if (!rows.length) return;
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

    /* ---- 首页：今日快速入口 ---- */
    if (isHome) {
      var articles = Array.prototype.slice.call(document.querySelectorAll("article[data-srow]"));
      if (articles.length > 2) {
        var box = document.createElement("aside");
        box.className = "today-focus";
        var strong = document.createElement("strong");
        strong.textContent = L.focus;
        box.appendChild(strong);
        var ol = document.createElement("ol");
        articles.slice(0, 5).forEach(function (a, i) {
          var h = a.querySelector("h1.art");
          if (!h) return;
          if (!a.id) a.id = "article-" + i;
          var li = document.createElement("li"), link = document.createElement("a");
          link.href = "#" + a.id;
          // 标题明文来自生成标记的 data-title —— 不要从 DOM 里猜：
          // 老写法 (h.innerText||h.textContent||"").replace(/^\S+\s*/,"") 在中文标题上
          // 是灾难（标题里没有空格，贪婪的 ^\S+ 会把**整串**吃掉，链接文字变成空字符串，
          // 于是"今日快速入口"渲染出 5 个点不动的空链接）。DOM 里还可能被别的脚本注入按钮。
          link.textContent = a.getAttribute("data-title") || (h.textContent || "").trim();
          li.appendChild(link);
          ol.appendChild(li);
        });
        box.appendChild(ol);
        var host = document.querySelector(".site-tools") || nav;
        if (host) host.insertAdjacentElement("afterend", box);
      }
    }

    /* ---- 全站：阅读进度条 + 返回顶部 ---- */
    var progress = document.createElement("div");
    progress.className = "read-progress";
    var topBtn = document.createElement("button");
    topBtn.className = "back-top";
    topBtn.type = "button";
    topBtn.textContent = "↑";
    topBtn.title = "回到顶部";
    topBtn.setAttribute("aria-label", "回到顶部");
    topBtn.hidden = true;
    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(progress);
    document.body.appendChild(topBtn);

    function scrollUI() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var y = window.scrollY || doc.scrollTop || 0;
      progress.style.width = (max > 0 ? Math.min(100, (y / max) * 100) : 0) + "%";
      topBtn.hidden = y < 500;
    }
    window.addEventListener("scroll", scrollUI, { passive: true });
    window.addEventListener("resize", scrollUI);
    scrollUI();
  });
})();
