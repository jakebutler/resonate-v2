import {
  hasCanonicalLink,
  proposeArticleLink,
  publicationEvidenceHold,
  articleArtifactVersion,
} from "../articleContracts";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readArticlePublication,
  articleEvidenceKey,
} from "../articlePublication";
import {
  verifyArticleAvailability,
  expectedArticleText,
} from "../articleAvailability";
const artifact = {
  repository: "jakebutler/corvo-labs-dot-com",
  prNumber: 7,
  branchName: "fixture/article",
  mdxPath: "corvo-labs-enhanced/content/blog/2030-10-07-fixture.mdx",
  canonicalUrl: "https://corvolabs.com/blog/2030-10-07-fixture",
};
const input = {
  artifact,
  prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/7",
  branchName: artifact.branchName,
  title: "Reviewed article",
  content: "Reviewed claim: 42%.",
  editorialVersion: "fixture-version",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function githubFixture(
  options: {
    merged?: boolean;
    deployment?: string;
    sha?: string;
    ancestor?: boolean;
    changedBlob?: boolean;
    sourceContent?: string;
  } = {},
) {
  vi.stubEnv("GITHUB_TOKEN", "sanitized-fixture-token");
  vi.stubEnv("BLOG_REPO_OWNER", "jakebutler");
  vi.stubEnv("BLOG_REPO_NAME", "corvo-labs-dot-com");
  vi.stubEnv("BLOG_CONTENT_PATH", "corvo-labs-enhanced/content/blog");
  vi.stubEnv("BLOG_SITE_ORIGIN", "https://corvolabs.com");
  vi.stubEnv("BLOG_PRODUCTION_ENVIRONMENT", "Production");
  const calls: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    calls.push(url);
    let data: unknown;
    if (url.endsWith("/pulls/7"))
      data = {
        number: 7,
        merged: options.merged ?? true,
        state: options.merged === false ? "open" : "closed",
        merge_commit_sha: "merge",
        head: {
          ref: artifact.branchName,
          sha: "head",
          repo: { full_name: artifact.repository },
        },
        base: { repo: { full_name: artifact.repository } },
      };
    else if (url.includes("/files?")) data = [{filename:artifact.mdxPath,status:"added"}];
    else if (url.includes("/deployments?"))
      data = [
        {
          id: 10,
          sha: options.sha ?? "merge",
          environment: "Production",
          production_environment: true,
          created_at: "2030-10-07T16:00:00Z",
        },
      ];
    else if (url.includes("/deployments/10/statuses"))
      data = [{ state: options.deployment ?? "success" }];
    else if (url.includes("/compare/"))
      data = {
        status: options.ancestor ? "ahead" : "diverged",
        merge_base_commit: { sha: options.ancestor ? "merge" : "other" },
      };
    else if (url.includes("/contents/"))
      data = {
        sha:
          options.changedBlob && url.includes("ref=later")
            ? "wrong-blob"
            : "article-blob",
        encoding: "base64",
        size: 100,
        content: Buffer.from(
          `---\ntitle: "Reviewed article"\nstatus: "published"\n---\n\n${options.sourceContent ?? input.content}`,
        ).toString("base64"),
      };
    else throw new Error(`Unexpected mocked read ${url}`);
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return { calls, fetch };
}
describe("separate publication facts", () => {
  it.each([
    { merged: false },
    { deployment: "pending" },
    { deployment: "failure" },
    { sha: "unrelated" },
    { sha: "later", ancestor: true, changedBlob: true },
    { sourceContent: "Wrong editorial copy" },
  ])(
    "holds unverified merge/deployment/artifact evidence (%j)",
    async (options) => {
      githubFixture(options);
      const available = vi.fn();
      const result = await readArticlePublication(input, available);
      expect(result.evidence.availability).not.toBe("verified");
      expect(result.evidence.reason).toBeTruthy();
      expect(available).not.toHaveBeenCalled();
    },
  );
  it.each([{}, { sha: "later", ancestor: true }])(
    "accepts exact successful Production evidence or a proved unchanged descendant (%j)",
    async (options) => {
      const { calls } = githubFixture(options);
      const result = await readArticlePublication(input, async () => ({
        availability: "verified",
        expectedHash: "expected",
        observedHash: "observed",
      }));
      expect(result.evidence).toMatchObject({
        prState: "merged",
        mergeSha: "merge",
        deploymentSha: options.sha ?? "merge",
        deploymentState: "success",
        articleBlobSha: "article-blob",
        availability: "verified",
      });
      expect(
        calls.every((url) =>
          url.startsWith(
            "https://api.github.com/repos/jakebutler/corvo-labs-dot-com/",
          ),
        ),
      ).toBe(true);
      expect(articleEvidenceKey({ ...result.evidence, checkedAt: 1 })).toBe(
        articleEvidenceKey({ ...result.evidence, checkedAt: 2 }),
      );
    },
  );
  it("holds blocked canonical checks even after exact successful deployment", async () => {
    githubFixture();
    const result = await readArticlePublication(input, async () => ({
      availability: "blocked",
      expectedHash: "expected",
      reason: "Blocked check",
    }));
    expect(result.evidence).toMatchObject({
      deploymentState: "success",
      availability: "blocked",
      reason: "Blocked check",
    });
  });
  it("rejects saved publication-intent or metadata drift", async () => {
    githubFixture();
    expect(
      (await readArticlePublication({ ...input, publicationIntent: "draft" }))
        .evidence.reason,
    ).toMatch(/draft/);
    expect(
      (await readArticlePublication({ ...input, author: "Changed author" }))
        .evidence.reason,
    ).toMatch(/author/);
  });
});
describe("bounded canonical availability", () => {
  const lookup = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
  const html = (text: string) =>
    new Response(text, { headers: { "content-type": "text/html" } });
  it("verifies parsed article text, entities, exact title and Markdown formatting", async () => {
    const content =
      "Reviewed **claim**: 42%.\n\n## Sources\n\nA _source_ [link](https://example.test).";
    expect(expectedArticleText(content)).toBe(
      "Reviewed claim: 42%. Sources A source link.",
    );
    const read = vi.fn(async () =>
      html(
        '<article><h1>Reviewed article</h1><p>Reviewed <strong>claim</strong>: 42%.</p><h2>Sources</h2><p>A <em>source</em> <a href="https://example.test">link</a>.</p></article>',
      ),
    );
    expect(
      await verifyArticleAvailability(
        {
          ...input,
          mdxPath: artifact.mdxPath,
          canonicalUrl: artifact.canonicalUrl,
          content,
        },
        { lookup, read },
      ),
    ).toMatchObject({ availability: "verified" });
  });
  it.each([
    "https://127.0.0.1/blog/2030-10-07-fixture",
    "https://corvolabs.com/private",
    "https://corvolabs.com/blog/2030-10-07-fixture?url=http://localhost",
  ])(
    "rejects private/unbound targets before reads (%s)",
    async (canonicalUrl) => {
      const read = vi.fn();
      expect(
        (
          await verifyArticleAvailability(
            { ...input, canonicalUrl, mdxPath: artifact.mdxPath },
            { lookup, read },
          )
        ).availability,
      ).toBe("blocked");
      expect(read).not.toHaveBeenCalled();
    },
  );
  it("blocks private DNS, cross-target redirects, wrong content and script-only fake articles", async () => {
    const read = vi.fn(async () => html("unused"));
    expect(
      (
        await verifyArticleAvailability(
          {
            ...input,
            canonicalUrl: artifact.canonicalUrl,
            mdxPath: artifact.mdxPath,
          },
          { lookup: async () => [{ address: "10.0.0.2", family: 4 }], read },
        )
      ).availability,
    ).toBe("blocked");
    expect(read).not.toHaveBeenCalled();
    for (const response of [
      new Response(null, {
        status: 302,
        headers: { location: "https://localhost/secret" },
      }),
      html(
        '<script>"<article><h1>Reviewed article</h1><p>Reviewed claim: 42%.</p></article>"</script>',
      ),
      html(
        "<article><h1>Wrong article</h1><p>Reviewed claim: 42%.</p></article>",
      ),
    ])
      expect(
        (
          await verifyArticleAvailability(
            {
              ...input,
              canonicalUrl: artifact.canonicalUrl,
              mdxPath: artifact.mdxPath,
            },
            { lookup, read: async () => response },
          )
        ).availability,
      ).toBe("blocked");
  });
});

describe("exact link and review contracts", () => {
  it("rejects a canonical URL embedded inside a different target", () => {
    expect(
      hasCanonicalLink(
        `https://evil.test/?target=${artifact.canonicalUrl}`,
        artifact.canonicalUrl,
      ),
    ).toBe(false);
    expect(
      hasCanonicalLink(`Read ${artifact.canonicalUrl}.`, artifact.canonicalUrl),
    ).toBe(true);
  });
  it("resolves reviewed placements while preserving numbers and remaining copy", () => {
    expect(
      proposeArticleLink(
        { content: "Exact 42% copy.\n{{articleUrl}}" },
        artifact.canonicalUrl,
        "body",
      ),
    ).toEqual({
      content: `Exact 42% copy.\n${artifact.canonicalUrl}`,
      linkedinFirstComment: undefined,
    });
    expect(
      proposeArticleLink(
        {
          content: "Exact 42% copy.",
          linkedinFirstComment: artifact.canonicalUrl,
          companionLink: {
            articlePostId: "article",
            placement: "body",
            resolvedPlacement: "first-comment",
            canonicalUrl: artifact.canonicalUrl,
          },
        },
        artifact.canonicalUrl,
        "body",
      ),
    ).toEqual({
      content: `Exact 42% copy.\n\n${artifact.canonicalUrl}`,
      linkedinFirstComment: undefined,
    });
  });
  it("holds stale proof and accepts only explicit article inclusion evidence", () => {
    const e = {
      checkedAt: Date.now() - 1000000,
      editorialVersion: "version",
      artifactVersion: articleArtifactVersion(artifact),
      prState: "merged" as const,
      mergeSha: "merge",
      deploymentSha: "merge",
      deploymentState: "success",
      deploymentContainsArticle: true,
      articleBlobSha: "blob",
      availability: "verified" as const,
    };
    expect(
      publicationEvidenceHold(e, "version", articleArtifactVersion(artifact)),
    ).toMatch(/stale/);
    expect(
      publicationEvidenceHold(
        { ...e, checkedAt: Date.now(), deploymentContainsArticle: undefined },
        "version",
        articleArtifactVersion(artifact),
      ),
    ).toMatch(/unverified/);
  });
});

it("rejects a supplied artifact that is absent from the bound PR changed files", async () => {
  const { fetch } = githubFixture();
  const base = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (url: string) =>
    url.includes("/files?") ? new Response("[]") : base(url),
  );
  const available = vi.fn();
  const result = await readArticlePublication(input, available);
  expect(result.evidence.reason).toMatch(/changed files|bound PR/i);
  expect(available).not.toHaveBeenCalled();
});
it("treats a Markdown hard break as a rendered word boundary", () =>
  expect(expectedArticleText("First line  \nSecond line")).toBe(
    "First line Second line",
  ));
it("rejects canonical URLs glued to preceding non-boundary text", () => {
  expect(
    hasCanonicalLink(
      "xhttps://corvolabs.com/blog/fixture",
      "https://corvolabs.com/blog/fixture",
    ),
  ).toBe(false);
  expect(
    hasCanonicalLink(
      "[Read](https://corvolabs.com/blog/fixture).",
      "https://corvolabs.com/blog/fixture",
    ),
  ).toBe(true);
});
