# Site architecture

## Where the generator actually lives

The daily pipeline is **not** in this repository and is **not** missing — it runs on the host
that publishes this site, under `/root/.hermes/scripts/`:

| script | role |
| --- | --- |
| `write-articles.py` | reads public English material → writes original Chinese articles (also the only place that writes articles to Supabase) |
| `write-topics.py` | 多源选题：one event, many outlets → article; shares `save_article()` with the above |
| `brief-site-build.py` | **owns every generated file**: `index.html`, `posts.html`, `posts/`, `category/`, `guide/`, `assets/style.css`, and the `tw/` (traditional) mirror |
| `brief-publish.sh` | cron entry point: collect → write → build → push |
| `brief_taxonomy.py` / `brief_db.py` | single source of truth for category keys and for Supabase reads/writes |

Content data lives in Supabase (`articles`, `beats`, `comments`, `subscribers`) and is rendered
from there; JSON under `posts/index.json` is only a fallback and a gap-filler.

## Current production boundary

This repository is the **published site layer**. Do not recreate or duplicate the generator here.

The repository is the published site layer:
- index.html: today's original Chinese articles
- posts.html: archive
- posts/: individual articles
- assets/: shared presentation and interaction code

## The rule that keeps front-end work alive

**`assets/style.css` and every page file are generated. `assets/site-v2.js` is hand-maintained.**

So, in order of who owns what:

1. Page markup, all CSS, and the widget hooks → edit `brief-site-build.py` (host), never the HTML.
   Anything added straight to a generated file disappears on the next 07:00 build.
2. Interaction behaviour → edit `assets/site-v2.js` (this repo). It is not regenerated.
3. New shared assets (JS/images) → drop them in `assets/`; the build mirrors the whole directory
   into `tw/assets/` so the traditional pages resolve them too.

## Front-end contract

Interaction code (`assets/site-v2.js`) mounts itself at runtime and finds its anchors through
explicit data attributes. Generated markup must keep providing them:

| hook | meaning |
| --- | --- |
| `[data-srow]` | one searchable/filterable row (homepage card, or a `li` on category/archive/guide pages) |
| `data-cat` on that row | the row's category key, e.g. `uscis` |
| `.catnav a[data-cat]` | category nav links — also the option source for the homepage filter |
| `h1.today` | present only on the homepage (gates homepage-only features) |
| `article h1.art` | homepage card title, used by the "今日快速入口" list |

Generated pages must preserve:
1. `assets/style.css` and `assets/site-v2.js` (both stamped with a content fingerprint `?v=`)
2. a `<meta name="viewport">` and a real `<title>`
3. valid local references only — this site is intentionally 零外链 (no external links)
4. article anchors and semantic headings where possible

## Checks that run on every publish

- `node scripts/validate-site.mjs` — every HTML file: title, viewport, no broken local reference,
  and both shared assets loaded.
- `node scripts/sv-check.js <pages>` — runs `assets/site-v2.js` in jsdom against real pages and
  asserts the widgets mount and actually filter (used from the host publish script, since CI
  cannot run without a `workflow`-scoped token).

## Migration plan

Moving the generator into GitHub is optional and not currently planned. If it ever happens:
1. Import the real generator scripts without changing their behavior.
2. Separate content data from presentation templates.
3. Keep shared assets outside generated content.
4. Keep `validate-site.mjs` + `sv-check.js` as the gate.
5. Only then add GitHub Actions for scheduled publishing.
