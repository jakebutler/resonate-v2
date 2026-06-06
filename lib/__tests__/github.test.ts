// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

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
