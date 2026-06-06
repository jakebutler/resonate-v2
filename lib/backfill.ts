export type ImportedPostType = "blog" | "linkedin";

export type ImportedPostSeed = {
  type: ImportedPostType;
  title?: string;
  content: string;
  externalUrl: string;
  publishedDate: string;
};

export type NormalizedImportedPost = {
  type: ImportedPostType;
  title?: string;
  content: string;
  status: "published";
  scheduledDate: string;
  externalUrl: string;
  publishedAt: number;
};

export function canonicalizeExternalUrl(value: string): string {
  const url = new URL(value.trim());
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function normalizeImportedPost(seed: ImportedPostSeed): NormalizedImportedPost {
  const content = seed.content.trim();
  const externalUrl = canonicalizeExternalUrl(seed.externalUrl);
  const publishedDate = normalizePublishedDate(seed.publishedDate);

  if (!content) {
    throw new Error(`Imported ${seed.type} post is missing content for ${externalUrl}`);
  }

  return {
    type: seed.type,
    title: normalizeOptionalText(seed.title),
    content,
    status: "published",
    scheduledDate: publishedDate,
    externalUrl,
    publishedAt: Date.parse(`${publishedDate}T00:00:00.000Z`),
  };
}

export function dedupeImportedPosts<T extends { externalUrl: string }>(posts: T[]): T[] {
  const deduped = new Map<string, T>();
  for (const post of posts) {
    deduped.set(canonicalizeExternalUrl(post.externalUrl), {
      ...post,
      externalUrl: canonicalizeExternalUrl(post.externalUrl),
    });
  }
  return [...deduped.values()];
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePublishedDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid publishedDate: ${value}`);
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid publishedDate: ${value}`);
  }

  return trimmed;
}
