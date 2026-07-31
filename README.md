# Berlin Beat

The rebuilt berlinbeat.org — an Astro site for interviews, album/show reviews, and concert photos from the Berlin music scene. Static-generated, deployed on Vercel.

## Project structure

```text
src/
  content/posts/       Markdown posts (interviews, reviews, photos) — the site's actual content
  content.config.ts     Schema for the `posts` collection
  layouts/              Layout.astro (page shell), PostLayout.astro (per-type post rendering)
  components/           Nav, Footer, PostCard, GalleryGrid, TagList, ThemeToggle, ListingPage, Pagination
  lib/posts.ts           Helpers: getAllPosts, postHref, typeLabel, formatDate, uniqueVenues, uniqueTags
  pages/                 Routes — see below
  styles/global.css      Tailwind v4 + design tokens (colors, fonts, dark/light theme)
  assets/posts/          Local images referenced by content frontmatter
scripts/migrate-wp.mjs  WordPress export -> content/posts/ migration script (see below)
```

Routes: `/`, `/interviews/`, `/reviews/`, `/photos/`, `/venues/`, `/venues/[venue]/`, `/tags/[tag]/`, `/posts/[slug]/`, `/about/`, `/contact/`, `/links/`, `/rss.xml`.

## Commands

Requires **Node 22.12+** (this repo was built and tested against Node 25 — if `node -v` shows something older, point npm at a newer install, e.g. `PATH="/opt/homebrew/bin:$PATH"` if you have Homebrew's Node installed alongside an older one).

| Command             | Action                                      |
| :------------------- | :------------------------------------------- |
| `npm install`         | Install dependencies                         |
| `npm run dev`         | Start the dev server                         |
| `npm run build`       | Build the static site to `./dist/`           |
| `npm run preview`     | Preview the production build locally         |
| `npx astro check`     | Type-check + validate content frontmatter    |

## Writing a post

Add a Markdown file to `src/content/posts/`. Frontmatter fields (see `src/content.config.ts` for the full schema):

```yaml
---
title: "Band Name — Interview"
date: 2026-08-01
type: interview # interview | review | photos
reviewType: album # album | show — required when type is "review"
band: Band Name
album: Album Title # album reviews only
venue: Venue Name # show reviews and photo posts
tags: [genre-tag]
coverImage: "../../assets/posts/your-image.jpg" # local path, or a remote https:// URL
gallery: [] # array of images (photo posts)
excerpt: "One-line summary for cards and RSS."
---

Body content in Markdown.
```

Remote images (e.g. Flickr) work directly as `coverImage`/`gallery` URLs — Flickr's CDN domains are already allow-listed in `astro.config.mjs` under `image.remotePatterns`. Add other domains there if needed.

Currently seeded with 7 sample posts (2 interviews, 2 album reviews, 1 show review, 2 photo galleries) so every page template has something to render. Replace/delete these once real content is migrated.

## Migrating content from WordPress

The old site's ~250+ posts (interviews, album/show reviews, photo galleries) live in WordPress. `scripts/migrate-wp.mjs` converts a WordPress export into this site's content format.

**1. Export from WordPress**

In WP admin: `Tools → Export → All content → Download Export File`. Save it as `scripts/wp-export.xml` (already gitignored — it won't get committed).

**2. Run the migration**

```sh
node scripts/migrate-wp.mjs scripts/wp-export.xml
```

This will:

- Map WP categories to `type`/`reviewType` (Interviews / Reviews → Album or Show / Photos)
- Convert post HTML to Markdown
- Try to pull `band`/`venue`/`album` out of the title (patterns like `"Photos: Band at Venue 01/02/03"` and `"Band – 'Album'"`)
- Carry over the featured image as `coverImage` when set
- Skip any file that already exists in `src/content/posts/` rather than overwriting it
- Print a summary, including which posts it couldn't confidently classify

**3. Manual cleanup — expect this step**

Given ~250+ posts with inconsistent historical title formatting, the script is best-effort, not 100% accurate. After running it:

- Check the posts it flagged with a `needs-review` tag and a `# TODO` comment at the top of the frontmatter — these are ones it couldn't classify or extract band/venue/album from confidently.
- Check posts it flagged as having an unresolved Flickr embed — the old site embedded Flickr galleries via plain URLs that WordPress rendered client-side, which this script can't resolve into actual image files. Add real images to `gallery` for those manually (or link out to the Flickr set, at least short-term).
- Spot-check a sample of the auto-classified posts too, not just the flagged ones.

## Deploying to Vercel

The site builds fully static (`output: 'static'` in `astro.config.mjs`), which Vercel supports with zero extra config for Astro:

1. Push this repo to GitHub.
2. In the Vercel dashboard: **Add New Project → Import** the repo. Vercel auto-detects Astro; the defaults (`npm run build`, output `dist/`) are correct — no changes needed.
3. Deploy. Every push to `main` will auto-deploy from then on.

`astro.config.mjs` sets `site: 'https://berlinbeat.org'` for the sitemap/RSS/canonical URLs — update that if the final domain differs, and point the domain at Vercel from your registrar once you're ready to cut over from the WordPress.com site.
