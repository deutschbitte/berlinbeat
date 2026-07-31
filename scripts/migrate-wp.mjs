#!/usr/bin/env node
// Migrates a WordPress "All content" export (WXR) into src/content/posts/*.md.
//
// Usage:
//   node scripts/migrate-wp.mjs [path-to-export.xml]
//
// Defaults to scripts/wp-export.xml. Get the export from the WP admin:
// Tools -> Export -> All content -> Download Export File.
//
// This is a best-effort migration tuned against berlinbeat's actual export.
// It maps WP categories to our `type`/`reviewType`, strips redundant title
// prefixes ("Interview: ", "Show Review: ", etc. — redundant since we show
// the type as a separate label in the UI), pulls band/venue/album out of
// title text with regexes, and converts post HTML to Markdown.
//
// Known data quirks this accounts for:
// - Photo posts embed real <img> tags (not Flickr oEmbed shortcodes) from
//   two different eras: Flickr's CDN (still live) and Picasa Web Albums
//   (shut down by Google — those URLs now redirect to a login wall and are
//   effectively dead). Every post with a dead-host image gets a
//   `broken-images` tag so you can find and replace them.
// - Only ~4% of posts have a WP featured image set, so coverImage falls
//   back to the first image found in the post body.
// - WP status can be "draft" (not just "publish"/"trash") — non-publish
//   posts are migrated with `draft: true` rather than skipped.
//
// Anything the script can't classify confidently gets a `needs-review` tag
// and a TODO comment in the frontmatter instead of a silent guess — expect
// to hand-fix a subset of posts after running this.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';
import { dump as dumpYaml } from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'src/content/posts');

const inputPath = path.resolve(ROOT, process.argv[2] ?? 'scripts/wp-export.xml');

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

// Hosts for image services that no longer serve public images.
const DEAD_IMAGE_HOSTS = [/googleusercontent\.com/i, /picasaweb\.google\.com/i];

const TITLE_PREFIX = /^(Interview|Show Review|Album Review|EP Review|Feature|Photos)\s*:\s*/i;

const stats = {
  total: 0,
  skippedNonPost: 0,
  skippedTrash: 0,
  skippedExisting: 0,
  written: 0,
  drafts: 0,
  byType: { interview: 0, review: 0, photos: 0 },
  needsReview: [],
  brokenImages: [],
};

async function main() {
  if (!existsSync(inputPath)) {
    console.error(`Export file not found: ${inputPath}`);
    console.error('Export it from WP admin: Tools -> Export -> All content, then pass the path:');
    console.error('  node scripts/migrate-wp.mjs path/to/export.xml');
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const xml = await readFile(inputPath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (tagName) => ['item', 'category', 'wp:postmeta'].includes(tagName),
  });

  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item ?? [];
  stats.total = items.length;

  const attachmentUrls = buildAttachmentMap(items);
  const usedSlugs = new Set();

  for (const item of items) {
    if (item['wp:post_type'] !== 'post') {
      stats.skippedNonPost++;
      continue;
    }
    if (item['wp:status'] === 'trash') {
      stats.skippedTrash++;
      continue;
    }

    const post = buildPost(item, attachmentUrls);
    const slug = uniqueSlug(post.slug, usedSlugs);
    const outputPath = path.join(OUTPUT_DIR, `${slug}.md`);

    if (existsSync(outputPath)) {
      stats.skippedExisting++;
      console.warn(`Skipping "${slug}" — file already exists at ${outputPath}`);
      continue;
    }

    await writeFile(outputPath, renderMarkdownFile(post), 'utf-8');
    stats.written++;
    if (post.frontmatter.draft) stats.drafts++;
    stats.byType[post.frontmatter.type]++;
    if (post.frontmatter.tags.includes('needs-review')) stats.needsReview.push(slug);
    if (post.frontmatter.tags.includes('broken-images')) stats.brokenImages.push(slug);
  }

  printSummary();
}

function buildAttachmentMap(items) {
  const map = new Map();
  for (const item of items) {
    if (item['wp:post_type'] === 'attachment' && item['wp:post_id'] && item['wp:attachment_url']) {
      map.set(String(item['wp:post_id']), item['wp:attachment_url']);
    }
  }
  return map;
}

function buildPost(item, attachmentUrls) {
  const rawTitle = textOf(item.title) ?? 'Untitled';
  const title = rawTitle.replace(TITLE_PREFIX, '').trim() || rawTitle;

  const categories = toArray(item.category).map((c) => ({
    domain: c?.['@_domain'],
    text: textOf(c),
  }));

  const { type, reviewType, needsReview: typeNeedsReview } = classifyType(categories, title);
  const tags = categories
    .filter((c) => c.domain === 'post_tag' && c.text)
    .map((c) => c.text);

  const { band, venue, album, needsReview: titleNeedsReview } = extractFromTitle(title, type);

  const rawHtml = textOf(item['content:encoded']) ?? '';
  const strippedHtml = wpAutop(stripWpArtifacts(rawHtml));
  const imageUrls = extractImageUrls(strippedHtml);
  const hasBrokenImages = imageUrls.some((url) => DEAD_IMAGE_HOSTS.some((re) => re.test(url)));

  const thumbnailId = postMeta(item, '_thumbnail_id');
  const thumbnailUrl = thumbnailId ? attachmentUrls.get(thumbnailId) : undefined;
  const coverImage = thumbnailUrl ?? imageUrls[0];
  const coverCameFromBody = !thumbnailUrl && Boolean(imageUrls[0]);

  const isPhotoPost = type === 'photos';
  const gallery = isPhotoPost ? imageUrls : [];

  let bodyHtml = strippedHtml;
  if (isPhotoPost) {
    bodyHtml = removeImageTags(bodyHtml);
  } else if (coverCameFromBody) {
    // Avoid showing the same image twice (once as the cover, once inline).
    bodyHtml = removeFirstImageTag(bodyHtml);
  }
  const convertedBody = turndown.turndown(bodyHtml).trim();
  const body = convertedBody || (isPhotoPost ? '' : '_(no content)_');

  const excerptHtml = textOf(item['excerpt:encoded']);
  const excerpt = excerptHtml ? stripHtml(excerptHtml).slice(0, 220).trim() : undefined;

  const date = parseWpDate(item['wp:post_date']) ?? new Date();

  const needsReview = typeNeedsReview || titleNeedsReview;
  if (needsReview) tags.push('needs-review');
  if (hasBrokenImages) tags.push('broken-images');

  const isDraft = item['wp:status'] !== 'publish';

  const slugFromLink = slugFromWpLink(item.link);
  const slug = slugFromLink || slugify(title) || `post-${item['wp:post_id'] ?? Date.now()}`;

  return {
    slug,
    frontmatter: {
      title,
      date: date.toISOString().slice(0, 10),
      type,
      ...(reviewType ? { reviewType } : {}),
      ...(band ? { band } : {}),
      ...(album ? { album } : {}),
      ...(venue ? { venue } : {}),
      tags,
      ...(coverImage ? { coverImage } : {}),
      gallery,
      ...(excerpt ? { excerpt } : {}),
      draft: isDraft,
    },
    body,
  };
}

function classifyType(categories, title) {
  const names = categories.map((c) => (c.text ?? '').toLowerCase());
  const has = (re) => names.some((n) => re.test(n));

  if (has(/interview/)) return { type: 'interview', needsReview: false };

  if (has(/review/)) {
    if (has(/album/) || /^.+[–-]\s*["'“].+["'”]$/.test(title)) {
      return { type: 'review', reviewType: 'album', needsReview: false };
    }
    if (has(/show|live|gig|concert/) || /\bat\b/i.test(title)) {
      return { type: 'review', reviewType: 'show', needsReview: false };
    }
    // Category says "review" but we can't tell album vs. show — flag it.
    return { type: 'review', reviewType: 'show', needsReview: true };
  }

  if (has(/photo/) || /^photos:/i.test(title)) {
    return { type: 'photos', needsReview: false };
  }

  // No matching category (e.g. "Features", "Uncategorized") — default to
  // interview and flag for manual reclassification.
  return { type: 'interview', needsReview: true };
}

function extractFromTitle(title, type) {
  if (type === 'photos') {
    // Titles look like "Photos: Band at Venue DD/MM/YY" (prefix already
    // stripped from `title` by the time this runs).
    const m = title.match(/^(.+?)\s+at\s+(.+?)(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?\s*$/i);
    if (m) return { band: m[1].trim(), venue: m[2].trim(), needsReview: false };
    return { needsReview: true };
  }

  if (type === 'review') {
    const albumMatch = title.match(/^(.+?)\s*[–-]\s*["'“](.+?)["'”]\s*$/);
    if (albumMatch) return { band: albumMatch[1].trim(), album: albumMatch[2].trim(), needsReview: false };

    const showMatch = title.match(/^(.+?)\s+at\s+(.+?)(?:\s+\d{1,2}\/\d{1,2}\/\d{2,4})?\s*$/i);
    if (showMatch) return { band: showMatch[1].trim(), venue: showMatch[2].trim(), needsReview: false };

    return { needsReview: true };
  }

  // Interviews: title is usually just the band/subject name — leave as band.
  return { band: title, needsReview: false };
}

function stripWpArtifacts(html) {
  return html
    .replace(/\[caption[^\]]*\]/gi, '')
    .replace(/\[\/caption\]/gi, '')
    .replace(/<!--\s*more\s*-->/gi, '');
}

const BLOCK_TAG_RE = /^<(p|div|ul|ol|li|blockquote|h[1-6]|pre|table|figure|hr)[ >]/i;

// WordPress.com stores post bodies as plain text with blank lines between
// paragraphs — the actual <p>/<br> markup only gets added at render time by
// wpautop. Without this, turndown sees no paragraph boundaries at all and
// collapses a whole article into one run-on line. This is a simplified
// reimplementation: blank-line-separated chunks become <p> tags (with
// single newlines inside a chunk becoming <br />), unless a chunk already
// starts with its own block-level tag.
function wpAutop(html) {
  const normalized = html.replace(/\r\n|\r/g, '\n').trim();
  if (!normalized) return '';
  return normalized
    .split(/\n{2,}/)
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return '';
      if (BLOCK_TAG_RE.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br />\n')}</p>`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function extractImageUrls(html) {
  const urls = [];
  const seen = new Set();
  for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
    const url = match[1];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

function removeImageTags(html) {
  return html
    .replace(/<a[^>]*>\s*<img[^>]*>\s*<\/a>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '');
}

function removeFirstImageTag(html) {
  const wrapped = /<a[^>]*>\s*<img[^>]*>\s*<\/a>/i;
  const result = wrapped.test(html) ? html.replace(wrapped, '') : html.replace(/<img[^>]*>/i, '');
  return result.replace(/<p>\s*<\/p>/gi, '');
}

function postMeta(item, key) {
  const entries = toArray(item['wp:postmeta']);
  const match = entries.find((entry) => textOf(entry['wp:meta_key']) === key);
  return match ? textOf(match['wp:meta_value']) : undefined;
}

function parseWpDate(value) {
  if (!value || value === '0000-00-00 00:00:00') return null;
  const iso = value.replace(' ', 'T');
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function slugFromWpLink(link) {
  if (!link) return null;
  try {
    const { pathname } = new URL(link);
    const segments = pathname.split('/').filter(Boolean);
    return segments.length ? slugify(segments[segments.length - 1]) : null;
  } catch {
    return null;
  }
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function uniqueSlug(base, used) {
  let slug = base;
  let i = 2;
  while (used.has(slug)) {
    slug = `${base}-${i}`;
    i++;
  }
  used.add(slug);
  return slug;
}

function textOf(node) {
  if (node == null) return undefined;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in node) return String(node['#text']);
  return undefined;
}

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderMarkdownFile(post) {
  const frontmatter = dumpYaml(post.frontmatter, { lineWidth: -1 }).trim();
  const todo = post.frontmatter.tags.includes('needs-review')
    ? '# TODO: could not confidently classify this post from its WP category/title — check type, reviewType, band, venue, album.\n'
    : '';
  const brokenNote = post.frontmatter.tags.includes('broken-images')
    ? '# TODO: this post links image(s) hosted on Picasa Web Albums, which Google shut down — those images are dead. Replace coverImage/gallery/inline images.\n'
    : '';
  return `---\n${todo}${brokenNote}${frontmatter}\n---\n\n${post.body}\n`;
}

function printSummary() {
  console.log('\nMigration complete.');
  console.log(`  Total items in export: ${stats.total}`);
  console.log(`  Skipped (not a post):  ${stats.skippedNonPost}`);
  console.log(`  Skipped (trashed):     ${stats.skippedTrash}`);
  console.log(`  Skipped (already existed): ${stats.skippedExisting || 0}`);
  console.log(`  Written:               ${stats.written}`);
  console.log(`    interviews: ${stats.byType.interview}`);
  console.log(`    reviews:    ${stats.byType.review}`);
  console.log(`    photos:     ${stats.byType.photos}`);
  console.log(`    drafts (non-publish, written with draft: true): ${stats.drafts}`);
  if (stats.needsReview.length) {
    console.log(`\n  ${stats.needsReview.length} post(s) flagged needs-review (uncertain classification):`);
    stats.needsReview.slice(0, 20).forEach((s) => console.log(`    - ${s}`));
    if (stats.needsReview.length > 20) console.log(`    ...and ${stats.needsReview.length - 20} more`);
  }
  if (stats.brokenImages.length) {
    console.log(`\n  ${stats.brokenImages.length} post(s) flagged broken-images (dead Picasa-hosted photos):`);
    stats.brokenImages.slice(0, 20).forEach((s) => console.log(`    - ${s}`));
    if (stats.brokenImages.length > 20) console.log(`    ...and ${stats.brokenImages.length - 20} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
