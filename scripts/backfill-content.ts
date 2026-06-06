import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright";
import {
  dedupeImportedPosts,
  normalizeImportedPost,
  type ImportedPostSeed,
  type NormalizedImportedPost,
} from "../lib/backfill";

const BLOG_INDEX_URL = "https://www.corvolabs.com/blog";
const DEFAULT_IDENTITY = JSON.stringify({
  subject: "backfill-script",
  name: "Backfill Script",
  email: "automation@corvolabs.com",
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const blogSeeds = await scrapeBlogSeeds();
  const linkedinSeeds = options.linkedinFile
    ? await readLinkedInSeeds(options.linkedinFile)
    : [];

  const normalized = dedupeImportedPosts([...blogSeeds, ...linkedinSeeds]).map(
    normalizeImportedPost
  );

  printSummary(normalized, options.write);

  if (!options.write) {
    return;
  }

  for (const batch of chunk(normalized, 10)) {
    const result = spawnSync(
      "npx",
      [
        "convex",
        "run",
        "backfill:upsertMany",
        JSON.stringify({ posts: batch }),
        "--identity",
        DEFAULT_IDENTITY,
        "--typecheck",
        "disable",
      ],
      {
        cwd: process.cwd(),
        stdio: "inherit",
      }
    );

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

async function scrapeBlogSeeds(): Promise<ImportedPostSeed[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(BLOG_INDEX_URL, { waitUntil: "networkidle", timeout: 60_000 });

    const links = dedupeImportedPosts(
      await page.$$eval('a[href*="/blog/"]', (elements) =>
        elements
          .map((element) => {
            const href = element instanceof HTMLAnchorElement ? element.href : "";
            return href;
          })
          .filter((href) => href.startsWith("https://www.corvolabs.com/blog/"))
          .map((externalUrl) => ({
            type: "blog" as const,
            externalUrl,
          }))
      )
    );

    const posts: ImportedPostSeed[] = [];

    for (const link of links) {
      await page.goto(link.externalUrl, { waitUntil: "networkidle", timeout: 60_000 });
      const post = await page.evaluate(() => {
        const contentNode = document.querySelector(".prose");
        const content =
          contentNode instanceof HTMLElement ? contentNode.innerText.trim() : "";

        return {
          title:
            document
              .querySelector('meta[property="og:title"]')
              ?.getAttribute("content")
              ?.replace(/\s+\|\s+Corvo Labs Blog$/, "") ??
            document.querySelector("h1")?.textContent?.trim() ??
            "",
          publishedDate:
            document
              .querySelector('meta[property="article:published_time"]')
              ?.getAttribute("content")
              ?.slice(0, 10) ?? "",
          externalUrl:
            document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
            window.location.href,
          content: content.replace(/\n{3,}/g, "\n\n"),
        };
      });

      posts.push({ type: "blog", ...post });
    }

    return posts;
  } finally {
    await browser.close();
  }
}

async function readLinkedInSeeds(path: string): Promise<ImportedPostSeed[]> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const posts = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { posts?: unknown }).posts)
      ? (raw as { posts: unknown[] }).posts
      : null;

  if (!posts) {
    throw new Error("LinkedIn seed file must be an array or an object with a posts array");
  }

  return posts.map(assertImportedPostSeed);
}

function assertImportedPostSeed(value: unknown): ImportedPostSeed {
  if (!value || typeof value !== "object") {
    throw new Error("LinkedIn seed entries must be objects");
  }

  const seed = value as Partial<ImportedPostSeed>;
  if (seed.type !== "blog" && seed.type !== "linkedin") {
    throw new Error("LinkedIn seed entries must include a valid type");
  }
  if (typeof seed.content !== "string") {
    throw new Error("LinkedIn seed entries must include content");
  }
  if (typeof seed.externalUrl !== "string") {
    throw new Error("LinkedIn seed entries must include externalUrl");
  }
  if (typeof seed.publishedDate !== "string") {
    throw new Error("LinkedIn seed entries must include publishedDate");
  }

  return {
    type: seed.type,
    title: typeof seed.title === "string" ? seed.title : undefined,
    content: seed.content,
    externalUrl: seed.externalUrl,
    publishedDate: seed.publishedDate,
  };
}

function parseArgs(args: string[]) {
  let write = false;
  let linkedinFile: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--linkedin-file") {
      linkedinFile = args[i + 1];
      if (!linkedinFile) {
        throw new Error("--linkedin-file requires a path");
      }
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { write, linkedinFile };
}

function printSummary(posts: NormalizedImportedPost[], write: boolean) {
  const summary = posts.reduce(
    (acc, post) => {
      acc.total += 1;
      acc[post.type] += 1;
      return acc;
    },
    { total: 0, blog: 0, linkedin: 0 }
  );

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        summary,
        posts,
      },
      null,
      2
    )
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
