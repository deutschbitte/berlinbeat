import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: ({ image }) => {
    const localOrRemoteImage = z.union([image(), z.string().url()]);

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
