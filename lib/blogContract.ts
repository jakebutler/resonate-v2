/** Editorial version excludes scheduling (ADR 0002). No implicit legacy approval. */
export type BlogEditorialPost = {
  title: string; content: string; channelId: string;
  blogExcerpt?: string; blogAuthor?: string; blogCategory?: string;
  blogTags?: string[]; blogSlug?: string;
  blogPublicationIntent?: "draft" | "published"; coverImageAlt?: string;
  preparedHero?: {sourceStorageId: string; storageId: string; sha256: string; crop: string; width: number; height: number; byteLength: number; mimeType: string};
  heroImageStorageId?: string; heroImageUrl?: string; platformSettings?: unknown;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,canonical(item)]));
  return value;
}

export function blogEditorialFingerprint(post: BlogEditorialPost): string {
  return JSON.stringify(canonical({
    version: 1, title: post.title, content: post.content,
    excerpt: post.blogExcerpt ?? null, author: post.blogAuthor ?? null,
    category: post.blogCategory ?? null, tags: post.blogTags ?? [],
    slug: post.blogSlug ?? null, publicationIntent: post.blogPublicationIntent ?? null,
    coverImageAlt: post.coverImageAlt ?? null,
    heroIdentity: post.heroImageStorageId ?? post.heroImageUrl ?? null,
    preparedHero: post.preparedHero ?? null,
    platformSettings: post.platformSettings ?? null,
  }));
}

export function missingBlogEditorialFields(post: BlogEditorialPost): string[] {
  const missing: string[] = [];
  for (const [label, value] of [
    ["title", post.title], ["content", post.content], ["excerpt", post.blogExcerpt],
    ["author", post.blogAuthor], ["category", post.blogCategory],
    ["cover alt text", post.coverImageAlt], ["publication intent", post.blogPublicationIntent],
  ]) if (!value?.trim()) missing.push(label!);
  if (!post.blogTags?.length || post.blogTags.some(tag => !tag.trim())) missing.push("tags");
  if (!post.heroImageStorageId && !post.heroImageUrl?.trim()) missing.push("hero image");
  if (post.blogSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.blogSlug)) missing.push("URL-safe slug");
  if (!post.preparedHero || post.preparedHero.sourceStorageId !== post.heroImageStorageId || post.preparedHero.byteLength >= 150_000) missing.push("reviewed prepared hero");
  return missing;
}

export function blogExportPreview(post: BlogEditorialPost & {
  scheduledDate?: string; scheduledTime?: string; timezone?: string;
}) {
  const slug = post.blogSlug || post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    filename: `${post.scheduledDate ?? "DATE-REQUIRED"}-${slug}.mdx`,
    publicationIntent: post.blogPublicationIntent ?? "review required",
    date: post.scheduledDate ?? "required", time: post.scheduledTime ?? "required",
    timezone: post.timezone ?? "required", coverImageAlt: post.coverImageAlt ?? "required",
    excerpt: post.blogExcerpt, author: post.blogAuthor, category: post.blogCategory,
    preparedHero: post.preparedHero,
    tags: post.blogTags ?? [], heroIdentity: post.heroImageStorageId ?? post.heroImageUrl,
  };
}
