import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export async function getAllPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.PROD ? !data.draft : true);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function postHref(post: Post): string {
  return `/posts/${post.id}/`;
}

export function typeLabel(post: Post): string {
  const { type, reviewType } = post.data;
  if (type === 'review') return reviewType === 'show' ? 'Show Review' : 'Album Review';
  if (type === 'photos') return 'Photos';
  return 'Interview';
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function uniqueTags(posts: Post[]): string[] {
  const tags = posts.flatMap((p) => p.data.tags);
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
}

// Some authors' `author` frontmatter is a raw WordPress login rather than a
// display name (no display name was ever set for that WP.com account) —
// mapped here to the friendlier names used elsewhere on the site (e.g. the
// /about/ contributor bios), same as scripts/migrate-wp.mjs's own login →
// display-name resolution at migration time.
const AUTHOR_DISPLAY_NAMES: Record<string, string> = {
  natalye: 'Natalye',
  punkrockdoll: 'Lauren',
  chloe_louise: 'Chloe Mayne',
  klirrsjourney: 'René',
};

export function authorDisplayName(author: string): string {
  return AUTHOR_DISPLAY_NAMES[author] ?? author;
}

export function authorHref(author: string): string {
  return `/authors/${slugify(author)}/`;
}
