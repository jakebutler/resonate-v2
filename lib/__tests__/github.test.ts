// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";

type GithubModule = typeof import("@/lib/github");

let createBlogPostPR: GithubModule["createBlogPostPR"];
let updatePrFrontmatter: GithubModule["updatePrFrontmatter"];
let patchFrontmatterSchedule: GithubModule["patchFrontmatterSchedule"];
let normalizeMdxBody: GithubModule["normalizeMdxBody"];
let validateMdxPost: GithubModule["validateMdxPost"];
let BlogPostContractError: GithubModule["BlogPostContractError"];

beforeAll(async () => {
  process.env.GITHUB_TOKEN = "test_token";
  process.env.BLOG_REPO_OWNER = "test-owner";
  process.env.BLOG_REPO_NAME = "test-repo";
  delete process.env.BLOG_CONTENT_PATH;
  delete process.env.BLOG_PUBLIC_IMAGE_PATH;
  delete process.env.BLOG_APP_ROOT;
  vi.resetModules();
  const mod = await import("@/lib/github");
  createBlogPostPR = mod.createBlogPostPR;
  updatePrFrontmatter = mod.updatePrFrontmatter;
  patchFrontmatterSchedule = mod.patchFrontmatterSchedule;
  normalizeMdxBody = mod.normalizeMdxBody;
  validateMdxPost = mod.validateMdxPost;
  BlogPostContractError = mod.BlogPostContractError;
});

const HERO_URL = "https://healthy-platypus-553.convex.cloud/api/storage/hero-uuid";
const SECOND_URL = "https://healthy-platypus-553.convex.cloud/api/storage/second-uuid";

function mockGitHubSuccess(options?: { prUrl?: string }) {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ default_branch: "main" }), { status: 200 })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ object: { sha: "abc123" } }), { status: 200 })
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "not found" }), { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          html_url: options?.prUrl ?? "https://github.com/org/repo/pull/1",
          number: 1,
          state: "open",
        }),
        { status: 200 }
      )
    );
}

describe("normalizeMdxBody", () => {
  it("drops H1 headings from the body so the frontmatter title is canonical", () => {
    const out = normalizeMdxBody({
      content: "# How We Did It\n\nIntro paragraph.\n",
      heroImageUrl: HERO_URL,
      imagesBySourceUrl: new Map(),
    });
    expect(out).not.toMatch(/^# /m);
    expect(out).toContain("Intro paragraph.");
  });

  it("splits an image glued to the next block onto separate lines", () => {
    const out = normalizeMdxBody({
      content: `![Flowchart](${HERO_URL})## The prep work\n\nNext paragraph.`,
      heroImageUrl: "",
      imagesBySourceUrl: new Map(),
    });
    expect(out).toContain(`![Flowchart](${HERO_URL})\n\n## The prep work`);
  });

  it("rewrites slug-shaped alt text using the enriched image payload", () => {
    const images = new Map([
      [HERO_URL, { sourceUrl: HERO_URL, alt: "Descriptive hero caption", isCover: true }],
    ]);
    const out = normalizeMdxBody({
      content: `![hero_image](${HERO_URL})\n\nBody.`,
      heroImageUrl: "",
      imagesBySourceUrl: images,
    });
    expect(out).toContain(`![Descriptive hero caption](${HERO_URL})`);
    expect(out).not.toContain("hero_image");
  });

  it("strips the first in-body copy of the hero image", () => {
    const out = normalizeMdxBody({
      content: `![Hero](${HERO_URL})\n\n## The prep work\n\nBody.`,
      heroImageUrl: HERO_URL,
      imagesBySourceUrl: new Map(),
    });
    expect(out).not.toContain(HERO_URL);
    expect(out).toContain("## The prep work");
  });

  it("inserts a blank line between a standalone image and the next block", () => {
    const out = normalizeMdxBody({
      content: `Intro.\n\n![Inline figure](${SECOND_URL})\nNext paragraph.`,
      heroImageUrl: HERO_URL,
      imagesBySourceUrl: new Map(),
    });
    expect(out).toContain(`![Inline figure](${SECOND_URL})\n\nNext paragraph.`);
  });

  it("collapses runs of blank lines so diffs stay tidy", () => {
    const out = normalizeMdxBody({
      content: "Intro.\n\n\n\n\nTail.\n",
      heroImageUrl: HERO_URL,
      imagesBySourceUrl: new Map(),
    });
    expect(out).toBe("Intro.\n\nTail.\n");
  });
});

describe("validateMdxPost", () => {
  const baseFrontmatter = {
    title: "Post",
    date: "2026-04-20",
    heroImage: HERO_URL,
    heroImageAlt: "Hero caption",
    description: "A good description.",
    tags: ["ai"],
  };

  it("accepts a body that honours every contract rule", () => {
    expect(() =>
      validateMdxPost({
        frontmatter: baseFrontmatter,
        body: `Intro.\n\n![Figure one](${SECOND_URL})\n\n## Section\n\nBody copy.\n`,
        heroImageUrl: HERO_URL,
      })
    ).not.toThrow();
  });

  it("rejects missing frontmatter fields with actionable messages", () => {
    try {
      validateMdxPost({
        frontmatter: {
          title: "",
          date: "",
          heroImage: "",
          heroImageAlt: "",
          description: "",
          tags: [],
        },
        body: "Body.\n",
        heroImageUrl: HERO_URL,
      });
      throw new Error("expected validator to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BlogPostContractError);
      const contractError = err as InstanceType<typeof BlogPostContractError>;
      expect(contractError.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining("title"),
          expect.stringContaining("date"),
          expect.stringContaining("heroImage"),
          expect.stringContaining("heroImageAlt"),
          expect.stringContaining("description"),
          expect.stringContaining("tags"),
        ])
      );
    }
  });

  it("rejects a body that duplicates the hero image near the top", () => {
    try {
      validateMdxPost({
        frontmatter: baseFrontmatter,
        body: `![Hero](${HERO_URL})\n\n## Section\n\nBody.\n`,
        heroImageUrl: HERO_URL,
      });
      throw new Error("expected validator to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BlogPostContractError);
      expect((err as InstanceType<typeof BlogPostContractError>).issues[0]).toMatch(
        /duplicates the hero image/i
      );
    }
  });

  it("rejects images glued directly onto the next block", () => {
    try {
      validateMdxPost({
        frontmatter: baseFrontmatter,
        body: `![Figure one](${SECOND_URL})## Section\n`,
        heroImageUrl: HERO_URL,
      });
      throw new Error("expected validator to throw");
    } catch (err) {
      expect((err as InstanceType<typeof BlogPostContractError>).issues[0]).toMatch(
        /glued onto an image/i
      );
    }
  });

  it("rejects slug-shaped alt text", () => {
    try {
      validateMdxPost({
        frontmatter: baseFrontmatter,
        body: `![asset1_workflow_flowchart](${SECOND_URL})\n\nBody.\n`,
        heroImageUrl: HERO_URL,
      });
      throw new Error("expected validator to throw");
    } catch (err) {
      expect((err as InstanceType<typeof BlogPostContractError>).issues[0]).toMatch(
        /slug as alt text/i
      );
    }
  });

  it("rejects an H1 heading inside the body", () => {
    try {
      validateMdxPost({
        frontmatter: baseFrontmatter,
        body: `# Orphan title\n\nBody.\n`,
        heroImageUrl: HERO_URL,
      });
      throw new Error("expected validator to throw");
    } catch (err) {
      expect((err as InstanceType<typeof BlogPostContractError>).issues[0]).toMatch(
        /H1 heading/i
      );
    }
  });
});

describe("createBlogPostPR", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses an existing shared asset directory before any GitHub mutation", async () => {
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha: "base" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "hero.webp" }]), { status: 200 }));
    await expect(createBlogPostPR({ title: "A different article", slug: "shared-slug", tags: ["fixture"], content: "Body.", scheduledDate: "2026-10-01", status: "draft", images: [
      { sourceUrl: HERO_URL, alt: "A reviewed hero", isCover: true, export: { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp", hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt", approvedBy: "test-reviewer", approvedAt: 1 } } },
    ] })).rejects.toThrow("Publication asset directory already exists");
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("commits an approved hero's exact bytes together with MDX before opening its PR", async () => {
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ default_branch: "main" }))
      .mockResolvedValueOnce(response({ object: { sha: "base" } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ tree: { sha: "base-tree" } }))
      .mockResolvedValueOnce(response({ sha: "hero-blob" }))
      .mockResolvedValueOnce(response({ sha: "mdx-blob" }))
      .mockResolvedValueOnce(response({ sha: "complete-tree" }))
      .mockResolvedValueOnce(response({ sha: "complete-commit" }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ html_url: "https://github.com/test-owner/test-repo/pull/2", number: 2, state: "open" }));
    await createBlogPostPR({ title: "Exact crop", slug: "exact-crop", content: "Body.", scheduledDate: "2026-09-30", status: "draft", tags: ["ai"], images: [
      { sourceUrl: HERO_URL, alt: "Raven opening a workshop door", isCover: true, export: { bytes, sha256, fileName: "hero.webp", contentType: "image/webp", hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt", approvedBy: "test-reviewer", approvedAt: 1 } } },
    ] });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(11);
    const heroBlob = JSON.parse((calls[5][1] as RequestInit).body as string);
    expect(Buffer.from(heroBlob.content, "base64")).toEqual(bytes);
    const mdx = Buffer.from(JSON.parse((calls[6][1] as RequestInit).body as string).content, "base64").toString();
    expect(mdx).toContain('coverImage: "/images/blog/exact-crop/hero.webp"');
    expect(mdx).toContain('coverImageAlt: "Raven opening a workshop door"');
    expect(mdx).not.toContain(HERO_URL);
    const tree = JSON.parse((calls[7][1] as RequestInit).body as string);
    expect(tree.tree).toEqual([
      { path: "corvo-labs-enhanced/public/images/blog/exact-crop/hero.webp", mode: "100644", type: "blob", sha: "hero-blob" },
      { path: "corvo-labs-enhanced/content/blog/2026-09-30-exact-crop.mdx", mode: "100644", type: "blob", sha: "mdx-blob" },
    ]);
    expect(String(calls[9][0])).toContain("/git/refs/heads/");
    expect(String(calls[10][0])).toContain("/pulls");
  });

  it("returns prUrl and branchName on success", async () => {
    mockGitHubSuccess({ prUrl: "https://github.com/org/repo/pull/42" });

    const result = await createBlogPostPR({
      title: "Hello World",
      content: "Intro paragraph.\n",
      scheduledDate: "2026-03-04",
      status: "scheduled",
      tags: ["ai"],
      coverImageAlt: "Descriptive hero alt",
      images: [{ sourceUrl: HERO_URL, alt: "Descriptive hero alt", isCover: true }],
    });

    expect(result.prUrl).toBe("https://github.com/org/repo/pull/42");
    expect(result.branchName).toBe("resonate/blog-post-2026-03-04-hello-world");
    expect(result.sanitizedResponse).toMatchObject({
      repo: "test-owner/test-repo",
      prUrl: "https://github.com/org/repo/pull/42",
      branchName: "resonate/blog-post-2026-03-04-hello-world",
      number: 1,
      state: "open",
      scheduleTrigger: "pr-body",
      scheduledDate: "2026-03-04",
    });
  });

  it("emits Corvo-compliant frontmatter and preserves plain markdown images", async () => {
    mockGitHubSuccess();

    await createBlogPostPR({
      title: 'He said "hello"',
      content: [
        "# He said hello",
        "",
        `![hero_image](${HERO_URL})`,
        "",
        "Intro paragraph.",
        "",
        `![asset1_chart](${SECOND_URL})## The details`,
        "",
        "More body.",
      ].join("\n"),
      scheduledDate: "2026-03-04",
      scheduledTime: "13:30",
      timezone: "America/Los_Angeles",
      status: "scheduled",
      subtitle: "A subtitle",
      excerpt: 'Line one\nLine "two"',
      author: "Jake Butler",
      tags: ["ai", 'quote "heavy"'],
      category: "strategy",
      featured: true,
      coverImageAlt: "A descriptive hero image.",
      images: [
        {
          sourceUrl: HERO_URL,
          alt: "A descriptive hero image.",
          isCover: true,
        },
        {
          sourceUrl: SECOND_URL,
          alt: "Flowchart of the generation workflow",
        },
      ],
    });

    // Six fetches: repo → branch ref → create branch → existing file lookup → create file → open PR.
    // No image downloads and no asset commits — Convex URLs stay absolute.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(6);

    const mdxCall = vi.mocked(fetch).mock.calls[4];
    expect(mdxCall[0]).toContain(
      "/contents/corvo-labs-enhanced/content/blog/2026-03-04-he-said-hello.mdx"
    );

    const body = JSON.parse((mdxCall[1] as RequestInit).body as string);
    const decoded = Buffer.from(body.content, "base64").toString("utf-8");

    expect(decoded).toContain('title: "He said \\"hello\\""');
    expect(decoded).toContain('date: "2026-03-04"');
    expect(decoded).toContain('scheduledTime: "13:30"');
    expect(decoded).toContain('timezone: "America/Los_Angeles"');
    expect(decoded).toContain('subtitle: "A subtitle"');
    expect(decoded).toContain('description: "Line one Line \\"two\\""');
    expect(decoded).toContain('author: "Jake Butler"');
    expect(decoded).toContain('tags: ["ai", "quote \\"heavy\\""]');
    expect(decoded).toContain(`heroImage: "${HERO_URL}"`);
    expect(decoded).toContain('heroImageAlt: "A descriptive hero image."');
    expect(decoded).toContain('readTime: "1 min read"');
    expect(decoded).toContain('category: "strategy"');
    expect(decoded).toContain("featured: true");
    expect(decoded).toContain('status: "scheduled"');

    // Old keys must not ship.
    expect(decoded).not.toContain("coverImage:");
    expect(decoded).not.toContain("coverImageAlt:");
    expect(decoded).not.toContain("excerpt:");
    expect(decoded).not.toContain("published:");

    // Body must not contain legacy BlogImage MDX or an H1 duplicate.
    expect(decoded).not.toContain("<BlogImage");
    expect(decoded).not.toContain("# He said hello");

    // Hero image was stripped from the body (appears only in frontmatter).
    const bodyPortion = decoded.split(/^---\n(?:[\s\S]*?)\n---\n/m)[1] ?? decoded;
    expect(bodyPortion).not.toContain(HERO_URL);

    // Inline markdown image survives with the enriched alt text and its own block.
    expect(decoded).toContain(
      `![Flowchart of the generation workflow](${SECOND_URL})\n\n## The details`
    );
  });

  it("includes publish intent and preview note in the PR description", async () => {
    mockGitHubSuccess();

    await createBlogPostPR({
      title: "Hello World",
      content: "Body.",
      scheduledDate: "2026-03-04",
      scheduledTime: "09:15",
      timezone: "America/New_York",
      scheduleTrigger: "frontmatter",
      status: "scheduled",
      tags: ["ai"],
      coverImageAlt: "Hero",
      images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
    });

    const prCall = vi.mocked(fetch).mock.calls[5];
    const payload = JSON.parse((prCall[1] as RequestInit).body as string);

    expect(payload.body).toContain(
      "Publish intent: merge to publish on corvo-labs-dot-com."
    );
    expect(payload.body).toContain("Resonate run date: 2026-03-04.");
    expect(payload.body).toContain("Schedule trigger: frontmatter.");
    expect(payload.body).toContain("Scheduled time: 09:15.");
    expect(payload.body).toContain("Timezone: America/New_York.");
    expect(payload.body).toContain(
      "Schedule metadata is recorded in frontmatter and PR body for human review; Resonate will not auto-merge."
    );
    expect(payload.body).toContain(
      "Vercel preview: pending manual review, if applicable."
    );
  });

  it("throws before contacting GitHub when no image assets are provided", async () => {
    await expect(
      createBlogPostPR({
        title: "Hello World",
        content: "Body",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        tags: ["ai"],
      })
    ).rejects.toThrow(/requires at least one image/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws before contacting GitHub when images is an empty array", async () => {
    await expect(
      createBlogPostPR({
        title: "Hello World",
        content: "Body",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        tags: ["ai"],
        images: [],
      })
    ).rejects.toThrow(/requires at least one image/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws before contacting GitHub when the caller omits tags", async () => {
    await expect(
      createBlogPostPR({
        title: "Hello World",
        content: "Body",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        coverImageAlt: "Hero",
        images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
      })
    ).rejects.toThrow(BlogPostContractError);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when repo fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404 }));

    await expect(
      createBlogPostPR({
        title: "T",
        content: "x",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        tags: ["ai"],
        images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
      })
    ).rejects.toThrow("GitHub repo fetch failed");
  });

  it("throws when branch ref fetch fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }));

    await expect(
      createBlogPostPR({
        title: "T",
        content: "x",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        tags: ["ai"],
        images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
      })
    ).rejects.toThrow("GitHub branch fetch failed");
  });

  it("throws when create branch fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "already exists" }), { status: 422 })
      );

    await expect(
      createBlogPostPR({
        title: "T",
        content: "x",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        tags: ["ai"],
        images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
      })
    ).rejects.toThrow("GitHub create branch failed");
  });

  it("throws when create file fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "not found" }), { status: 404 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "conflict" }), { status: 409 })
      );

    await expect(
      createBlogPostPR({
        title: "T",
        content: "x",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        tags: ["ai"],
        images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
      })
    ).rejects.toThrow("GitHub create file failed");
  });

  it("throws when create PR fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "not found" }), { status: 404 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "error" }), { status: 500 })
      );

    await expect(
      createBlogPostPR({
        title: "T",
        content: "x",
        scheduledDate: "2026-03-04",
        status: "scheduled",
        tags: ["ai"],
        images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
      })
    ).rejects.toThrow("GitHub create PR failed");
  });

  it("updates the MDX file when the retry branch already contains it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ default_branch: "main" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: { sha: "abc" } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Reference already exists" }), {
          status: 422,
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "existing-file-sha" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            html_url: "https://github.com/org/repo/pull/9",
            number: 9,
            state: "open",
          }),
          {
            status: 200,
          }
        )
      );

    const result = await createBlogPostPR({
      title: "Retry Me",
      content: "Body.",
      scheduledDate: "2026-03-04",
      status: "scheduled",
      tags: ["ai"],
      coverImageAlt: "Hero",
      images: [{ sourceUrl: HERO_URL, alt: "Hero", isCover: true }],
    });

    const fileCall = vi.mocked(fetch).mock.calls[4];
    const payload = JSON.parse((fileCall[1] as RequestInit).body as string);

    expect(result.prUrl).toBe("https://github.com/org/repo/pull/9");
    expect(result.sanitizedResponse).toMatchObject({
      number: 9,
      state: "open",
      scheduledDate: "2026-03-04",
    });
    expect(payload.sha).toBe("existing-file-sha");
  });
});

describe("patchFrontmatterSchedule", () => {
  it("updates schedule fields while preserving the MDX body", () => {
    const sample = `---\ndate: "2026-03-04"\nscheduledTime: "09:00"\n---\n\nBody.\n`;
    const updated = patchFrontmatterSchedule(sample, {
      scheduledDate: "2026-06-20",
      scheduledTime: "14:45",
      timezone: "America/New_York",
    });
    expect(updated).toContain('date: "2026-06-20"');
    expect(updated).toContain('scheduledTime: "14:45"');
    expect(updated).toContain("Body.");
  });
});

describe("offline publication package", () => {
  it.each(["Fixture editor", "Reader ] one", "Reader $& one", "Reader $' one"])("includes a deterministic figure with label %s and rewrites its exact placement", async (label) => {
    const { prepareBlogPublication } = await import("../github");
    const { planFigureCandidates, figureSignatures, assertFigureInsertionAnchor, buildFigureMarkdownBlock } = await import("../visualFigures");
    const article = { id: "fixture-article", name: "Fictional fixture", format: "markdown" as const, purpose: "article" as const, content: `## Fictional relationship\n\n| from | to | relation |\n|---|---|---|\n| ${label} | Fixture draft | revises |` };
    const spec = planFigureCandidates(article, []).candidates[0];
    const signature = await figureSignatures(spec);
    const heroBytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
    const anchorEnd = assertFigureInsertionAnchor(article.content, spec.insertionAnchor);
    const content = `${article.content.slice(0, anchorEnd)}\n\n${buildFigureMarkdownBlock("fixture", spec)}${article.content.slice(anchorEnd)}`;
    const prepared = await prepareBlogPublication({ postId: "fixture-post", title: "LOCAL FIXTURE", content, scheduledDate: "2026-09-30", status: "draft", tags: ["fixture"], slug: "local-fixture", images: [
      { sourceUrl: "fixture://hero", alt: "Fictional teal test pattern", isCover: true, export: { bytes: heroBytes, sha256: createHash("sha256").update(heroBytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp", hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt", approvedBy: "test-reviewer", approvedAt: 1 } } },
      { sourceUrl: "resonate-figure://fixture", alt: spec.presentation.alt, export: { bytes: new TextEncoder().encode(signature.svg), sha256: signature.svgSha256, fileName: "figure-fixture.svg", contentType: "image/svg+xml", figure: { spec, ...signature, postId: "fixture-post", postContentSha256: createHash("sha256").update(content).digest("hex"), postContentFingerprint: `LOCAL FIXTURE\n${content}`, acceptedBy: "fixture-author", acceptedAt: 1, evidenceSources: [{ sourceId: article.id, sha256: createHash("sha256").update(article.content).digest("hex"), revision: 1, purpose: "article", currentSourceId: null, currentSha256: createHash("sha256").update(content).digest("hex"), currentRevision: null }] } } },
    ] });
    expect(prepared.files).toHaveLength(3);
    expect(Buffer.from(prepared.files.find(file => file.path.endsWith(".svg"))!.content, "base64").toString()).toBe(signature.svg);
    const mdx = Buffer.from(prepared.files.find(file => file.path.endsWith(".mdx"))!.content, "base64").toString();
    expect(mdx).toContain("/images/blog/local-fixture/figure-fixture.svg");
    expect(mdx).toContain(spec.presentation.caption);
    expect(mdx).toContain(spec.presentation.sourceNote);
    expect(mdx).toContain(buildFigureMarkdownBlock("fixture", spec).replace("](resonate-figure://fixture)", "](/images/blog/local-fixture/figure-fixture.svg)"));
    expect(mdx).not.toContain("resonate-figure://");
  });
  it("rejects a figure's unchanged SVG when the publication article differs from its approval snapshot", async () => {
    const { prepareBlogPublication } = await import("../github");
    const { planFigureCandidates, figureSignatures } = await import("../visualFigures");
    const spec = planFigureCandidates({ id: "fixture", name: "Fixture", format: "markdown", purpose: "article", content: "## Fixture\n\n| from | to | relation |\n|---|---|---|\n| Editor | Draft | revises |" }, []).candidates[0];
    const signature = await figureSignatures(spec);
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
    await expect(prepareBlogPublication({ postId: "fixture-post", title: "LOCAL FIXTURE", content: "Changed article\n\n![Fixture](resonate-figure://fixture)", scheduledDate: "2026-09-30", status: "draft", slug: "local-fixture", images: [
      { sourceUrl: "fixture://hero", alt: "Fixture", isCover: true, export: { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp", hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt", approvedBy: "test-reviewer", approvedAt: 1 } } },
      { sourceUrl: "resonate-figure://fixture", alt: spec.presentation.alt, export: { bytes: new TextEncoder().encode(signature.svg), sha256: signature.svgSha256, fileName: "figure-fixture.svg", contentType: "image/svg+xml", figure: { spec, ...signature, postId: "fixture-post", postContentSha256: "a".repeat(64), postContentFingerprint: "Old article", acceptedBy: "fixture-author", acceptedAt: 1, evidenceSources: [] } } },
    ] })).rejects.toThrow("reviewed article snapshot");
  });
  it("rejects offline engineering approval on the production publication path", async () => {
    const { prepareBlogPublication } = await import("../github");
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2E5B60" } }).webp().toBuffer();
    const params = { title: "LOCAL FIXTURE", content: "A fictional fixture.", scheduledDate: "2026-09-30", status: "draft", tags: ["fixture"], slug: "local-fixture", images: [{ sourceUrl: "fixture://hero", alt: "Fictional test pattern", isCover: true, export: { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp" as const, hero: { provider: "offline-fixture", model: "offline-fixture", quoteProvenance: "LOCAL OFFLINE FIXTURE", qualification: "offline-fixture" as const, approvedBy: "visual-rehearsal-only", approvedAt: 1 } } }] };
    await expect(prepareBlogPublication(params)).rejects.toThrow("Offline engineering visuals cannot be published");
  });

  it("rejects even correctly hashed SVG bytes without a deterministic figure manifest", async () => {
    const { prepareBlogPublication } = await import("../github");
    const heroBytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(prepareBlogPublication({ title: "LOCAL FIXTURE", content: "![Fixture](resonate-figure://fixture)", scheduledDate: "2026-09-30", status: "draft", tags: ["fixture"], slug: "local-fixture", images: [
      { sourceUrl: "fixture://hero", alt: "Fictional teal test pattern", isCover: true, export: { bytes: heroBytes, sha256: createHash("sha256").update(heroBytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp", hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt", approvedBy: "test-reviewer", approvedAt: 1 } } },
      { sourceUrl: "resonate-figure://fixture", alt: "Fixture", export: { bytes: svgBytes, sha256: createHash("sha256").update(svgBytes).digest("hex"), fileName: "figure-fixture.svg", contentType: "image/svg+xml" } },
    ] })).rejects.toThrow("verified deterministic figure manifest");
  });
  it("prepares the actual reader files from approved bytes without any remote write", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { prepareBlogPublication } = await import("../github");
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
    const prepared = await prepareBlogPublication({ title: "LOCAL FIXTURE", content: "A fictional fixture.", scheduledDate: "2026-09-30", status: "draft", tags: ["fixture"], slug: "local-fixture", images: [{ sourceUrl: "fixture://hero", alt: "Fictional teal test pattern", isCover: true, export: { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp", hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt", approvedBy: "test-reviewer", approvedAt: 1 } } }] });
    expect(prepared.files).toHaveLength(2);
    const image = prepared.files.find(file => file.path.endsWith("hero.webp"))!;
    expect(Array.from(Buffer.from(image.content, "base64"))).toEqual(Array.from(bytes));
    const mdx = Buffer.from(prepared.files.find(file => file.path.endsWith(".mdx"))!.content, "base64").toString();
    expect(mdx).toContain('coverImage: "/images/blog/local-fixture/hero.webp"');
    expect(mdx).toContain('coverImageAlt: "Fictional teal test pattern"');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("updatePrFrontmatter", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("commits updated schedule frontmatter when the PR branch is open", async () => {
    const sampleMdx = `---\ndate: "2026-03-04"\n---\n\nIntro.\n`;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "open" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha: "branch-sha" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "post.mdx", path: "corvo-labs-enhanced/content/blog/post.mdx", type: "file" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "file-sha", encoding: "base64", content: Buffer.from(sampleMdx).toString("base64") }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const result = await updatePrFrontmatter({ branchName: "resonate/blog-post-test", prUrl: "https://github.com/test-owner/test-repo/pull/42", scheduledDate: "2026-06-20" });
    expect(result.ok).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(5);
  });

  it("returns pr-closed when the pull request is no longer open", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ state: "closed" }), { status: 200 }));
    const result = await updatePrFrontmatter({ branchName: "resonate/blog-post-test", prUrl: "https://github.com/test-owner/test-repo/pull/42", scheduledDate: "2026-06-20" });
    expect(result).toEqual({ ok: false, reason: "pr-closed" });
  });

  it("returns branch-missing when the PR branch ref is gone", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "open" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }));
    const result = await updatePrFrontmatter({ branchName: "resonate/blog-post-missing", prUrl: "https://github.com/test-owner/test-repo/pull/42", scheduledDate: "2026-06-20" });
    expect(result).toEqual({ ok: false, reason: "branch-missing" });
  });
});
