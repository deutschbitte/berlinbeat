import rss from '@astrojs/rss';
import { getAllPosts, postHref, typeLabel } from '../lib/posts';

export async function GET(context) {
  const posts = await getAllPosts();

  return rss({
    title: 'Berlin Beat',
    description: 'Interviews, reviews, and photos from the Berlin music scene.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.excerpt ?? typeLabel(post),
      link: postHref(post),
      categories: post.data.tags,
      author: post.data.author,
    })),
  });
}
