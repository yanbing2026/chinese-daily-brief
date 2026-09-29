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

## 五、LOGO 与站头（2026-09-29 加）

`assets/logo.svg` 是**手写资产**（和 `style.css` 同级，生成器不覆盖、只镜像到 `tw/assets/`），同时
当 favicon 用。站头品牌块由生成器写成这样，两块**整块是回首页的链接**：

```html
<a class="brand" href="{root}index.html">
  <img class="brandmark" src="{root}assets/logo.svg" alt="" width="30" height="30"><span class="brandname">DecodeNews AI 新闻解码</span>
</a>
```

三个要点，改设计时别踩：

1. **LOGO 用 `currentColor`**，所以它跟随 `--fg`（深色主题自动变浅）——`style.css` 里不要给它写死颜色。
2. `.brand` 现在是 `<a>` 不是 `<div>`：不要加下划线，要留 hover/`:focus-visible` 反馈。
3. 单篇页模板（`POST_PAGE`）是**另一份模板**，它也有这套品牌块；改站头要两个模板一起改，
   否则文章页会没有 LOGO 也没有回首页的链接（文章页另有一个 `.back` 文字链接，保留不动）。

favicon 声明在两个模板里各一行：`<link rel="icon" type="image/svg+xml" href="…/assets/logo.svg">`。
**引用不存在 = 校验报「本地引用不存在」并阻塞推送**，所以换 LOGO 文件名时要先落文件再改模板。

## 六、全局 CSS 变量（改配色从这里起步）

```css
:root { --fg:#1a1a1a; --muted:#6b7280; --bg:#fbfbfd; --card:#fff; --line:#e5e7eb; --accent:#0f766e;
  color-scheme: light; }
```

栏目颜色**不是变量**：`assets/cat-colors.css` 为每个栏目键生成 `.cat-<键>` / `.chip-<键>` 规则（含深浅档 `.v1` `.v2` 与 `html[data-theme="dark"]` 版本）。它是数据驱动的、每次构建重写，所以不要把这类规则抄进 `style.css`——栏目增删时会漂。设计上只需要知道：**栏目标签用 `.chip`，正文小标题用 `.art-meta`**。