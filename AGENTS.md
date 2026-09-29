# AGENTS.md — chinese-daily-brief (DecodeNews AI 新闻解码)

面向所有在这个仓库干活的人与 AI（Hermes、ChatGPT、Meta AI、以及发布主机上的 Merc 等）。
动手前先读这份。站点：https://yanbing2026.github.io/chinese-daily-brief/

## 这个仓库是什么（关键）
它只是**发布层（published site layer）**：AI 读英文资料后整理成中文稿的纯静态 HTML。
**内容管道和生成器不在本仓库** —— 生成器在发布主机 `/root/.hermes/scripts/`：
`brief-site-build.py`（由 `brief-publish.sh` 的每小时 cron 调用），每次整点重写下面那批文件。
**不要在本仓库重建或复制生成器**（见 `SITE_ARCHITECTURE.md` 的 production boundary）。
另有发布主机上的 agent（提交者 `Merc`）在持续开发并直推 `main`。

## 绝不手改的生成文件（改了下一次构建就没了）
`index.html`、`posts.html`、`404.html`、`posts/**`（含 `posts/index.json`）、`category/**`、
`topic/**`、`guide/**`、`tw/**`（繁体镜像整树）、`assets/cat-colors.css`、
`sitemap.xml`、`robots.txt`（两者由 `brief-site-build.py` 的 `build_sitemap()` 生成，
robots 里的 Sitemap 行与 sitemap 里的 loc 同源，手改一处就会对不上）。

**手写、可以改的**：`assets/style.css`（设计）、`assets/site-v2.js`（交互）。
改设计只动 `style.css`；版式/新栏目/分类键属于生成器的事（见 `docs/style-contract.md`）。

生成页面依赖的**挂载钩子不能删**：`[data-srow]`、`data-cat`、`.catnav a[data-cat]`、
`h1.today`、`h1.art`、以及两个共享资源（style.css + site-v2.js）。

## 校验
```bash
node scripts/validate-site.mjs        # 每个 HTML：title / viewport / 无死链 / 两个共享资源都加载（CI 自动跑）
node scripts/sv-check.js <pages>      # jsdom 跑 site-v2.js，断言控件真能挂载并筛选（本机跑）
```
CI：`.github/workflows/validate-site.yml`（push / PR to main；只校验，不部署）。

## 发布
GitHub Pages legacy，source = `main` / 根目录，`.nojekyll` 已存在，`custom_404` 开启。
仓库里没有 deploy workflow —— 合并到 `main` 即上线。

⚠️ **本仓库的 `main` 故意没有开主干保护**：发布主机的每小时构建进程直接 `git push` 到 `main`，
开了保护就会当场掐断发布。所以「禁止直推」这条在这里靠自觉执行，不靠 GitHub 强制。

## 流程
1. 开分支 → 提交 → 开 PR（**不要直推 `main`**；没有技术强制，但直推会打断发布进程的 rebase）。
2. PR 描述写清：改的是生成文件还是手写文件（生成文件要改生成器，不是改 HTML）。
