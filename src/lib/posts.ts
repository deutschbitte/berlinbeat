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

// Venue names come from free-text title parsing, so the same venue can show
// up with different capitalization/punctuation (e.g. "About Blank" vs.
// "://about blank"). Group by slug and pick the most common exact spelling
// as the canonical display name, so those variants collapse into one venue
// page instead of colliding on the same URL.
export function uniqueVenues(posts: Post[]): string[] {
  const countsBySlug = new Map<string, Map<string, number>>();

  for (const post of posts) {
    const venue = post.data.venue;
    if (!venue) continue;
    const slug = slugify(venue);
    const variants = countsBySlug.get(slug) ?? new Map<string, number>();
    variants.set(venue, (variants.get(venue) ?? 0) + 1);
    countsBySlug.set(slug, variants);
  }

  const canonicalNames = [...countsBySlug.values()].map((variants) => {
    return [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
  });

  return canonicalNames.sort((a, b) => a.localeCompare(b));
}

export function uniqueTags(posts: Post[]): string[] {
  const tags = posts.flatMap((p) => p.data.tags);
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
}
