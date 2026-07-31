# Project history

A running log of what's been built and decided for the berlinbeat.org rebuild, and why. Nothing in this repo is committed to git yet — this file exists so the reasoning behind decisions isn't lost (there's no commit history to fall back on).

## Origin

berlinbeat.org is a WordPress.com music journalism site (Berlin scene: interviews, album/show reviews, concert photo galleries), being rebuilt from scratch in Astro — static, self-owned, no more WordPress.

## Stack & content model

- Astro (static output) + TypeScript + Tailwind CSS v4
- Single `posts` content collection (not separate collections per type) — schema in `src/content.config.ts`. Fields: `type` (`interview` | `review` | `photos`), `reviewType` (`album` | `show`, reviews only), `band`, `album`, `venue`, `tags`, `coverImage`, `gallery`, `excerpt`, `draft`
- Venues and tags are derived from post frontmatter at build time, not separate collections
- Routes: `/`, `/interviews/`, `/reviews/`, `/photos/` (paginated), `/venues/`, `/venues/[venue]/`, `/tags/[tag]/`, `/posts/[slug]/`, `/about/`, `/contact/`, `/links/`, `/rss.xml`

## WordPress migration

`scripts/migrate-wp.mjs` converts a WXR export into `src/content/posts/*.md`. Run: `node scripts/migrate-wp.mjs scripts/wp-export.xml` (that file is gitignored).

The real export (629 posts, 6MB) was migrated on 2026-08-01. Before running it for real, the export was analyzed directly (category taxonomy, title patterns, image hosts) and the script was iterated against a dry-run scratch copy until output was clean — several real bugs were caught this way rather than after the fact:

- **Paragraph structure was silently broken.** WordPress.com stores post bodies as plain text with blank lines between paragraphs — the `<p>` markup only gets added at *render* time by `wpautop`. Without accounting for that, every article collapsed into one run-on paragraph when converted to Markdown. Fixed with a small `wpautop`-equivalent pass before HTML→Markdown conversion.
- **Title-prefix bugs.** "Show Review: ", "Album Review: ", "Photos: " prefixes were leaking into extracted `band`/`venue` values (e.g. `band: "Photos: Sebadoh"` instead of `Sebadoh`). These prefixes are also stripped from the stored title now, since the UI already shows the type as a separate label.
- **~40% of the site's ~6,000 images are permanently dead.** Early-era posts (~2011-2012) embedded photos from Picasa Web Albums, which Google shut down — those URLs now redirect to a login wall (verified directly). Later posts used Flickr's CDN, which still works, plus some self-hosted `berlinbeat.org/wp-content/uploads/...` images, which also still work. 113 migrated posts are tagged `broken-images` with a TODO comment in their frontmatter so they're easy to find later.
- **23 posts tagged `needs-review`** — mostly multi-band festival photo posts ("Feel Festival Day 1") that don't fit the "Band at Venue" title-parsing pattern, plus a couple of miscellaneous ones.
- **Venue name collisions.** Venue names come from free-text title parsing, so the same venue shows up with different capitalization/punctuation (e.g. `"About Blank"` vs `"://about blank"`) — both slugify to the same URL, which crashed the Astro build with a route conflict. Fixed by grouping venues by slug (`uniqueVenues()` in `src/lib/posts.ts`) and picking the most common spelling as canonical, rather than deduping by exact string.
- **Remote image handling had to change architecturally.** Astro's `<Image>` component fetches every remote image over the network *at build time* just to read its dimensions — with ~40% of images confirmed dead, this crashed the entire site build on the first bad link. Fixed by rendering remote images as plain `<img>` tags (`src/components/SmartImage.astro`) instead of routing them through Astro's optimization pipeline. Every place that's used already constrains images to a fixed-aspect-ratio container, so intrinsic size doesn't matter for layout.

Migration result: 629 posts (263 interviews, 46 reviews, 320 photo posts, 11 kept as WordPress drafts).

**Still open:** the 113 `broken-images` posts need manual photo replacement or removal; the 23 `needs-review` posts need manual reclassification/cleanup.

## Design iteration

The visual design went through several rounds — each one is here so the same ground doesn't get re-covered by mistake:

1. **First pass:** bold editorial look — Space Grotesk display font, large type scale, acid-green accent, dark mode default. **Rejected**: "too big and bold, not minimal/clean."
2. **Toned down:** smaller type scale, single typeface (dropped Space Grotesk), muted accent usage. **Rejected**: "don't like the colors."
3. **Went fully monochrome:** black/white/gray only, no accent hue anywhere — emphasis via underline/weight instead of color. Also stripped decorative shapes (circles/rectangles) from placeholder demo images and switched from a loaded Inter webfont to the OS's native system font stack. **Rejected as a structural direction later**, but the monochrome palette and system font itself were never specifically called out again — likely still the right call, revisit only if told otherwise.
4. **Tightened spacing:** reduced line-height, letter-spacing, and padding/margins sitewide. Applied within the still-current monochrome/system-font base.
5. **Text-forward index list:** dropped all imagery from listing pages, grouped posts by month with thin dividers (offered as one of several explicit mockup options, this one was chosen). **Rejected**: "too lowkey and text forward."
6. **Current state:** compact image cards (smaller than the original design) in a dense grid, plus a `Show: All / Interviews / Reviews / Photos` dropdown that filters client-side with no page reload (`src/components/PostBrowser.astro` + `PostCard.astro` + `PostGrid.astro`). Used on the homepage and venue/tag pages (which mix all three post types); the dedicated `/interviews/`, `/reviews/`, `/photos/` pages use the plain card grid without the dropdown since they're already single-type, and kept their pagination.

**Takeaway for future design changes:** vague feedback ("meh", "still don't like it") burned multiple rounds before landing on something workable. Presenting 3-4 concrete options (with ASCII/text mockups where possible) and asking which is closest got a decisive answer in one round every time it was tried. Prefer that over guessing again.

## Infrastructure notes

- This machine uses `asdf` for Node version management; the **global** `~/.tool-versions` pins Node 21.6.1, which Astro doesn't support. Fixed with a **project-local** `.tool-versions` pinning Node 22.17.0 (scoped to this repo only, doesn't touch the global default).
- Port 4321 (Astro's default dev port) is usually occupied by an unrelated project on this machine (`~/Desktop/coastlines`) — the berlinbeat dev server falls back to 4322. Check the terminal's own `npm run dev` output for the actual bound port rather than assuming 4321.
- Astro's dev-mode image endpoint (`/_image?...`) sends `cache-control: public, max-age=31536000` (one year) with no content-hash in the URL — editing a source image and reloading the browser normally will *not* pick up the change. Hard refresh (Cmd+Shift+R) or an incognito window is required to see image edits during development.

## Not yet done

- Nothing is committed to git yet.
- No deploy target connected (plan is Vercel, static output, zero-config — see README).
- Design may still change further; this file should get a new numbered entry under "Design iteration" if it does, rather than silently overwriting the history of what was tried.
