# 外观契约（Muse 改设计用）

这份文档从**生成后的真实页面**里提取，不是手写描述。

## 一、你可以改的

`assets/style.css` —— **手写设计文件，生成器不会覆盖**。版式、配色、字体、间距、动效都改这里。

## 二、你不能改的（改了下一次构建就没了）

页面 HTML、`assets/cat-colors.css`（栏目颜色，数据驱动）、以及生成器本身。

## 三、必须保留的挂载钩子（这是交互层的契约，删掉就功能消失）

| 钩子 | 含义 |
| --- | --- |
| `[data-srow]` | 一条可搜索/筛选的内容行（首页是 <article>，栏目/往期/常读页是 <li>） |
| `data-cat="<键>"` | 该行的栏目键，如 uscis |
| `.catnav a[data-cat]` | 栏目导航链接，也是首页筛选下拉的选项来源 |
| `h1.today` | 只在首页出现，决定是否挂「类别筛选」 |
| `h1.art` | 首页卡片标题 |

> 「今日快速入口」已按用户要求删除（2026-09-27、09-28）。它是 JS 动态生成的，
> 曾出现"生成器删了容器、JS 还在跑"导致空链接。sv-check.js 有反向断言钉住它不许回来。
| `<span class="chip chip-<键>">` | 栏目标签；颜色来自 cat-colors.css |

## 四、各页面用到的类名（按页统计）

- **首页 index.html**（75 个类）：`art`, `art-meta`, `back`, `brand`, `c-link`, `catnav`, `chip`, `notice`, `sub`, `sub-btn`, `sub-form`, `sub-hp`, `sub-mail`, `sub-msg`, `sub-note`, `subscribe`, `today`, `top`, `v1`, `v2`, `wrap`
- **往期 posts.html**（72 个类）：`art-meta`, `back`, `brand`, `catnav`, `chip`, `sub`, `sub-btn`, `sub-form`, `sub-hp`, `sub-mail`, `sub-msg`, `sub-note`, `subscribe`, `toc`, `top`, `v1`, `v2`, `wrap`
- **栏目页 category/uscis.html**（49 个类）：`art`, `art-meta`, `back`, `brand`, `catnav`, `chip`, `cnt`, `here`, `sub`, `sub-btn`, `sub-form`, `sub-hp`, `sub-mail`, `sub-msg`, `sub-note`, `subscribe`, `toc`, `top`, `v1`, `v2`, `wrap`
- **文章页 posts/…**（23 个类）：`art`, `art-meta`, `back`, `c-body`, `c-form`, `c-head`, `c-hp`, `c-item`, `c-msg`, `c-note`, `c-report`, `comments`, `notice`, `postnav`, `sub-btn`, `sub-form`, `sub-hp`, `sub-mail`, `sub-msg`, `sub-note`, `subscribe`, `wrap`
- **常读页 guide/identity.html**（54 个类）：`art-meta`, `back`, `brand`, `catnav`, `chip`, `cnt`, `ex`, `hl`, `lead`, `note`, `sub`, `sub-btn`, `sub-form`, `sub-hp`, `sub-mail`, `sub-msg`, `sub-note`, `subscribe`, `toc`, `top`, `v1`, `v2`, `wrap`
- **繁体 tw/index.html**（75 个类）：`art`, `art-meta`, `back`, `brand`, `c-link`, `catnav`, `chip`, `notice`, `sub`, `sub-btn`, `sub-form`, `sub-hp`, `sub-mail`, `sub-msg`, `sub-note`, `subscribe`, `today`, `top`, `v1`, `v2`, `wrap`

## 五、LOGO 与站头（2026-09-29 加，当日返工一次）

`assets/logo.svg` 是**手写资产**（和 `style.css` 同级，生成器不覆盖、只镜像到 `tw/assets/`）。
站头品牌块**整块是回首页的链接**，LOGO 由生成器**内联**进 HTML（不是 `<img>`）：

```html
<a class="brand" href="{root}index.html">
  <svg class="brandmark" viewBox="0 0 24 24" aria-hidden="true">…</svg><span class="brandname">DecodeNews AI 新闻解码</span>
</a>
```

四个要点，改设计时别踩：

1. **必须内联，不能用 `<img src="logo.svg">`**。`<img>` 里的 SVG 是独立文档，页面 CSS 不级联进去，
   文件里的 `currentColor` 会解析成 SVG 自己的初始 color（黑）——浅色主题下勉强能看，
   **深色主题下整块消失**（2026-09-29 用户报的「Logo看不见」就是这个）。favicon 场景相反：
   它本来就吃不到页面 CSS，所以生成器另出一份**固定色** `assets/favicon.svg`（两个模板都用它）。
2. **站标颜色走 `--logo-ink`**（不是 `--accent`）：`--accent` 那支深青是给文字链接用的，
   当图形色偏暗。`--logo-ink` 日间 `#14b8a6`／夜间 `#5eead4`，由主题变量块切换。
3. `.brand` 现在是 `<a>` 不是 `<div>`：不要加下划线，要留 hover/`:focus-visible` 反馈。
4. 单篇页模板（`POST_PAGE`）是**另一份模板**，它也有这套品牌块 + 工具条；改站头要两个模板
   一起改，否则文章页会没有 LOGO 也没有回首页的链接（文章页另有一个 `.back` 文字链接，保留不动）。

**引用不存在的本地文件 = 校验报「本地引用不存在」并阻塞推送**（换文件名时先落文件再改模板）。

## 六、站头工具条（2026-09-29 加，同日三次扩员）

简/繁 · 字号 · 日/夜，加上只在单篇页出现的**朗读 · 分享**，加上**最左边的「回首页」**，
加上**最右的「顶部」** —— 一套**同规格线性图标**，另起一行放在分类导航下面。
图标是生成器内联进 HTML 的 SVG（24 视框 / `stroke-width: 1.75` / `currentColor` / 圆头圆角），
标记由**生成器**出、JS 只接行为 —— 别再让 JS 自己造容器（会留下「生成器删了、JS 还在跑」
的空壳；`sv-check.js` 有断言钉着）。

各页控件数（`sv-check.js` 钉着）：**首页 4**（不出「回首页」；朗读/分享是文章级的）·
**列表页 5** · **单篇页 7**。单篇页原来那行文字链接「← 回首页」**已删除**，由工具条接管。

```html
<div class="toolbar">
  <a class="tool tool-home" href="../index.html">…<span class="tool-label">首页</span></a>
  <a class="tool tool-lang" href="../tw/index.html">…<span class="tool-label">繁體</span></a>
  <button type="button" class="tool fsr" data-tool="fs">…<span class="tool-label">标准</span></button>
  <button type="button" class="tool thm" data-tool="theme">…sun…moon…<span class="tool-label">日</span></button>
  <button type="button" class="tool speak" data-tool="tts">…speak…stop…<span class="tool-label">朗读</span></button>
  <button type="button" class="tool share" data-tool="share">…<span class="tool-label">分享</span></button>
  <button type="button" class="tool back-top" data-tool="top">…<span class="tool-label">顶部</span></button>
</div>
```

契约要点：

1. **所有控件外观必须完全一致**，区别只在图标与文字 —— 这是一套规范图标的全部含义。
   不要给某一枚单独上色。选择器写成 `.toolbar .tool`（两层）：文件下半部分还有旧的
   `.fsr, .thm, .speak { … }`、`.back-top { position:fixed }` 单层规则，同权重时靠后的赢，
   只写 `.tool` 会被它们盖掉（浮动、圆角、内边距都会回旧样）。
2. **`data-tool="fs" | "theme" | "tts" | "share" | "top"` 是行为挂点**，分别由 `FS_JS` /
   `TH_JS` / `TTS_JS` / `site-v2.js` 认领；状态写进 `documentElement`，文字写进 `.tool-label`。
   改类名可以，**删属性 = 功能消失**。
3. **文字只能写进 `.tool-label`，不能 `btn.textContent = …`**：那样会把内联图标抹掉
   （朗读键最早就是这么写的，标签一改图标就没了）。
4. **日夜／朗读各只用一枚按钮、两枚图标都写在 HTML 里**，由 CSS 按 `html[data-theme]`
   和 `.speaking` 挑一枚显示（切主题/开朗读都不换 DOM）。别把图标换成 emoji ——
   字形与颜色由系统字体决定，同一排对不齐，深色下各自变样。
5. **朗读与分享只在单篇页写**（`toolbar(..., article=True)`）：列表页每行各有自己的朗读键，
   整页念没意义；分享键在列表页也说不清分享哪一条。
6. **分享键不接任何第三方分享服务**（AddThis/百度分享那类）：那等于把读者的每次分享拿去追踪，
   与全站「零外链、零追踪、无广告」的承诺正面冲突。只用浏览器自带能力，依次退让：
   `navigator.share` → `navigator.clipboard` → `execCommand("copy")` → 提示手动复制。
   分享地址取 `location.href`（简体页分出去还是简体，繁体页还是繁体）。
7. **「顶部」键不再是浮动圆钮**：`site-v2.js` 发现工具条里那枚就只接行为，不造浮动钮、
   也不按滚动隐藏（`.toolbar .back-top` 会把 `position:fixed` 那套按掉）。`.back-top`
   这个类名要留着 —— JS 靠它找元素。
8. **语言那枚是 `<a>`，href 由 `inject_switch()` 事后填**（模板渲染时 `tw/` 还没生成）。
   href 是占位 `#` 就说明注入环节漏了这一页 —— `sv-check.js` 有断言钉住它必须是 `.html`。
9. **href 一律相对路径**：繁体镜像树 `tw/` 与简体树深度结构完全相同，相对链接不改写就能
   在两边都指对；绝对路径会把繁体读者送回简体站。
10. 图标尺寸用 `rem`（字号控件靠改 `documentElement.fontSize`，写死 px 图标不跟放大）。
11. **JS 里的中文字面要跟着 `lang` 走**：`site-v2.js` 是共享资源、**不经过 OpenCC**，
    写死的简体字在繁体页上会很扎眼（`TTS_JS` 与分享键都按 `documentElement.lang` 取字面）。
12. **朗读时别把工具条念出来**：`TTS_JS` 的 `SKIP` 里有 `.toolbar, .tool`。工具条在两个模板里
    都在 `<header class="top …">` 内（`.top` 也在 SKIP 里），所以这条是双保险 —— 别把工具条
    挪到 header 外面去，那会让它变成朗读正文的一部分。

## 七、全局 CSS 变量（改配色从这里起步）

```css
:root { --fg:#1a1a1a; --muted:#6b7280; --bg:#fbfbfd; --card:#fff; --line:#e5e7eb; --accent:#0f766e;
  color-scheme: light; }
```

栏目颜色**不是变量**：`assets/cat-colors.css` 为每个栏目键生成 `.cat-<键>` / `.chip-<键>` 规则（含深浅档 `.v1` `.v2` 与 `html[data-theme="dark"]` 版本）。它是数据驱动的、每次构建重写，所以不要把这类规则抄进 `style.css`——栏目增删时会漂。设计上只需要知道：**栏目标签用 `.chip`，正文小标题用 `.art-meta`**。