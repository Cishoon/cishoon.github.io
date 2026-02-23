import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    description: z.string().optional(),
    draft: z.boolean().optional().default(false),
  }),
});

const algorithm = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { posts, algorithm };
