# Site architecture

## Current production boundary

The daily content pipeline is currently maintained outside this repository. Do not recreate or duplicate it here until the source scripts are intentionally migrated.

The repository is the published site layer:
- index.html: today's original Chinese articles
- posts.html: archive
- posts/: individual articles
- assets/: shared presentation and interaction code

## Front-end contract

Generated pages should preserve:
1. assets/style.css
2. assets/site-v2.js
3. responsive viewport metadata
4. valid local asset references
5. article anchors and semantic headings where possible

## Migration plan

When the external generator is ready to move into GitHub:
1. Import the real generator scripts without changing their behavior.
2. Separate content data from presentation templates.
3. Generate index.html, posts.html, and posts/ from templates.
4. Keep shared assets outside generated content.
5. Run node scripts/validate-site.mjs after every build.
6. Only then add GitHub Actions for scheduled publishing.

This avoids having the next content build overwrite front-end improvements.
