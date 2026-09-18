import { z } from "zod";

// --- Domain enums -----------------------------------------------------------

export const articleStatusSchema = z.enum(["draft", "published"]);

// --- DTO --------------------------------------------------------------------

export const articleDtoSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  status: articleStatusSchema,
  cover_attachment_id: z.string().nullable(),
  lang: z.string().nullable(),
  // Null until the first publish; kept across unpublish/republish cycles.
  published_at: z.string().nullable(),
  // Present while the article sits in the recycle bin; null means live.
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const articleSummaryDtoSchema = articleDtoSchema.omit({ content: true });

// --- REST request schemas ---------------------------------------------------

export const createArticleSchema = z.object({
  title: z.string().trim().min(1).max(200).default(""),
  description: z.string().trim().max(500).optional(),
  content: z
    .string()
    .max(200_000, "Article content exceeds the 200KB limit.")
    .optional(),
  lang: z.string().trim().max(20).optional(),
});

export const updateArticleSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    content: z
      .string()
      .max(200_000, "Article content exceeds the 200KB limit.")
      .optional(),
    cover_attachment_id: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .nullable()
      .optional(),
    lang: z.string().trim().max(20).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field must be updated.",
  );

export const listArticlesQuerySchema = z.object({
  status: articleStatusSchema.optional(),
  // Recycle bin: include soft-deleted articles.
  include_deleted: z.coerce.boolean().default(false),
});

// Slug may be omitted: the server generates one (title transliteration with
// a random suffix fallback). Provided slugs are validated for URL safety.
export const publishArticleSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase letters, digits, and hyphens.",
    )
    .optional(),
});

// --- Types ------------------------------------------------------------------

export type ArticleStatus = z.infer<typeof articleStatusSchema>;
export type ArticleDto = z.infer<typeof articleDtoSchema>;
export type ArticleSummaryDto = z.infer<typeof articleSummaryDtoSchema>;
export type CreateArticleInput = z.input<typeof createArticleSchema>;
export type UpdateArticleInput = z.input<typeof updateArticleSchema>;
export type ListArticlesQuery = z.input<typeof listArticlesQuerySchema>;
export type PublishArticleInput = z.input<typeof publishArticleSchema>;
