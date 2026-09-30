import { scheduleToUtcIso } from "./schedules";
export type PreparedItem = {
  key?: string;
  existingPostId?: string;
  channelId?: "linkedin" | "x" | "youtube" | "instagram" | "tiktok" | "reddit";
  title: string;
  contentFile: string;
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
  firstComment?: string;
  excerpt?: string;
  author?: string;
  category?: string;
  tags?: string[];
  slug?: string;
  heroFile?: string;
  coverImageAlt?: string;
  publicationIntent?: "draft" | "published";
  crop?: "centre" | "north" | "south";
};
export type PreparedManifest = {
  schemaVersion: 1;
  packageKey: string;
  brandId: "personal" | "corvo" | "lower-db" | "freshproof";
  title: string;
  entries: { key: string; article: PreparedItem; companions: PreparedItem[] }[];
};
export type UploadedPackageFile = {
  path: string;
  data: string;
  kind: "text" | "base64";
};
export type ResolvedPreparedItem = PreparedItem & {
  content: string;
  dueAt: string;
};
export function safePackagePath(path: string) {
  if (
    typeof path !== "string" ||
    path.length > 200 ||
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes(":") ||
    path.includes("\0") ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    /\.(zip|tar|gz|7z)$/i.test(path)
  )
    throw new Error(
      `file ${path}: upload plain referenced files; unsafe/archive paths are rejected.`,
    );
  return path;
}
function required(value: unknown, label: string, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label}: required text exceeds its bound or is missing.`);
}
export function parsePreparedManifest(json: string): PreparedManifest {
  if (json.length > 250000) throw new Error("manifest: exceeds 250 KB.");
  let manifest: PreparedManifest;
  try {
    manifest = JSON.parse(json);
  } catch {
    throw new Error("manifest: invalid JSON.");
  }
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    !["personal", "corvo", "lower-db", "freshproof"].includes(manifest.brandId)
  )
    throw new Error("manifest: unsupported schemaVersion or brandId.");
  required(manifest.packageKey, "packageKey", 160);
  required(manifest.title, "title", 300);
  if (
    !Array.isArray(manifest.entries) ||
    !manifest.entries.length ||
    manifest.entries.length > 100
  )
    throw new Error("entries: supply 1–100 bounded entries per package.");
  const keys = new Set<string>();
  const existingIds = new Set<string>();
  for (const entry of manifest.entries) {
    required(entry.key, "entry.key", 160);
    if (keys.has(entry.key))
      throw new Error(`${entry.key}.key: duplicate stable entry key.`);
    keys.add(entry.key);
    if (!Array.isArray(entry.companions) || entry.companions.length > 10)
      throw new Error(`${entry.key}.companions: maximum 10.`);
    const companionKeys = new Set<string>();
    for (const [index, item] of [
      entry.article,
      ...entry.companions,
    ].entries()) {
      const label = `${entry.key}.${index === 0 ? "article" : `companions[${index - 1}]`}`;
      if (!item) throw new Error(`${label}: required.`);
      required(item.title, `${label}.title`, 500);
      safePackagePath(item.contentFile);
      if (!/\.(md|mdx)$/i.test(item.contentFile))
        throw new Error(`${label}.contentFile: Markdown required.`);
      required(item.scheduledDate, `${label}.scheduledDate`);
      required(item.scheduledTime, `${label}.scheduledTime`);
      required(item.timezone, `${label}.timezone`);
      try {
        scheduleToUtcIso(item);
      } catch (error) {
        throw new Error(
          `${label}.schedule: ${error instanceof Error ? error.message : "invalid"}`,
        );
      }
      if (item.existingPostId) {
        required(item.existingPostId, `${label}.existingPostId`, 200);
        if (existingIds.has(item.existingPostId))
          throw new Error(`${label}.existingPostId: duplicate attachment.`);
        existingIds.add(item.existingPostId);
      }
      if (index === 0) {
        for (const field of [
          "excerpt",
          "author",
          "category",
          "coverImageAlt",
          "heroFile",
          "slug",
        ] as const)
          required(item[field], `${label}.${field}`);
        safePackagePath(item.heroFile!);
        if (!/\.(png|jpe?g|webp)$/i.test(item.heroFile!))
          throw new Error(`${label}.heroFile: still PNG/JPEG/WebP required.`);
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug!))
          throw new Error(`${label}.slug: URL-safe slug required.`);
        if (
          !["draft", "published"].includes(item.publicationIntent ?? "") ||
          !Array.isArray(item.tags) ||
          !item.tags.length ||
          item.tags.length > 30 ||
          item.tags.some(
            (t) => typeof t !== "string" || !t.trim() || t.length > 100,
          )
        )
          throw new Error(
            `${label}: publicationIntent and nonempty tags required.`,
          );
        if (
          item.crop !== undefined &&
          !["centre", "north", "south"].includes(item.crop)
        )
          throw new Error(`${label}.crop: unsupported.`);
      } else {
        required(item.key, `${label}.key`, 160);
        if (companionKeys.has(item.key!))
          throw new Error(`${label}.key: duplicate companion key.`);
        companionKeys.add(item.key!);
        if (
          ![
            "linkedin",
            "x",
            "youtube",
            "instagram",
            "tiktok",
            "reddit",
          ].includes(item.channelId ?? "")
        )
          throw new Error(`${label}.channelId: social channel required.`);
        if (
          item.firstComment !== undefined &&
          (item.channelId !== "linkedin" ||
            typeof item.firstComment !== "string" ||
            item.firstComment.length > 10000)
        )
          throw new Error(`${label}.firstComment: invalid.`);
      }
    }
  }
  return manifest;
}
export function resolvePreparedEntry(
  manifest: PreparedManifest,
  key: string,
  files: UploadedPackageFile[],
) {
  const entry = manifest.entries.find((e) => e.key === key);
  if (!entry) throw new Error(`${key}: entry not found.`);
  if (
    files.length > 12 ||
    new Set(files.map((f) => f.path)).size !== files.length
  )
    throw new Error(`${key}.files: duplicate or excessive files.`);
  let total = 0;
  for (const file of files) {
    safePackagePath(file.path);
    if (
      !["text", "base64"].includes(file.kind) ||
      typeof file.data !== "string"
    )
      throw new Error(`${file.path}: invalid upload.`);
    const size = new TextEncoder().encode(file.data).length;
    total += size;
    if (
      (file.kind === "text" && size > 50000) ||
      (file.kind === "base64" && size > 4000000)
    )
      throw new Error(`${file.path}: file too large.`);
  }
  if (
    total > 4400000 ||
    new TextEncoder().encode(JSON.stringify(files)).length > 4500000
  )
    throw new Error(`${key}: entry upload too large.`);
  const items = [entry.article, ...entry.companions].map((item) => {
    const file = files.find(
      (f) => f.path === item.contentFile && f.kind === "text",
    );
    if (!file || !file.data.trim())
      throw new Error(`${key}.${item.contentFile}: missing Markdown.`);
    return { ...item, content: file.data, dueAt: scheduleToUtcIso(item) };
  });
  const hero = files.find(
    (f) => f.path === entry.article.heroFile && f.kind === "base64",
  );
  if (!hero) throw new Error(`${key}.${entry.article.heroFile}: missing hero.`);
  return { entry, items, hero };
}
