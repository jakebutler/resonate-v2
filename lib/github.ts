const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const REPO_OWNER = process.env.BLOG_REPO_OWNER || "jakebutler";
const REPO_NAME = process.env.BLOG_REPO_NAME || "corvo-labs-dot-com";
const BLOG_APP_ROOT = process.env.BLOG_APP_ROOT || "corvo-labs-enhanced";
const CONTENT_PATH =
  process.env.BLOG_CONTENT_PATH || `${BLOG_APP_ROOT}/content/blog`;
const DEFAULT_AUTHOR = process.env.BLOG_POST_AUTHOR?.trim() || "Jake Butler";
const DEFAULT_CATEGORY = process.env.BLOG_DEFAULT_CATEGORY?.trim() || "strategy";

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
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
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
  if (explicit?.trim()) {
    return clampText(explicit, 160);
  }

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

function buildFrontmatter(params: BuildFrontmatterParams): string {
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
  lines.push(`heroImage: "${escapeYamlString(params.heroImage)}"`);
  lines.push(`heroImageAlt: "${escapeYamlString(params.heroImageAlt)}"`);
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
  featured?: boolean;
  coverImageAlt?: string;
  images?: PublishImageAsset[];
}): Promise<{
  prUrl: string;
  branchName: string;
  sanitizedResponse: {
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
  const slug = `${date}-${slugify(params.title)}`;
  const fileName = `${slug}.mdx`;
  const filePath = `${CONTENT_PATH}/${fileName}`;
  const branchName = `resonate/blog-post-${slug}`;

  const imagesBySourceUrl = new Map<string, PublishImageAsset>(
    images.map((asset) => [asset.sourceUrl, asset] as const)
  );

  const body = normalizeMdxBody({
    content: params.content,
    heroImageUrl: hero.sourceUrl,
    imagesBySourceUrl,
  });

  const heroImageAlt =
    params.coverImageAlt?.trim() ||
    hero.alt?.trim() ||
    `Cover image for ${params.title}`;

  const frontmatterInput: BuildFrontmatterParams = {
    title: params.title,
    date,
    scheduledTime,
    timezone,
    subtitle: params.subtitle,
    description: buildDescription(params.content, params.excerpt),
    author: params.author?.trim() || DEFAULT_AUTHOR,
    tags: params.tags ?? [],
    heroImage: hero.sourceUrl,
    heroImageAlt,
    readTime: estimateReadTime(params.content),
    category: params.category?.trim() || DEFAULT_CATEGORY,
    featured: params.featured ?? false,
    status: params.status?.trim() || "scheduled",
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
  const fileContent = Buffer.from(frontmatter + body).toString("base64");

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const repoRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`,
    { headers }
  );
  if (!repoRes.ok) throw new Error(`GitHub repo fetch failed: ${repoRes.status}`);
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  const branchRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${defaultBranch}`,
    { headers }
  );
  if (!branchRes.ok) throw new Error(`GitHub branch fetch failed: ${branchRes.status}`);
  const branchData = await branchRes.json();
  const sha = branchData.object.sha;

  const createBranchRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    }
  );
  if (!createBranchRes.ok) {
    const err = await createBranchRes.json();
    const branchAlreadyExists =
      createBranchRes.status === 422 &&
      typeof err?.message === "string" &&
      err.message.toLowerCase().includes("reference already exists");

    if (!branchAlreadyExists) {
      throw new Error(`GitHub create branch failed: ${JSON.stringify(err)}`);
    }
  }

  const existingFileRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${encodeURIComponent(
      branchName
    )}`,
    { headers }
  );
  const existingFile =
    existingFileRes.ok ? ((await existingFileRes.json()) as { sha?: string }) : null;

  const createFileRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `feat: add blog post "${params.title}"`,
        content: fileContent,
        branch: branchName,
        ...(existingFile?.sha ? { sha: existingFile.sha } : {}),
      }),
    }
  );
  if (!createFileRes.ok) {
    const err = await createFileRes.json();
    throw new Error(`GitHub create file failed: ${JSON.stringify(err)}`);
  }

  const prRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `Blog post: ${params.title}`,
        body: [
          "Publish intent: merge to publish on corvo-labs-dot-com.",
          `Resonate run date: ${date}.`,
          `Schedule trigger: ${scheduleTrigger}.`,
          scheduledTime ? `Scheduled time: ${scheduledTime}.` : null,
          timezone ? `Timezone: ${timezone}.` : null,
          "Schedule metadata is recorded in frontmatter and PR body for human review; Resonate will not auto-merge.",
          "Vercel preview: pending manual review, if applicable.",
        ]
          .filter(Boolean)
          .join("\n"),
        head: branchName,
        base: defaultBranch,
      }),
    }
  );
  if (!prRes.ok) {
    const err = await prRes.json();
    const prAlreadyExists =
      prRes.status === 422 &&
      Array.isArray(err?.errors) &&
      err.errors.some(
        (issue: { message?: string }) =>
          typeof issue.message === "string" &&
          issue.message.toLowerCase().includes("pull request already exists")
      );

    if (prAlreadyExists) {
      const existingPrRes = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&head=${encodeURIComponent(
          `${REPO_OWNER}:${branchName}`
        )}&base=${encodeURIComponent(defaultBranch)}`,
        { headers }
      );
      if (existingPrRes.ok) {
        const existingPrs = (await existingPrRes.json()) as Array<{
          html_url?: string;
          number?: number;
          state?: string;
        }>;
        const existingPr = existingPrs.find((pr) => pr.html_url);
        if (existingPr?.html_url) {
          return {
            prUrl: existingPr.html_url,
            branchName,
            sanitizedResponse: {
              repo: `${REPO_OWNER}/${REPO_NAME}`,
              prUrl: existingPr.html_url,
              branchName,
              number: existingPr.number,
              state: existingPr.state,
              scheduleTrigger,
              scheduledDate: date,
              scheduledTime,
              timezone,
            },
          };
        }
      }
    }

    throw new Error(`GitHub create PR failed: ${JSON.stringify(err)}`);
  }
  const prData = (await prRes.json()) as {
    html_url: string;
    number?: number;
    state?: string;
  };

  return {
    prUrl: prData.html_url,
    branchName,
    sanitizedResponse: {
      repo: `${REPO_OWNER}/${REPO_NAME}`,
      prUrl: prData.html_url,
      branchName,
      number: prData.number,
      state: prData.state,
      scheduleTrigger,
      scheduledDate: date,
      scheduledTime,
      timezone,
    },
  };
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
  | "pr-closed" | "pr-not-found" | "branch-missing" | "file-missing";

export type UpdatePrFrontmatterResult =
  | { ok: true; filePath: string }
  | { ok: false; reason: UpdatePrFrontmatterFailureReason };

function parsePullNumber(prUrl: string): number | null {
  const match = prUrl.match(/\/pull\/(\d+)\/?$/);
  if (!match) return null;
  const number = Number.parseInt(match[1], 10);
  return Number.isFinite(number) ? number : null;
}

async function findMdxFileOnBranch(
  branchName: string,
  headers: Record<string, string>
): Promise<{ path: string; sha: string; content: string } | null> {
  const listingRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONTENT_PATH}?ref=${encodeURIComponent(branchName)}`,
    { headers }
  );
  if (!listingRes.ok) return null;
  const listing = (await listingRes.json()) as Array<{ name?: string; path?: string; type?: string }>;
  const mdxEntry = listing.find((e) => e.type === "file" && e.name?.endsWith(".mdx") && e.path);
  if (!mdxEntry?.path) return null;
  const fileRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${mdxEntry.path}?ref=${encodeURIComponent(branchName)}`,
    { headers }
  );
  if (!fileRes.ok) return null;
  const fileData = (await fileRes.json()) as { sha?: string; content?: string; encoding?: string };
  if (!fileData.sha || !fileData.content || fileData.encoding !== "base64") return null;
  return {
    path: mdxEntry.path,
    sha: fileData.sha,
    content: Buffer.from(fileData.content, "base64").toString("utf-8"),
  };
}

export async function updatePrFrontmatter(params: {
  branchName: string;
  prUrl: string;
  scheduledDate: string;
  scheduledTime?: string;
  timezone?: string;
}): Promise<UpdatePrFrontmatterResult> {
  if (!GITHUB_TOKEN) throw new Error("Missing required environment variable: GITHUB_TOKEN");
  const headers = githubHeaders();
  const pullNumber = parsePullNumber(params.prUrl);
  if (pullNumber === null) return { ok: false, reason: "pr-not-found" };
  const prRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pullNumber}`,
    { headers }
  );
  if (prRes.status === 404) return { ok: false, reason: "pr-not-found" };
  if (!prRes.ok) throw new Error(`GitHub PR fetch failed: ${prRes.status}`);
  const prData = (await prRes.json()) as { state?: string };
  if (prData.state === "closed") return { ok: false, reason: "pr-closed" };
  const branchRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${encodeURIComponent(params.branchName)}`,
    { headers }
  );
  if (branchRes.status === 404) return { ok: false, reason: "branch-missing" };
  if (!branchRes.ok) throw new Error(`GitHub branch fetch failed: ${branchRes.status}`);
  const mdxFile = await findMdxFileOnBranch(params.branchName, headers);
  if (!mdxFile) return { ok: false, reason: "file-missing" };
  const updatedContent = patchFrontmatterSchedule(mdxFile.content, {
    scheduledDate: params.scheduledDate,
    scheduledTime: params.scheduledTime,
    timezone: params.timezone,
  });
  const commitRes = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${mdxFile.path}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `chore: reschedule blog post to ${params.scheduledDate}`,
        content: Buffer.from(updatedContent).toString("base64"),
        branch: params.branchName,
        sha: mdxFile.sha,
      }),
    }
  );
  if (!commitRes.ok) {
    const err = await commitRes.json();
    throw new Error(`GitHub update file failed: ${JSON.stringify(err)}`);
  }
  return { ok: true, filePath: mdxFile.path };
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
