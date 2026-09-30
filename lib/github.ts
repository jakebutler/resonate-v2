import { createHash } from "node:crypto";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const REPO_OWNER = process.env.BLOG_REPO_OWNER || "jakebutler";
const REPO_NAME = process.env.BLOG_REPO_NAME || "corvo-labs-dot-com";
const BLOG_APP_ROOT = process.env.BLOG_APP_ROOT || "corvo-labs-enhanced";
const CONTENT_PATH =
  process.env.BLOG_CONTENT_PATH || `${BLOG_APP_ROOT}/content/blog`;
const DEFAULT_AUTHOR = process.env.BLOG_POST_AUTHOR?.trim() || "Jake Butler";
const DEFAULT_CATEGORY = process.env.BLOG_DEFAULT_CATEGORY?.trim() || "strategy";

export function blogDestination(post: { title: string; blogSlug?: string; scheduledDate?: string; blogArtifact?: BlogArtifact }) {
  if (post.blogArtifact) return {repository: post.blogArtifact.repository, filePath: post.blogArtifact.mdxPath, canonicalUrl: post.blogArtifact.canonicalUrl};
  const slug = post.blogSlug || slugify(post.title);
  return { repository: `${REPO_OWNER}/${REPO_NAME}`,
    filePath: `${CONTENT_PATH}/${post.scheduledDate ?? "DATE-REQUIRED"}-${slug}.mdx` };
}

export type BlogArtifact = { repository: string; prNumber: number; branchName: string; mdxPath: string; heroPath?: string; canonicalUrl: string };

export interface PublishImageAsset {
  sourceUrl: string;
  alt?: string;
  isCover?: boolean;
}

export class BlogPostContractError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      `Blog post fails the corvo-labs-dot-com MDX contract:\n- ${issues.join(
        "\n- "
      )}`
    );
    this.name = "BlogPostContractError";
    this.issues = issues;
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeYamlString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^[#>\-\*\d.\s]+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateReadTime(markdown: string): string {
  const plainText = stripMarkdown(markdown);
  const words = plainText ? plainText.split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
}

// Corvo aliases `description` to `excerpt`, but <=160 chars keeps the value
// viable as the <meta name="description"> too. Keep a small safety margin.
function buildDescription(markdown: string, explicit?: string): string {
  if (explicit !== undefined) return explicit;

  const firstParagraph = markdown
    .split(/\n{2,}/)
    .map((chunk) => stripMarkdown(chunk))
    .find(Boolean);

  return clampText(firstParagraph || "Published via Resonate.", 160);
}

/** Image URL placeholder alt regex — slug-shaped like hero_image or asset12_. */
const SLUG_ALT_PATTERN = /^!\[(hero_image|asset\d+[_-]?|image\d+|figure\d+)/i;

/** Image glued to following non-whitespace content on the same line. */
const IMAGE_GLUED_TO_NEXT_BLOCK_PATTERN = /^!\[[^\]]*]\([^)]+\)\S/;

/** Well-formed markdown image occupying the entire line. */
const STANDALONE_IMAGE_LINE_PATTERN = /^!\[[^\]]*]\([^)]+\)\s*$/;

/** Any H1 markdown heading. Corvo renders the title from frontmatter. */
const BODY_H1_PATTERN = /^# [^#]/;

interface NormalizeBodyParams {
  content: string;
  heroImageUrl: string;
  imagesBySourceUrl: Map<string, PublishImageAsset>;
}

/**
 * Rewrite the raw editor content so it satisfies the corvo-labs-dot-com
 * contract. This runs before validation so common issues (H1 that duplicates
 * the title, hero image inlined in the body, images glued to the next block,
 * slug-shaped alt text) are fixed rather than rejected when we can recover
 * automatically.
 */
export function normalizeMdxBody(params: NormalizeBodyParams): string {
  const { content, heroImageUrl, imagesBySourceUrl } = params;
  let body = content.replace(/\r\n/g, "\n");

  // 1. Drop any H1 headings in the body — the title comes from frontmatter.
  body = body
    .split("\n")
    .filter((line) => !BODY_H1_PATTERN.test(line))
    .join("\n");

  // 2. Split image-glued-to-text ("![alt](url)Trailing" → two lines).
  body = body.replace(
    /^(!\[[^\]]*]\([^)]+\))(\S.*)$/gm,
    "$1\n\n$2"
  );

  // 3. Rewrite alt text for every known asset so slug placeholders like
  //    `![hero_image](url)` become the descriptive alt from the image payload.
  body = body.replace(
    /!\[([^\]]*)]\(([^)]+)\)/g,
    (match, origAlt: string, rawUrl: string) => {
      const url = rawUrl.trim().replace(/^<|>$/g, "");
      const asset = imagesBySourceUrl.get(url);
      if (!asset?.alt?.trim()) return match;
      return `![${asset.alt.trim()}](${url})`;
    }
  );

  // 4. Remove the first occurrence of the hero image inside the body's leading
  //    region so it isn't duplicated with the frontmatter hero render.
  if (heroImageUrl) {
    const heroLinePattern = new RegExp(
      `^!\\[[^\\]]*]\\(${escapeRegExp(heroImageUrl)}\\)\\s*$`
    );
    const lines = body.split("\n");
    const scanLimit = Math.min(lines.length, 8);
    for (let i = 0; i < scanLimit; i++) {
      if (heroLinePattern.test(lines[i])) {
        lines.splice(i, 1);
        while (i < lines.length && lines[i].trim() === "") {
          lines.splice(i, 1);
        }
        break;
      }
    }
    body = lines.join("\n");
  }

  // 5. Ensure a blank line follows every standalone image so the next block
  //    (heading, paragraph, list) is parsed as block-level.
  const lines = body.split("\n");
  const normalized: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    normalized.push(lines[i]);
    if (
      STANDALONE_IMAGE_LINE_PATTERN.test(lines[i]) &&
      i + 1 < lines.length &&
      lines[i + 1].trim() !== ""
    ) {
      normalized.push("");
    }
  }

  // 6. Collapse 3+ consecutive blank lines down to a single blank separator.
  const collapsed: string[] = [];
  let blankStreak = 0;
  for (const line of normalized) {
    if (line.trim() === "") {
      blankStreak += 1;
      if (blankStreak <= 1) collapsed.push("");
    } else {
      blankStreak = 0;
      collapsed.push(line);
    }
  }

  return collapsed.join("\n").replace(/^\n+/, "").trimEnd() + "\n";
}

interface ValidationFrontmatter {
  title: string;
  date: string;
  heroImage: string;
  heroImageAlt: string;
  description: string;
  tags: string[];
}

interface ValidateParams {
  frontmatter: ValidationFrontmatter;
  body: string;
  heroImageUrl: string;
}

/**
 * Enforce the corvo-labs-dot-com publishing contract before we touch GitHub.
 * Throws a {@link BlogPostContractError} listing every violation so the
 * publisher surfaces all issues in a single round-trip.
 */
export function validateMdxPost(params: ValidateParams): void {
  const issues: string[] = [];
  const { frontmatter, body, heroImageUrl } = params;

  if (!frontmatter.title?.trim()) issues.push("Frontmatter `title` is required.");
  if (!frontmatter.date?.trim()) issues.push("Frontmatter `date` is required.");
  if (!frontmatter.heroImage?.trim()) {
    issues.push("Frontmatter `heroImage` is required.");
  }
  if (!frontmatter.heroImageAlt?.trim()) {
    issues.push(
      "Frontmatter `heroImageAlt` is required for accessibility and SEO."
    );
  }
  if (!frontmatter.description?.trim()) {
    issues.push("Frontmatter `description` is required.");
  }
  if (!frontmatter.tags || frontmatter.tags.length === 0) {
    issues.push("Frontmatter `tags` must contain at least one tag.");
  }

  const lines = body.split("\n");
  const nonBlankLines: Array<{ line: string; index: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "") {
      nonBlankLines.push({ line: lines[i], index: i });
    }
  }

  if (heroImageUrl) {
    const heroLinePattern = new RegExp(
      `!\\[[^\\]]*]\\(${escapeRegExp(heroImageUrl)}\\)`
    );
    const leading = nonBlankLines.slice(0, 5);
    for (const { line, index } of leading) {
      if (heroLinePattern.test(line)) {
        issues.push(
          `Line ${index + 1} duplicates the hero image URL in the body; remove the in-body copy.`
        );
        break;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (IMAGE_GLUED_TO_NEXT_BLOCK_PATTERN.test(lines[i])) {
      issues.push(
        `Line ${i + 1} has text glued onto an image; insert a blank line after the image.`
      );
    }
    if (SLUG_ALT_PATTERN.test(lines[i])) {
      issues.push(
        `Line ${i + 1} uses a slug as alt text; replace with a descriptive caption.`
      );
    }
    if (BODY_H1_PATTERN.test(lines[i])) {
      issues.push(
        `Line ${i + 1} contains an H1 heading; the title already comes from frontmatter.`
      );
    }
  }

  if (issues.length > 0) {
    throw new BlogPostContractError(issues);
  }
}

interface BuildFrontmatterParams {
  title: string;
  date: string;
  scheduledTime?: string;
  timezone?: string;
  subtitle?: string;
  description: string;
  author: string;
  tags: string[];
  heroImage: string;
  heroImageAlt: string;
  readTime: string;
  category: string;
  featured: boolean;
  status: string;
}

export function buildFrontmatter(params: BuildFrontmatterParams): string {
  const lines = [
    `---`,
    `title: "${escapeYamlString(params.title)}"`,
    `date: "${escapeYamlString(params.date)}"`,
  ];
  if (params.scheduledTime?.trim()) {
    lines.push(`scheduledTime: "${escapeYamlString(params.scheduledTime.trim())}"`);
  }
  if (params.timezone?.trim()) {
    lines.push(`timezone: "${escapeYamlString(params.timezone.trim())}"`);
  }
  if (params.subtitle?.trim()) {
    lines.push(`subtitle: "${escapeYamlString(params.subtitle.trim())}"`);
  }
  lines.push(`description: "${escapeYamlString(params.description)}"`);
  lines.push(`author: "${escapeYamlString(params.author)}"`);
  if (params.tags.length > 0) {
    lines.push(
      `tags: [${params.tags.map((tag) => `"${escapeYamlString(tag)}"`).join(", ")}]`
    );
  } else {
    lines.push(`tags: []`);
  }
  lines.push(`coverImage: "${escapeYamlString(params.heroImage)}"`);
  lines.push(`coverImageAlt: "${escapeYamlString(params.heroImageAlt)}"`);
  lines.push(`readTime: "${escapeYamlString(params.readTime)}"`);
  lines.push(`category: "${escapeYamlString(params.category)}"`);
  lines.push(`featured: ${params.featured ? "true" : "false"}`);
  lines.push(`status: "${escapeYamlString(params.status)}"`);
  lines.push(`---`, ``);
  return lines.join("\n") + "\n";
}

export async function createBlogPostPR(params: {
  title: string;
  content: string;
  scheduledDate: string;
  scheduledTime?: string;
  timezone?: string;
  scheduleTrigger?: "frontmatter" | "pr-body";
  status: string;
  subtitle?: string;
  excerpt?: string;
  author?: string;
  tags?: string[];
  category?: string;
  slug?: string;
  featured?: boolean;
  coverImageAlt?: string;
  images?: PublishImageAsset[];
  preparedHero?: {bytes: Buffer; sha256: string};
  exportIdentity?: string;
  beforeRemoteWrite?: () => Promise<void>;
}): Promise<{
  prUrl: string;
  branchName: string;
  sanitizedResponse: {
    artifact?: BlogArtifact;
    repo: string;
    prUrl: string;
    branchName: string;
    number?: number;
    state?: string;
    scheduleTrigger: "frontmatter" | "pr-body";
    scheduledDate: string;
    scheduledTime?: string;
    timezone?: string;
  };
}> {
  if (!GITHUB_TOKEN) {
    throw new Error("Missing required environment variable: GITHUB_TOKEN");
  }

  // Validate up front so we never create a remote branch that can't be
  // completed — callers must supply at least one image so we have a hero
  // for the frontmatter and card thumbnail.
  const images = params.images ?? [];
  const hero = images.find((asset) => asset.isCover) ?? images[0];
  if (!hero) {
    throw new Error(
      "Publishing requires at least one image so the PR can set heroImage in frontmatter."
    );
  }

  const date = params.scheduledDate || new Date().toISOString().split("T")[0];
  const scheduledTime = params.scheduledTime?.trim() || undefined;
  const timezone = params.timezone?.trim() || undefined;
  const scheduleTrigger = params.scheduleTrigger ?? "pr-body";
  const slugBase = params.slug?.trim() || slugify(params.title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugBase) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BlogPostContractError(["Unsafe article slug or date"]);
  if (!["draft", "published"].includes(params.status)) throw new BlogPostContractError(["Choose draft or published publication intent"]);
  const slug = `${date}-${slugBase}`;
  const fileName = `${slug}.mdx`;
  const filePath = `${CONTENT_PATH}/${fileName}`;
  const identity = params.exportIdentity ? `-${createHash("sha256").update(params.exportIdentity).digest("hex").slice(0, 12)}` : "";
  const branchName = `resonate/blog-post-${slug}${identity}`;
  const heroPath = `${BLOG_APP_ROOT}/public/images/blog/${slug}/hero.webp`;
  const publicHeroPath = `/images/blog/${slug}/hero.webp`;


  // The approved prose is immutable; surface invalid MDX for an explicit edit.
  const body = params.content;

  const heroImageAlt =
    params.coverImageAlt ||
    hero.alt?.trim() ||
    `Cover image for ${params.title}`;

  const frontmatterInput: BuildFrontmatterParams = {
    title: params.title,
    date,
    scheduledTime,
    timezone,
    subtitle: params.subtitle,
    description: buildDescription(params.content, params.excerpt),
    author: params.author ?? DEFAULT_AUTHOR,
    tags: params.tags ?? [],
    heroImage: publicHeroPath,
    heroImageAlt,
    readTime: estimateReadTime(params.content),
    category: params.category ?? DEFAULT_CATEGORY,
    featured: params.featured ?? false,
    status: params.status,
  };

  // Contract check before we touch GitHub so a single round trip surfaces
  // every violation to the caller.
  validateMdxPost({
    frontmatter: {
      title: frontmatterInput.title,
      date: frontmatterInput.date,
      heroImage: frontmatterInput.heroImage,
      heroImageAlt: frontmatterInput.heroImageAlt,
      description: frontmatterInput.description,
      tags: frontmatterInput.tags,
    },
    body,
    heroImageUrl: hero.sourceUrl,
  });

  const frontmatter = buildFrontmatter(frontmatterInput);
  const mdxBytes = Buffer.from(frontmatter + body);
  const prepared = params.preparedHero;
  if (!prepared || prepared.bytes.byteLength >= 150_000 || createHash("sha256").update(prepared.bytes).digest("hex") !== prepared.sha256) throw new BlogPostContractError(["A verified prepared hero is required"]);
  // Validate actual bytes, independently of the storage receipt.
  const {default: sharp} = await import("sharp");
  const metadata = await sharp(prepared.bytes, {limitInputPixels: 40_000_000}).metadata();
  if (metadata.format !== "webp" || metadata.width !== 1600 || metadata.height !== 900) throw new BlogPostContractError(["Hero must decode as 1600×900 WebP"]);
  const files = [{path: filePath, bytes: mdxBytes}, {path: heroPath, bytes: prepared.bytes}];
  await params.beforeRemoteWrite?.();
  const headers = githubHeaders();
  const base = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  async function read(path: string) {
    const res = await fetch(`${base}${path}`, {headers});
    if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
    return res.json();
  }
  const repo = await read("");
  const defaultBranch = repo.default_branch;
  const defaultRef = await read(`/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
  let refRes = await fetch(`${base}/git/ref/heads/${encodeURIComponent(branchName)}`, {headers});
  if (refRes.status === 404) {
    const created = await fetch(`${base}/git/refs`, {method: "POST", headers, body: JSON.stringify({ref: `refs/heads/${branchName}`, sha: defaultRef.object.sha})});
    if (!created.ok) throw new Error("Branch creation not confirmed; reconcile this export before retry.");
    refRes = await fetch(`${base}/git/ref/heads/${encodeURIComponent(branchName)}`, {headers});
  }
  if (!refRes.ok) throw new Error("Export branch unavailable");
  const ref = await refRes.json();
  const head = ref.object.sha;
  let existing = 0;
  for (const file of files) {
    const res = await fetch(`${base}/contents/${file.path}?ref=${encodeURIComponent(head)}`, {headers});
    if (res.status === 404) continue;
    if (!res.ok) throw new Error("Cannot reconcile export contents");
    const remote = await res.json();
    if (remote.encoding !== "base64" || !remote.content || !Buffer.from(remote.content.replace(/\s/g, ""), "base64").equals(file.bytes)) throw new Error("Remote artifact differs; Needs Review. No overwrite performed.");
    existing++;
  }
  if (existing === 0 && head === defaultRef.object.sha) {
    await commitGithubFiles({branchName, expectedHead: head, message: `feat: add article and reviewed hero`, files});
  } else if (existing !== 2) throw new Error("Incomplete or unrelated export branch; Needs Review");
  else {
    const diff = await read(`/compare/${encodeURIComponent(defaultRef.object.sha)}...${encodeURIComponent(head)}`);
    const expected = new Set(files.map(f => f.path));
    if (!["ahead", "diverged"].includes(diff.status) || !Number.isSafeInteger(diff.ahead_by) || diff.ahead_by < 1 || !Number.isSafeInteger(diff.total_commits) || diff.total_commits < 1 || diff.total_commits > 250 || !Array.isArray(diff.files) || diff.files.length !== 2 || diff.files.some((f: {filename: string; status: string}) => !expected.has(f.filename) || !["added", "modified"].includes(f.status)))
      throw new Error("Incomplete or unrelated export branch diff; Needs Review");
  }
  const existingPrs = await read(`/pulls?state=all&head=${encodeURIComponent(`${REPO_OWNER}:${branchName}`)}&base=${encodeURIComponent(defaultBranch)}`);
  if (!Array.isArray(existingPrs) || existingPrs.length > 1 || existingPrs.some(pr => pr.state !== "open")) throw new Error("Export PR history requires review");
  let pr = existingPrs[0];
  if (!pr) {
    const res = await fetch(`${base}/pulls`, {method: "POST", headers, body: JSON.stringify({
      title: `Blog post: ${params.title}`, head: branchName, base: defaultBranch,
      body: [
        `Publication intent: ${params.status}. Published content becomes visible on merge, including future-dated articles.`,
        `<!-- resonate-schedule -->\nResonate schedule: ${date} ${scheduledTime ?? ""} ${timezone ?? ""}.\n<!-- /resonate-schedule -->`,
        "Article and reviewed hero are committed together. Resonate does not auto-merge.",
      ].join("\n"),
    })});
    if (!res.ok) throw new Error("PR creation not confirmed; reconcile this export before retry");
    pr = await res.json();
  }
  if (!pr.html_url || !pr.number) throw new Error("Incomplete GitHub PR receipt; Needs Review");
  return {prUrl: pr.html_url, branchName, sanitizedResponse: {
    repo: `${REPO_OWNER}/${REPO_NAME}`, prUrl: pr.html_url, branchName, number: pr.number, state: pr.state,
    scheduleTrigger, scheduledDate: date, scheduledTime, timezone,
    artifact: {repository: `${REPO_OWNER}/${REPO_NAME}`, prNumber: pr.number, branchName,
      mdxPath: filePath, heroPath, canonicalUrl: `${process.env.BLOG_SITE_ORIGIN || "https://corvolabs.com"}/blog/${slug}`},
  }};
}

function githubHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function upsertQuotedYamlField(frontmatter: string, key: string, value: string): string {
  const line = `${key}: "${escapeYamlString(value)}"`;
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*.*$`, "m");
  if (pattern.test(frontmatter)) return frontmatter.replace(pattern, line);
  return `${frontmatter.trimEnd()}\n${line}`;
}

function removeYamlField(frontmatter: string, key: string): string {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*.*\\n?`, "m");
  return frontmatter.replace(pattern, "").replace(/\n{3,}/g, "\n\n");
}

export function patchFrontmatterSchedule(
  mdxContent: string,
  params: { scheduledDate: string; scheduledTime?: string; timezone?: string }
): string {
  const match = mdxContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("MDX file missing YAML frontmatter.");
  let frontmatter = match[1];
  const body = match[2];
  frontmatter = upsertQuotedYamlField(frontmatter, "date", params.scheduledDate);
  if (params.scheduledTime?.trim()) {
    frontmatter = upsertQuotedYamlField(frontmatter, "scheduledTime", params.scheduledTime.trim());
  } else {
    frontmatter = removeYamlField(frontmatter, "scheduledTime");
  }
  if (params.timezone?.trim()) {
    frontmatter = upsertQuotedYamlField(frontmatter, "timezone", params.timezone.trim());
  } else {
    frontmatter = removeYamlField(frontmatter, "timezone");
  }
  return `---\n${frontmatter.trimEnd()}\n---\n${body}`;
}

export type UpdatePrFrontmatterFailureReason =
  | "pr-closed" | "pr-not-found" | "branch-missing" | "file-missing"
  | "identity-mismatch" | "ambiguous-artifact" | "head-conflict";
export type UpdatePrFrontmatterResult =
  | { ok: true; filePath: string; artifact: BlogArtifact }
  | { ok: false; reason: UpdatePrFrontmatterFailureReason };

function parsePullNumber(prUrl: string): number | null {
  const match = prUrl.match(new RegExp(`^https://github\\.com/${REPO_OWNER}/${REPO_NAME}/pull/(\\d+)/?$`));
  return match ? Number(match[1]) : null;
}

export async function updatePrFrontmatter(params: {
  branchName: string; prUrl: string; scheduledDate: string;
  scheduledTime?: string; timezone?: string;
  artifact?: BlogArtifact; expectedTitle?: string; expectedSlug?: string;
}): Promise<UpdatePrFrontmatterResult> {
  if (!GITHUB_TOKEN) throw new Error("Missing required environment variable: GITHUB_TOKEN");
  const repo = `${REPO_OWNER}/${REPO_NAME}`;
  const base = `https://api.github.com/repos/${repo}`;
  const headers = githubHeaders();
  const pullNumber = parsePullNumber(params.prUrl);
  if (!pullNumber) return {ok: false, reason: "pr-not-found"};
  if (params.artifact && (params.artifact.repository !== repo || params.artifact.prNumber !== pullNumber || params.artifact.branchName !== params.branchName)) return {ok: false, reason: "identity-mismatch"};
  const prRes = await fetch(`${base}/pulls/${pullNumber}`, {headers});
  if (!prRes.ok) return {ok: false, reason: "pr-not-found"};
  const pr = await prRes.json();
  if (pr.state !== "open" || pr.merged) return {ok: false, reason: "pr-closed"};
  if (pr.head?.ref !== params.branchName || pr.head?.repo?.full_name !== repo || pr.base?.repo?.full_name !== repo || !pr.head?.sha) return {ok: false, reason: "identity-mismatch"};
  const head = pr.head.sha as string;
  let path = params.artifact?.mdxPath;
  if (!path) {
    if (!params.expectedTitle || !params.expectedSlug) return {ok: false, reason: "ambiguous-artifact"};
    const candidates: string[] = [];
    let complete = false;
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`${base}/pulls/${pullNumber}/files?per_page=100&page=${page}`, {headers});
      if (!res.ok) return {ok: false, reason: "file-missing"};
      const files = await res.json() as {filename: string; status: string}[];
      candidates.push(...files.filter(f => f.status !== "removed" && f.filename.startsWith(`${CONTENT_PATH}/`) && f.filename.endsWith(`-${params.expectedSlug}.mdx`)).map(f => f.filename));
      if (files.length < 100) { complete = true; break; }
    }
    if (!complete || candidates.length !== 1) return {ok: false, reason: "ambiguous-artifact"};
    path = candidates[0];
  }
  if (!path.startsWith(`${CONTENT_PATH}/`) || path.includes("..") || !path.endsWith(".mdx")) return {ok: false, reason: "identity-mismatch"};
  const fileRes = await fetch(`${base}/contents/${path}?ref=${encodeURIComponent(head)}`, {headers});
  if (!fileRes.ok) return {ok: false, reason: "file-missing"};
  const file = await fileRes.json();
  if (!file.sha || file.encoding !== "base64") return {ok: false, reason: "file-missing"};
  const content = Buffer.from(file.content, "base64").toString();
  if (params.expectedTitle && !new RegExp(`^title: "${escapeRegExp(escapeYamlString(params.expectedTitle))}"$`, "m").test(content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "")) return {ok: false, reason: "identity-mismatch"};
  const updated = patchFrontmatterSchedule(content, params);
  try {
    await commitGithubFiles({branchName: params.branchName, expectedHead: head, message: `chore: reschedule article to ${params.scheduledDate}`, files: [{path, bytes: Buffer.from(updated)}]});
    const body = (typeof pr.body === "string" ? pr.body : "").replace(/\n?<!-- resonate-schedule -->[\s\S]*?<!-- \/resonate-schedule -->/g, "").replace(/^(?:Resonate run date:|Scheduled time:|Timezone:|Resonate schedule:).*$/gm, "");
    const summary = `<!-- resonate-schedule -->\nResonate schedule: ${params.scheduledDate} ${params.scheduledTime ?? ""} ${params.timezone ?? ""}\n<!-- /resonate-schedule -->`;
    const bodyRes = await fetch(`${base}/pulls/${pullNumber}`, {method: "PATCH", headers, body: JSON.stringify({body: `${body}\n${summary}`})});
    if (!bodyRes.ok) return {ok: false, reason: "head-conflict"};
  } catch { return {ok: false, reason: "head-conflict"}; }
  const slug = path.split("/").pop()!.replace(/\.mdx$/, "");
  return {ok: true, filePath: path, artifact: params.artifact ?? {repository: repo, prNumber: pullNumber, branchName: params.branchName, mdxPath: path, canonicalUrl: `${process.env.BLOG_SITE_ORIGIN || "https://corvolabs.com"}/blog/${slug}`}};
}

/** One tree/commit/ref boundary. No force push and no partial article/hero commit. */
export async function commitGithubFiles(input: {branchName: string; expectedHead: string; message: string; files: {path: string; bytes: Buffer}[]}) {
  const base = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
  const headers = githubHeaders();
  async function request(path: string, method = "GET", body?: unknown) {
    const res = await fetch(`${base}${path}`, {method, headers, ...(body ? {body: JSON.stringify(body)} : {})});
    if (!res.ok) throw new Error(`GitHub artifact operation failed (${res.status}); reconcile before retry.`);
    return res.json();
  }
  const parent = await request(`/git/commits/${input.expectedHead}`);
  const tree = [];
  for (const file of input.files) {
    if (file.path.startsWith("/") || file.path.split("/").some(p => p === ".." || !p)) throw new Error("Unsafe artifact path");
    const blob = await request("/git/blobs", "POST", {content: file.bytes.toString("base64"), encoding: "base64"});
    tree.push({path: file.path, mode: "100644", type: "blob", sha: blob.sha});
  }
  const createdTree = await request("/git/trees", "POST", {base_tree: parent.tree.sha, tree});
  const commit = await request("/git/commits", "POST", {message: input.message, tree: createdTree.sha, parents: [input.expectedHead]});
  const ref = await request(`/git/ref/heads/${encodeURIComponent(input.branchName)}`);
  if (ref.object.sha !== input.expectedHead) throw new Error("Article head changed; Needs Review");
  await request(`/git/refs/heads/${encodeURIComponent(input.branchName)}`, "PATCH", {sha: commit.sha, force: false});
  return commit.sha as string;
}

export type BlogPrStatus = "open" | "merged" | "closed" | "draft";

export async function fetchBlogPrStatus(prUrl: string): Promise<{
  prNumber: number | null;
  prStatus: BlogPrStatus;
  prUrl: string;
}> {
  if (!GITHUB_TOKEN) throw new Error("Missing required environment variable: GITHUB_TOKEN");
  const pullNumber = parsePullNumber(prUrl);
  if (pullNumber === null) {
    throw new Error("Could not parse PR number from URL.");
  }

  const headers = githubHeaders();
  const prRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pullNumber}`,
    { headers }
  );
  if (prRes.status === 404) {
    throw new Error("Pull request not found.");
  }
  if (!prRes.ok) {
    throw new Error(`GitHub PR fetch failed: ${prRes.status}`);
  }

  const prData = (await prRes.json()) as {
    number?: number;
    state?: string;
    merged?: boolean;
    draft?: boolean;
    html_url?: string;
  };

  let prStatus: BlogPrStatus = "open";
  if (prData.draft) {
    prStatus = "draft";
  } else if (prData.merged) {
    prStatus = "merged";
  } else if (prData.state === "closed") {
    prStatus = "closed";
  }

  return {
    prNumber: prData.number ?? pullNumber,
    prStatus,
    prUrl: prData.html_url ?? prUrl,
  };
}
