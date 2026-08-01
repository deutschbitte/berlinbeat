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
