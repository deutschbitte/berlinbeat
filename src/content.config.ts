import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: () => {
    // No post ever uses a genuine local (co-located) image import, so this
    // is a plain string covering both remote URLs (Flickr etc.) and
    // root-relative paths into public/ — not image(), which makes Astro's
    // build-time asset pipeline try (and fail) to resolve every value here
    // as a local file relative to the content file.
    const localOrRemoteImage = z.string();

    return z
      .object({
        title: z.string(),
        date: z.coerce.date(),
        author: z.string().optional(),
        type: z.enum(['interview', 'review', 'photos']),
        reviewType: z.enum(['album', 'show']).optional(),
        band: z.string().optional(),
        album: z.string().optional(),
        venue: z.string().optional(),
        tags: z.array(z.string()).default([]),
        coverImage: localOrRemoteImage.optional(),
        coverImageAlt: z.string().optional(),
        gallery: z.array(localOrRemoteImage).default([]),
        excerpt: z.string().optional(),
        draft: z.boolean().default(false),
      })
      .refine((data) => data.type !== 'review' || data.reviewType !== undefined, {
        message: 'Posts with type "review" must set reviewType to "album" or "show".',
        path: ['reviewType'],
      });
  },
});

export const collections = { posts };
