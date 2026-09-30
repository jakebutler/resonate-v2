import { articleArtifactVersion } from "./articleContracts";
import { createHash } from "node:crypto";
import type { BlogArtifact } from "./github";
import type { ArticlePublicationEvidence } from "./articleContracts";
import {
  articleTarget,
  verifyArticleAvailability,
} from "./articleAvailability";
export type ArticleCheckInput = {
  prUrl: string;
  branchName?: string;
  title: string;
  content: string;
  slug?: string;
  artifact?: BlogArtifact;
  editorialVersion: string;
  publicationIntent?: "draft" | "published";
  excerpt?: string;
  author?: string;
  category?: string;
  tags?: string[];
  coverImageAlt?: string;
  heroSha256?: string;
};
const configuredRepo = () =>
  `${process.env.BLOG_REPO_OWNER || "jakebutler"}/${process.env.BLOG_REPO_NAME || "corvo-labs-dot-com"}`;
const contentPath = () =>
  process.env.BLOG_CONTENT_PATH ||
  `${process.env.BLOG_APP_ROOT || "corvo-labs-enhanced"}/content/blog`;

/** Only approved image locations change between saved Markdown and its reader artifact. */
export function articleBodyForArtifact(content: string, artifact: Pick<BlogArtifact, "mdxPath" | "figureAssets" | "heroPath" | "heroSha256" | "heroSourceUrl">): string {
  const figures = artifact.figureAssets ?? [];
  if (figures.length > 3 || new Set(figures.map(figure => figure.sourceUrl)).size !== figures.length || new Set(figures.map(figure => figure.path)).size !== figures.length) throw new Error("Bound figure artifact identities are invalid.");
  const slug = artifact.mdxPath.split("/").pop()?.replace(/\.mdx$/, "");
  if (!slug || !/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Bound figure article path is invalid.");
  const appRoot = process.env.BLOG_APP_ROOT || "corvo-labs-enhanced";
  let body = content;
  if (artifact.heroSourceUrl !== undefined) {
    if (!artifact.heroSourceUrl || artifact.heroSourceUrl.length > 4096 || /[\r\n\0]/u.test(artifact.heroSourceUrl) ||
      artifact.heroPath !== `${appRoot}/public/images/blog/${slug}/hero.webp` || !/^[a-f0-9]{64}$/u.test(artifact.heroSha256 ?? "")) throw new Error("Bound hero identity or path is unverified.");
    const source = artifact.heroSourceUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match the preparer's exact approved image identity, never other external URLs.
    body = body.replace(new RegExp(`(!\\[[^\\]]*]\\()${source}(\\))`, "g"), (_match, before: string, after: string) => `${before}${artifact.heroPath!.slice(`${appRoot}/public`.length)}${after}`);
  }
  for (const figure of figures) {
    const id = figure.sourceUrl.match(/^resonate-figure:\/\/([a-zA-Z0-9]+)$/u)?.[1];
    const expectedPath = `${appRoot}/public/images/blog/${slug}/figure-${id}.svg`;
    if (!id || figure.path !== expectedPath || !/^[a-f0-9]{64}$/u.test(figure.sha256)) throw new Error("Bound figure path or hash is unverified.");
    const matches = [...body.matchAll(/!\[(?:\\.|[^\]\\\r\n])*\]\((resonate-figure:\/\/[a-zA-Z0-9]+)\)/gu)].filter(match => match[1] === figure.sourceUrl);
    if (matches.length !== 1 || body.split(figure.sourceUrl).length !== 2) throw new Error("Bound figure placement is missing or ambiguous.");
    const image = matches[0][0];
    body = body.replace(image, () => image.replace(`](${figure.sourceUrl})`, () => `](${figure.path.slice(`${appRoot}/public`.length)})`));
  }
  if (body.includes("resonate-figure://")) throw new Error("Article contains an unbound figure token.");
  return body;
}
export async function readArticlePublication(
  input: ArticleCheckInput,
  checkAvailability = verifyArticleAvailability,
): Promise<{ evidence: ArticlePublicationEvidence; artifact?: BlogArtifact }> {
  const evidence: ArticlePublicationEvidence = {
    checkedAt: Date.now(),
    editorialVersion: input.editorialVersion,
    artifactVersion: articleArtifactVersion(input.artifact),
    prState: "unknown",
    deploymentState: "unknown",
    availability: "unverified",
  };
  let artifact = input.artifact;
  try {
    const repo = configuredRepo();
    const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const number = input.prUrl.match(
      new RegExp(`^https://github\\.com/${escaped}/pull/(\\d+)/?$`),
    )?.[1];
    if (!number || !process.env.GITHUB_TOKEN)
      throw new Error(
        "Bound article PR or configured credential is unavailable.",
      );
    const base = `https://api.github.com/repos/${repo}`;
    async function read(path: string) {
      const response = await fetch(`${base}${path}`, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (
        !response.ok ||
        Number(response.headers.get("content-length") ?? 0) > 2000000
      )
        throw new Error("GitHub publication receipt read failed.");
      if (!response.body)
        throw new Error("GitHub receipt has no readable body.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 2000000) {
            await reader.cancel();
            throw new Error("GitHub receipt exceeds bounded read.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("GitHub receipt did not contain valid JSON.");
      }
    }
    const pr = await read(`/pulls/${number}`);
    if (
      pr.number !== Number(number) ||
      pr.head?.repo?.full_name !== repo ||
      pr.base?.repo?.full_name !== repo ||
      (input.branchName && pr.head?.ref !== input.branchName) ||
      !pr.head?.sha
    )
      throw new Error("Article PR identity is unverified.");
    evidence.prState = pr.merged
      ? "merged"
      : pr.draft
        ? "draft"
        : pr.state === "closed"
          ? "closed"
          : "open";
    evidence.headSha = pr.head.sha;
    evidence.mergeSha = pr.merged ? pr.merge_commit_sha : undefined;
    if (
      artifact &&
      (artifact.repository !== repo ||
        artifact.prNumber !== Number(number) ||
        artifact.branchName !== pr.head.ref)
    )
      throw new Error("Article artifact identity changed.");
    if (artifact?.editorialFingerprint && artifact.editorialFingerprint !== input.editorialVersion) throw new Error("Article approval changed after the bound export.");
    if (input.coverImageAlt !== undefined && artifact?.coverImageAlt !== undefined && input.coverImageAlt !== artifact.coverImageAlt) throw new Error("Saved hero alternative text differs from the bound approval.");
    let path = artifact?.mdxPath;
    if (!path) {
      const slug =
        input.slug ||
        input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      const candidates: string[] = [];
      let complete = false;
      for (let page = 1; page <= 10; page++) {
        const files = (await read(
          `/pulls/${number}/files?per_page=100&page=${page}`,
        )) as { filename: string; status: string }[];
        if (!Array.isArray(files))
          throw new Error("Article changed files are unverified.");
        candidates.push(
          ...files
            .filter(
              (f) =>
                f.status !== "removed" &&
                f.filename.startsWith(`${contentPath()}/`) &&
                f.filename.endsWith(`-${slug}.mdx`),
            )
            .map((f) => f.filename),
        );
        if (files.length < 100) {
          complete = true;
          break;
        }
      }
      if (!complete || candidates.length !== 1)
        throw new Error("Legacy article artifact is ambiguous or incomplete.");
      path = candidates[0];
    }
    if (
      !path.startsWith(`${contentPath()}/`) ||
      path.includes("..") ||
      !/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/.test(
        path.split("/").pop()!,
      )
    )
      throw new Error("Article artifact path is outside configured content.");
    const publicationBody = articleBodyForArtifact(input.content, { mdxPath: path, figureAssets: artifact?.figureAssets, heroSourceUrl: artifact?.heroSourceUrl, heroPath: artifact?.heroPath, heroSha256: artifact?.heroSha256 });
    const ref = evidence.mergeSha || evidence.headSha;
    const source = await read(
      `/contents/${path}?ref=${encodeURIComponent(ref!)}`,
    );
    if (
      source.encoding !== "base64" ||
      typeof source.content !== "string" ||
      source.size > 1000000 ||
      !source.sha
    )
      throw new Error("Bound article source is unverified.");
    const text = Buffer.from(source.content, "base64").toString("utf8");
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (
      !match ||
      !match[1]
        .split("\n")
        .some((line) => line === `title: ${JSON.stringify(input.title)}`) ||
      match[2].replace(/^\n/, "") !== publicationBody
    )
      throw new Error(
        "Bound article title or exact copy differs from the saved version.",
      );
    const frontmatter = match[1];
    function field(name: string) {
      const lines = frontmatter
        .split("\n")
        .filter((line) => line.startsWith(`${name}:`));
      if (lines.length !== 1) return undefined;
      const value = lines[0].slice(name.length + 1).trim();
      try {
        return JSON.parse(value);
      } catch {
        if (value.startsWith("'") && value.endsWith("'"))
          return value.slice(1, -1).replace(/''/g, "'");
        return value;
      }
    }
    for (const [name, expected] of [
      ["description", input.excerpt],
      ["author", input.author],
      ["category", input.category],
      ["tags", input.tags],
      ["coverImageAlt", input.coverImageAlt ?? artifact?.coverImageAlt],
    ] as const) {
      if (
        expected !== undefined &&
        JSON.stringify(
          field(name) ??
            (name === "description"
              ? field("excerpt")
              : name === "coverImageAlt"
                ? field("heroImageAlt")
                : undefined),
        ) !== JSON.stringify(expected)
      )
        throw new Error(
          `Bound article ${name} differs from the saved editorial version.`,
        );
    }
    if (input.publicationIntent === "draft")
      throw new Error("Saved article publication intent is draft.");
    artifact ??= {
      repository: repo,
      prNumber: Number(number),
      branchName: pr.head.ref,
      mdxPath: path,
      canonicalUrl: `${process.env.BLOG_SITE_ORIGIN || "https://corvolabs.com"}/blog/${path
        .split("/")
        .pop()!
        .replace(/\.mdx$/, "")}`,
    };
    articleTarget(artifact.canonicalUrl, path);
    evidence.artifactVersion = articleArtifactVersion(artifact);
    evidence.canonicalUrl = artifact.canonicalUrl;
    if (evidence.prState !== "merged" || !evidence.mergeSha)
      throw new Error(`Article PR is ${evidence.prState}.`);
    if (field("status") !== "published")
      throw new Error("Merged article has draft publication intent.");
    const deployments = [];
    let complete = false;
    for (let page = 1; page <= 10; page++) {
      const rows = await read(
        `/deployments?environment=${encodeURIComponent(process.env.BLOG_PRODUCTION_ENVIRONMENT || "Production")}&per_page=100&page=${page}`,
      );
      if (!Array.isArray(rows))
        throw new Error("Production deployment list is unverified.");
      deployments.push(...rows);
      if (rows.length < 100) {
        complete = true;
        break;
      }
    }
    if (!complete)
      throw new Error("Production deployment pagination is incomplete.");
    const deployment = deployments
      .filter(
        (d) =>
          d.environment ===
            (process.env.BLOG_PRODUCTION_ENVIRONMENT || "Production") &&
          d.production_environment === true,
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    if (!deployment?.sha || !Number.isSafeInteger(deployment.id))
      throw new Error("Production deployment has not been verified.");
    evidence.deploymentId = deployment.id;
    evidence.deploymentSha = deployment.sha;
    evidence.environment = deployment.environment;
    const statuses = await read(
      `/deployments/${deployment.id}/statuses?per_page=1`,
    );
    const status = statuses?.[0];
    evidence.deploymentState = status?.state ?? "unknown";
    if (evidence.deploymentState !== "success")
      throw new Error(`Production deployment is ${evidence.deploymentState}.`);
    // A later production commit qualifies only with verified ancestry and the exact unchanged article blob.
    if (deployment.sha !== evidence.mergeSha) {
      const comparison = await read(
        `/compare/${evidence.mergeSha}...${deployment.sha}`,
      );
      if (
        !["ahead", "identical"].includes(comparison.status) ||
        comparison.merge_base_commit?.sha !== evidence.mergeSha
      )
        throw new Error(
          "Production deployment does not include the article merge commit.",
        );
      const deployedSource = await read(
        `/contents/${path}?ref=${encodeURIComponent(deployment.sha)}`,
      );
      if (deployedSource.sha !== source.sha)
        throw new Error("Production contains a different article artifact.");
    }
    if (input.heroSha256 && artifact.heroSha256 && input.heroSha256 !== artifact.heroSha256) throw new Error("Saved hero approval differs from the bound artifact.");
    const heroSha256 = input.heroSha256 ?? artifact.heroSha256;
    if (heroSha256) {
      const heroPath = artifact.heroPath;
      if (
        !heroPath ||
        !heroPath.startsWith(
          `${process.env.BLOG_APP_ROOT || "corvo-labs-enhanced"}/public/images/blog/`,
        ) ||
        heroPath.includes("..") ||
        !heroPath.endsWith(".webp")
      )
        throw new Error("Prepared hero artifact is unverified.");
      const expectedCover = heroPath.slice(
        `${process.env.BLOG_APP_ROOT || "corvo-labs-enhanced"}/public`.length,
      );
      if (field("coverImage") !== expectedCover)
        throw new Error("Bound prepared hero path differs from source.");
      const hero = await read(
        `/contents/${heroPath}?ref=${encodeURIComponent(deployment.sha)}`,
      );
      if (
        hero.encoding !== "base64" ||
        hero.size >= 150000 ||
        typeof hero.content !== "string" ||
        createHash("sha256")
          .update(Buffer.from(hero.content, "base64"))
          .digest("hex") !== heroSha256
      )
        throw new Error(
          "Production hero differs from the reviewed prepared bytes.",
        );
    }
    for (const figure of artifact.figureAssets ?? []) {
      const deployed = await read(`/contents/${figure.path}?ref=${encodeURIComponent(deployment.sha)}`);
      if (deployed.encoding !== "base64" || typeof deployed.content !== "string" || !Number.isSafeInteger(deployed.size) || deployed.size > 256000) throw new Error("Production figure bytes are unverified.");
      const bytes = Buffer.from(deployed.content, "base64");
      if (bytes.byteLength !== deployed.size || createHash("sha256").update(bytes).digest("hex") !== figure.sha256) throw new Error("Production figure differs from its reviewed deterministic bytes.");
    }
    evidence.deploymentContainsArticle = true;
    evidence.articleBlobSha = source.sha;
    Object.assign(
      evidence,
      await checkAvailability({
        canonicalUrl: artifact.canonicalUrl,
        mdxPath: path,
        title: input.title,
        content: publicationBody,
      }),
    );
    evidence.checkedAt = Date.now();
    return { evidence, artifact };
  } catch (error) {
    evidence.reason =
      error instanceof Error
        ? error.message
        : "Article publication check is unverified.";
    return { evidence, artifact };
  }
}
export function articleEvidenceKey(e: ArticlePublicationEvidence) {
  const { checkedAt: _checkedAt, ...facts } = e;
  void _checkedAt;
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}
