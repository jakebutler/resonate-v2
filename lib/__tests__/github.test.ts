// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";

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


import sharp from "sharp";
import { createHash } from "node:crypto";

function githubFixture(options: {fail?: string; ambiguous?: string; wrongHead?: boolean; advancedMain?: boolean; rename?: boolean; duplicateCompare?: boolean; raceAfterCompare?: boolean} = {}) {
  const files = new Map<string, string>();
  const blobs = new Map<string, string>();
  let tree: {path: string; sha: string}[] = [];
  let head = "base"; let branch = false; let prCreated = false; let branchRef = "";
  let sequence = 0;
  const calls: {path: string; method: string; body: unknown}[] = [];
  let failed = false;
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input)); const path = url.pathname.replace("/repos/test-owner/test-repo", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) as {ref?: string; content: string; tree: {path:string;sha:string}[]} : undefined;
    calls.push({path, method, body});
    const response = (value: unknown, status=200) => new Response(JSON.stringify(value), {status});
    if (options.fail === path && !failed) { failed = true; return response({}, 503); }
    if (!path) return response({default_branch:"main"});
    if (path === "/git/ref/heads/main") return response({object:{sha:options.advancedMain && prCreated ? "new-base" : "base"}});
    if (path.startsWith("/git/ref/heads/")) return branch ? response({object:{sha: options.wrongHead ? "manual" : head}}) : response({},404);
    if (path === "/git/refs") {branch = true; branchRef = body!.ref!.replace(/^refs\/heads\//, ""); return response({});}
    if (path.startsWith("/contents/")) return files.has(path.slice(10)) ? response({sha:"blob-sha", encoding:"base64", content:files.get(path.slice(10))}) : response({},404);
    if (path.startsWith("/compare/")) {
      const changed = [...files.keys()].map(filename=>({filename,status:options.rename && prCreated ? "renamed" : "added",...(options.rename ? {previous_filename:"unrelated.txt"} : {})}));
      if (options.duplicateCompare && prCreated) changed[changed.length - 1] = changed[0];
      const result = {status:options.advancedMain && prCreated ? "diverged" : "ahead",ahead_by:1,merge_base_commit:{sha:"base"},total_commits:1,files:changed};
      if (options.raceAfterCompare && prCreated) { head = "changed-with-unrelated-commit"; files.set("unrelated.txt", "dW5yZWxhdGVk"); }
      return response(result);
    }
    if (path.startsWith("/git/commits/") && method === "GET") return response({tree:{sha:"base-tree"}});
    if (path === "/git/blobs") {const sha = `blob-${++sequence}`; blobs.set(sha,body!.content); return response({sha});}
    if (path === "/git/trees") {tree=body!.tree;return response({sha:"tree"});}
    if (path === "/git/commits") return response({sha:"commit"});
    if (path.startsWith("/git/refs/heads/")) {head="commit";for (const f of tree) files.set(f.path,blobs.get(f.sha)!); if (options.ambiguous === "ref" && !failed) {failed=true;throw new Error("timeout");} return response({});}
    if (path === "/pulls" && method === "GET") return response(prCreated ? [{html_url:"https://github.com/test-owner/test-repo/pull/1",number:1,state:"open",head:{sha:head,ref:branchRef,repo:{full_name:"test-owner/test-repo"}},base:{ref:"main",repo:{full_name:"test-owner/test-repo"}}}] : []);
    if (path === "/pulls" && method === "POST") {prCreated=true; if(options.ambiguous === "pr" && !failed){failed=true;throw new Error("timeout");}return response({html_url:"https://github.com/test-owner/test-repo/pull/1",number:1,state:"open",head:{sha:head,ref:branchRef,repo:{full_name:"test-owner/test-repo"}},base:{ref:"main",repo:{full_name:"test-owner/test-repo"}}});}
    throw new Error(`Unexpected mock request: ${method} ${path}`);
  });
  vi.stubGlobal("fetch",mock);
  return {files,calls,mock,blobs,setHead(value:string){head=value;branch=true;}};
}
async function exportInput() {
  const bytes = await sharp({create:{width:1600,height:900,channels:3,background:"#15616d"}}).webp().toBuffer();
  return {title:"Prepared article",content:"Exact approved prose.\n\n## Evidence\n\nOne claim [with source](https://example.org).\n",scheduledDate:"2026-10-07",scheduledTime:"09:00",timezone:"America/Los_Angeles",status:"published",tags:["strategy"],coverImageAlt:"  Exact reviewed alt.  ",images:[{sourceUrl:HERO_URL,isCover:true}],preparedHero:{bytes,sha256:createHash("sha256").update(bytes).digest("hex")},exportIdentity:"sanitized-post-1"};
}
describe("complete atomic blog exports", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("refuses a foreign existing generated-visual asset directory before creating its branch", async () => {
    const fixture = githubFixture();
    const input = await exportInput();
    fixture.files.set("corvo-labs-enhanced/public/images/blog/2026-10-07-prepared-article", "foreign-directory");
    const generated = { ...input, coverImageAlt: "Reviewed hero", preparedHero: undefined, images: [{ sourceUrl: HERO_URL, alt: "Reviewed hero", isCover: true, export: { ...input.preparedHero, fileName: "hero.webp", contentType: "image/webp" as const, hero: { provider: "openai", model: "approved-model", quoteProvenance: "verified-bounded-receipt", qualification: "live-receipt" as const, approvedBy: "reviewer", approvedAt: 1 } } }] };
    await expect(createBlogPostPR(generated)).rejects.toThrow("Publication asset directory already exists");
    expect(fixture.calls.every(call => call.method === "GET")).toBe(true);
  });
  it("preserves exact approved author, category and excerpt in the merged prepared export", async () => {
    const fixture = githubFixture();
    const input = { ...await exportInput(), author: "  Approved Author  ", category: "  strategy  ", excerpt: "  Exact approved excerpt.  " };
    const result = await createBlogPostPR(input);
    const mdx = Buffer.from(fixture.files.get(result.sanitizedResponse.artifact!.mdxPath)!, "base64").toString();
    expect(mdx).toContain(`author: ${JSON.stringify(input.author)}`);
    expect(mdx).toContain(`category: ${JSON.stringify(input.category)}`);
    expect(mdx).toContain(`description: ${JSON.stringify(input.excerpt)}`);
  });
  it("rejects a cover-alt override that differs from the generated hero approval", async () => {
    const input = await exportInput();
    const fixture = githubFixture();
    await expect(createBlogPostPR({ ...input, preparedHero: undefined, coverImageAlt: "Changed, unreviewed alt", images: [{ sourceUrl: HERO_URL, alt: "Exact approved visual alt", isCover: true, export: { ...input.preparedHero, fileName: "hero.webp", contentType: "image/webp", hero: { provider: "openai", model: "approved-model", quoteProvenance: "verified-bounded-receipt", qualification: "live-receipt", approvedBy: "reviewer", approvedAt: 1 } } }] })).rejects.toThrow("Cover alternative text differs");
    expect(fixture.mock).not.toHaveBeenCalled();
  });
  it.each(["qualification-probe", "offline-fixture"] as const)("rejects %s even when a matching prepared upload receipt is also supplied", async qualification => {
    const input = await exportInput();
    const fixture = githubFixture();
    await expect(createBlogPostPR({ ...input, coverImageAlt: "Reviewed hero", images: [{ sourceUrl: HERO_URL, alt: "Reviewed hero", isCover: true, export: { ...input.preparedHero, fileName: "hero.webp", contentType: "image/webp", hero: { provider: "openai", model: "approved-model", quoteProvenance: "verified-bounded-receipt", qualification, approvedBy: "reviewer", approvedAt: 1 } } }] })).rejects.toThrow("cannot be published");
    expect(fixture.mock).not.toHaveBeenCalled();
  });
  it("commits exactly the article and local WebP together and replays without writes", async () => {
    const fixture=githubFixture(); const input=await exportInput(); const result=await createBlogPostPR(input);
    expect(fixture.files.size).toBe(2);
    const artifact=result.sanitizedResponse.artifact!;
    const mdx=Buffer.from(fixture.files.get(artifact.mdxPath)!,"base64").toString();
    expect(mdx).toContain('coverImage: "/images/blog/2026-10-07-prepared-article/hero.webp"');
    expect(mdx).toContain('coverImageAlt: "  Exact reviewed alt.  "');
    expect(mdx).toContain('status: "published"'); expect(mdx).not.toMatch(/^heroImage(?:Alt)?:/m);
    expect(mdx.slice(mdx.indexOf("\n---\n")+5)).toBe("\n"+input.content);
    expect(Buffer.from(fixture.files.get(artifact.heroPath!)!,"base64")).toEqual(input.preparedHero.bytes);
    const writes=fixture.calls.filter(c=>c.method!=="GET").length;
    expect((await createBlogPostPR(input)).prUrl).toBe(result.prUrl);
    expect(fixture.calls.filter(c=>c.method!=="GET")).toHaveLength(writes);
  });
  it.each(["duplicateCompare", "raceAfterCompare"] as const)("withholds recovered export on %s without additional writes", async option => {
    const fixture = githubFixture({ [option]: true }); const input = await exportInput();
    await createBlogPostPR(input);
    const writes = fixture.calls.filter(call => call.method !== "GET").length;
    await expect(createBlogPostPR(input)).rejects.toThrow(/Needs Review/);
    expect(fixture.calls.filter(call => call.method !== "GET")).toHaveLength(writes);
  });
  it.each(["/git/blobs","/git/trees","/git/commits","/git/refs/heads/resonate%2Fblog-post-2026-10-07-prepared-article-PLACEHOLDER","/pulls"])("recovers a definitive failure at %s without partial PRs", async failure => {
    const input=await exportInput(); const fixture=githubFixture({fail:failure.replace("PLACEHOLDER",createHash("sha256").update(input.exportIdentity).digest("hex").slice(0,12))});
    await expect(createBlogPostPR(input)).rejects.toThrow();
    expect(fixture.calls.filter(c=>c.path==="/pulls"&&c.method==="POST").length).toBeLessThanOrEqual(1);
    await expect(createBlogPostPR(input)).resolves.toMatchObject({prUrl:expect.any(String)});
    expect(fixture.files.size).toBe(2);
  });
  it.each(["ref","pr"])("reads back an ambiguous %s result before retry", async ambiguous => {
    const fixture=githubFixture({ambiguous});const input=await exportInput();
    await expect(createBlogPostPR(input)).rejects.toThrow();
    const commits=fixture.calls.filter(c=>c.path==="/git/commits"&&c.method==="POST").length;
    await createBlogPostPR(input);
    expect(fixture.calls.filter(c=>c.path==="/git/commits"&&c.method==="POST")).toHaveLength(commits);
    expect(fixture.calls.filter(c=>c.path==="/pulls"&&c.method==="POST")).toHaveLength(1);
  });
  it("refuses different remote contents, unsafe paths, invalid prose, status, hashes and the exact byte cap", async () => {
    const fixture=githubFixture(); const input=await exportInput(); const result=await createBlogPostPR(input);
    fixture.files.set(result.sanitizedResponse.artifact!.mdxPath,Buffer.from("manual edit").toString("base64"));
    await expect(createBlogPostPR(input)).rejects.toThrow(/differs/);
    for (const change of [{slug:"../private"},{status:"scheduled"},{content:"# Unreviewed normalization"},{preparedHero:{bytes:Buffer.alloc(150000),sha256:"invalid"}}]) {
      fixture.mock.mockClear();await expect(createBlogPostPR({...input,...change})).rejects.toThrow();expect(fixture.mock).not.toHaveBeenCalled();
    }
  });
  it("validates copy and hero bytes before claiming the export", async () => {
    const fixture = githubFixture();
    const input = await exportInput();
    const beforeRemoteWrite = vi.fn();
    await expect(
      createBlogPostPR({
        ...input,
        content: "# Invalid body heading",
        beforeRemoteWrite,
      }),
    ).rejects.toThrow();
    expect(beforeRemoteWrite).not.toHaveBeenCalled();
    expect(fixture.mock).not.toHaveBeenCalled();
    await createBlogPostPR({ ...input, beforeRemoteWrite });
    expect(beforeRemoteWrite).toHaveBeenCalledOnce();
  });

  it("rejects unrelated changes on a recovered export branch even when both artifacts match", async () => {
    const fixture = githubFixture();
    const input = await exportInput();
    await createBlogPostPR(input);
    fixture.files.set(
      "unrelated.txt",
      Buffer.from("Unreviewed change").toString("base64"),
    );
    const before = fixture.calls.filter((c) => c.method !== "GET").length;
    await expect(createBlogPostPR(input)).rejects.toThrow(/unrelated.*diff/);
    expect(fixture.calls.filter((c) => c.method !== "GET")).toHaveLength(before);
  });

  it("reconciles a safe export after main advances without additional writes", async () => {
    const fixture = githubFixture({advancedMain: true});
    const input = await exportInput();
    const result = await createBlogPostPR(input);
    const writes = fixture.calls.filter(c => c.method !== "GET").length;
    expect((await createBlogPostPR(input)).prUrl).toBe(result.prUrl);
    expect(fixture.calls.filter(c => c.method !== "GET")).toHaveLength(writes);
  });
  it("rejects renaming an unrelated file into a matching expected artifact", async () => {
    const fixture = githubFixture({rename: true});
    const input = await exportInput();
    await createBlogPostPR(input);
    const writes = fixture.calls.filter(c => c.method !== "GET").length;
    await expect(createBlogPostPR(input)).rejects.toThrow(/unrelated.*diff/);
    expect(fixture.calls.filter(c => c.method !== "GET")).toHaveLength(writes);
  });

});

describe("bound schedule synchronization", () => {
  afterEach(() => vi.unstubAllGlobals());
  const path="corvo-labs-enhanced/content/blog/2026-10-07-target.mdx";
  const artifact={repository:"test-owner/test-repo",prNumber:1,branchName:"resonate/target",mdxPath:path,canonicalUrl:"https://corvolabs.com/blog/2026-10-07-target"};
  const params={branchName:artifact.branchName,prUrl:"https://github.com/test-owner/test-repo/pull/1",scheduledDate:"2026-10-09",scheduledTime:"09:00",timezone:"America/Los_Angeles",artifact,expectedTitle:"Prepared article",expectedSlug:"target"};
  function setup(options:{closed?:boolean;wrongBranch?:boolean;conflict?:boolean;missing?:boolean;legacyFiles?:string[]}={}) {
    const fixture=githubFixture({wrongHead:options.conflict});fixture.setHead("base");
    const old="corvo-labs-enhanced/content/blog/2020-01-01-older.mdx";
    fixture.files.set(old,Buffer.from("older article must stay byte identical").toString("base64"));
    if(!options.missing) fixture.files.set(path,Buffer.from('---\ntitle: "Prepared article"\ndate: "2026-10-07"\ncoverImage: "/hero.webp"\ncoverImageAlt: "Reviewed"\n---\nExact prose.\n').toString("base64"));
    const originalMock=fixture.mock.getMockImplementation()!;
    fixture.mock.mockImplementation(async (url,init) => {
      if(String(url).includes("/pulls/1/files")) return new Response(JSON.stringify((options.legacyFiles??[old,path]).map(filename=>({filename,status:"added"}))));
      if(String(url).endsWith("/pulls/1")) return new Response(JSON.stringify({state:options.closed?"closed":"open",head:{ref:options.wrongBranch?"other":artifact.branchName,sha:"base",repo:{full_name:artifact.repository}},base:{repo:{full_name:artifact.repository}},body:"Human review text"}));
      return originalMock(url,init);
    });
    return {fixture,old};
  }
  it("changes only the bound frontmatter and summary, preserving URL/prose/hero", async () => {
    const {fixture,old}=setup();const oldBytes=fixture.files.get(old);
    expect(await updatePrFrontmatter(params)).toMatchObject({ok:true,artifact});
    expect(fixture.files.get(old)).toBe(oldBytes);
    const out=Buffer.from(fixture.files.get(path)!,"base64").toString();
    expect(out).toContain('date: "2026-10-09"');expect(out).toContain('coverImageAlt: "Reviewed"');expect(out.endsWith("Exact prose.\n")).toBe(true);
  });
  it.each([{closed:true},{wrongBranch:true},{conflict:true},{missing:true}])("fails closed for %j", async options => {
    setup(options);expect(await updatePrFrontmatter(params)).toMatchObject({ok:false});
  });
  it("uses an unambiguous PR diff for a legacy binding and never directory-first discovery", async () => {
    const {fixture}=setup();expect(await updatePrFrontmatter({...params,artifact:undefined})).toMatchObject({ok:true,artifact:{mdxPath:path}});
    expect(fixture.mock.mock.calls.some(call=>String(call[0]).includes("/contents/corvo-labs-enhanced/content/blog?"))).toBe(false);
    setup({legacyFiles:[path,path.replace("2026-10-07","2026-10-08")]});
    expect(await updatePrFrontmatter({...params,artifact:undefined})).toEqual({ok:false,reason:"ambiguous-artifact"});
  });
  it("rejects wrong repositories without reading or writing", async () => {
    const {fixture}=setup();expect(await updatePrFrontmatter({...params,artifact:{...artifact,repository:"other/repo"}})).toEqual({ok:false,reason:"identity-mismatch"});expect(fixture.mock).not.toHaveBeenCalled();
  });
});

describe("offline publication package", () => {
  it("requires an unchanged source-note paragraph before exporting a reviewed figure", async () => {
    const { prepareBlogPublication } = await import("../github");
    const { planFigureCandidates, figureSignatures, buildFigureMarkdownBlock } = await import("../visualFigures");
    const article = { id: "fixture-article", name: "Fictional fixture", format: "markdown" as const, purpose: "article" as const, content: "## Fictional relationship\n\n| from | to | relation |\n|---|---|---|\n| Editor | Draft | revises |" };
    const spec = planFigureCandidates(article, []).candidates[0], signature = await figureSignatures(spec);
    const content = article.content.replace("## Fictional relationship", `## Fictional relationship\n\n${buildFigureMarkdownBlock("fixture", spec)} UNREVIEWED SOURCE NOTE`);
    const heroBytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
    await expect(prepareBlogPublication({ postId: "fixture-post", title: "LOCAL FIXTURE", content, scheduledDate: "2026-09-30", status: "draft", tags: ["fixture"], slug: "local-fixture", images: [
      { sourceUrl: "fixture://hero", alt: "Fictional teal test pattern", isCover: true, export: { bytes: heroBytes, sha256: createHash("sha256").update(heroBytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp", hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt", approvedBy: "test-reviewer", approvedAt: 1 } } },
      { sourceUrl: "resonate-figure://fixture", alt: spec.presentation.alt, export: { bytes: new TextEncoder().encode(signature.svg), sha256: signature.svgSha256, fileName: "figure-fixture.svg", contentType: "image/svg+xml", figure: { spec, ...signature, postId: "fixture-post", postContentSha256: createHash("sha256").update(content).digest("hex"), postContentFingerprint: `LOCAL FIXTURE\n${content}`, acceptedBy: "fixture-author", acceptedAt: 1, evidenceSources: [{ sourceId: article.id, sha256: createHash("sha256").update(article.content).digest("hex"), revision: 1, purpose: "article", currentSourceId: null, currentSha256: createHash("sha256").update(content).digest("hex"), currentRevision: null }] } } },
    ] })).rejects.toThrow(/placement|source-note/);
  });
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
    expect(mdx).toContain("/images/blog/2026-09-30-local-fixture/figure-fixture.svg");
    expect(mdx).toContain(spec.presentation.caption);
    expect(mdx).toContain(spec.presentation.sourceNote);
    expect(mdx).toContain(buildFigureMarkdownBlock("fixture", spec).replace("](resonate-figure://fixture)", "](/images/blog/2026-09-30-local-fixture/figure-fixture.svg)"));
    expect(mdx).not.toContain("resonate-figure://");
    expect(prepared.figureAssets).toEqual([{ sourceUrl: "resonate-figure://fixture", path: "corvo-labs-enhanced/public/images/blog/2026-09-30-local-fixture/figure-fixture.svg", sha256: signature.svgSha256 }]);
    const fixture = githubFixture();
    const params = { postId: "fixture-post", title: "LOCAL FIXTURE", content, scheduledDate: "2026-09-30", status: "draft", tags: ["fixture"], slug: "local-fixture", exportIdentity: "fixture-post", editorialFingerprint: "trusted-editorial-version", images: [
      { sourceUrl: "fixture://hero", alt: "Fictional teal test pattern", isCover: true, export: { bytes: heroBytes, sha256: createHash("sha256").update(heroBytes).digest("hex"), fileName: "hero.webp", contentType: "image/webp" as const, hero: { provider: "test-provider", model: "test-image-model", quoteProvenance: "reported-usage", qualification: "live-receipt" as const, approvedBy: "test-reviewer", approvedAt: 1 } } },
      { sourceUrl: "resonate-figure://fixture", alt: spec.presentation.alt, export: { bytes: new TextEncoder().encode(signature.svg), sha256: signature.svgSha256, fileName: "figure-fixture.svg", contentType: "image/svg+xml" as const, figure: { spec, ...signature, postId: "fixture-post", postContentSha256: createHash("sha256").update(content).digest("hex"), postContentFingerprint: `LOCAL FIXTURE\n${content}`, acceptedBy: "fixture-author", acceptedAt: 1, evidenceSources: [{ sourceId: article.id, sha256: createHash("sha256").update(article.content).digest("hex"), revision: 1, purpose: "article" as const, currentSourceId: null, currentSha256: createHash("sha256").update(content).digest("hex"), currentRevision: null }] } } },
    ] };
    const result = await createBlogPostPR(params);
    expect(result.sanitizedResponse.artifact).toMatchObject({ editorialFingerprint: "trusted-editorial-version", heroSha256: params.images[0].export.sha256, coverImageAlt: params.images[0].alt, heroSourceUrl: params.images[0].sourceUrl, figureAssets: prepared.figureAssets });
    expect(fixture.files.size).toBe(3);
    const writes = fixture.calls.filter(call => call.method !== "GET").length;
    expect((await createBlogPostPR(params)).prUrl).toBe(result.prUrl);
    expect(fixture.calls.filter(call => call.method !== "GET")).toHaveLength(writes);
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
    expect(mdx).toContain('coverImage: "/images/blog/2026-09-30-local-fixture/hero.webp"');
    expect(mdx).toContain('coverImageAlt: "Fictional teal test pattern"');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
