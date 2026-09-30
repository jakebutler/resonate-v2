import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { parse, parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { createHash } from "node:crypto";
import {
  validateRemoteUrl,
  isRedirectStatus,
  resolveRedirectLocation,
  type LookupFn,
  type RemoteUrlCheck,
} from "./urlGuard";
export function articleTarget(canonicalUrl: string, mdxPath: string) {
  const origin = new URL(
    process.env.BLOG_SITE_ORIGIN || "https://corvolabs.com",
  );
  const slug = mdxPath
    .split("/")
    .pop()
    ?.replace(/\.mdx$/, "");
  const target = new URL(canonicalUrl);
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.port ||
    target.origin !== origin.origin ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.port ||
    !slug ||
    !/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    target.pathname !== `/blog/${slug}`
  )
    throw new Error(
      "Canonical article target is outside the allowed bound artifact.",
    );
  return target.href;
}
type HtmlNode = DefaultTreeAdapterTypes.Node;
function visible(node: HtmlNode) {
  if (!("tagName" in node)) return true;
  return (
    !["script", "style", "noscript", "template"].includes(node.tagName) &&
    !node.attrs.some(
      (a) =>
        a.name === "hidden" ||
        (a.name === "aria-hidden" && a.value === "true") ||
        (a.name === "style" &&
          /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.value)),
    )
  );
}
function findElement(
  node: HtmlNode,
  tag: string,
): DefaultTreeAdapterTypes.Element | undefined {
  const pending = [node];
  let count = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++count > 50000)
      throw new Error("Article DOM exceeds bounded inspection");
    if (!visible(current)) continue;
    if ("tagName" in current && current.tagName === tag) return current;
    if ("childNodes" in current)
      pending.push(...[...current.childNodes].reverse());
  }
  return undefined;
}
function elementText(node: HtmlNode): string {
  const pending: (HtmlNode | string)[] = [node];
  const out: string[] = [];
  let count = 0;
  const blocks = new Set([
    "p",
    "div",
    "section",
    "article",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ul",
    "ol",
    "table",
    "tr",
    "td",
    "th",
    "blockquote",
    "pre",
    "br",
  ]);
  while (pending.length) {
    const current = pending.pop()!;
    if (typeof current === "string") {
      out.push(current);
      continue;
    }
    if (++count > 50000)
      throw new Error("Article DOM exceeds bounded inspection");
    if (!visible(current)) continue;
    if ("value" in current) out.push(current.value);
    else if ("childNodes" in current) {
      const block = "tagName" in current && blocks.has(current.tagName);
      if (block) {
        out.push(" ");
        pending.push(" ");
      }
      pending.push(...[...current.childNodes].reverse());
    }
  }
  return out.join("");
}
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
export function expectedArticleText(markdown: string) {
  type MarkdownNode = {
    type: string;
    value?: string;
    children?: MarkdownNode[];
  };
  const root = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(markdown) as MarkdownNode;
  const pending: (MarkdownNode | string)[] = [root];
  const text: string[] = [];
  const blocks = new Set([
    "paragraph",
    "heading",
    "code",
    "blockquote",
    "table",
    "tableRow",
    "tableCell",
    "list",
    "listItem",
  ]);
  let count = 0;
  while (pending.length) {
    const node = pending.pop()!;
    if (typeof node === "string") {
      text.push(node);
      continue;
    }
    if (++count > 50000)
      throw new Error("Expected Markdown exceeds bounded inspection");
    if (node.type === "image" || node.type === "imageReference") continue;
    if (node.type === "html") {
      text.push(elementText(parseFragment(node.value ?? "")));
      continue;
    }
    const block = blocks.has(node.type);
    if (block) {
      text.push(" ");
      pending.push(" ");
    }
    if (node.value !== undefined) text.push(node.value);
    if (node.children) pending.push(...[...node.children].reverse());
  }
  return normalized(text.join(""));
}

/** DNS addresses are pinned to the TLS connection after validation (no second DNS resolution). */
async function pinnedHtml(
  url: string,
  check: RemoteUrlCheck,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const address = check.addresses[0];
    const req = request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        port: 443,
        servername: parsed.hostname,
        method: "GET",
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": "Resonate article availability check",
          Accept: "text/html",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        timeout: 10000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        if (Number(res.headers["content-length"] ?? 0) > 1000000) {
          res.destroy();
          reject(new Error("Article response too large"));
          return;
        }
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1000000) {
            res.destroy();
            reject(new Error("Article response too large"));
          } else chunks.push(Buffer.from(chunk));
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 502,
              headers: res.headers as Record<string, string>,
            }),
          ),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("Article check timed out")));
    req.on("error", reject);
    req.end();
  });
}
export async function verifyArticleAvailability(
  input: {
    canonicalUrl: string;
    mdxPath: string;
    title: string;
    content: string;
  },
  deps: {
    lookup?: LookupFn;
    read?: (url: string, check: RemoteUrlCheck) => Promise<Response>;
  } = {},
) {
  const expected = expectedArticleText(input.content);
  const expectedHash = createHash("sha256")
    .update(JSON.stringify([input.title, expected]))
    .digest("hex");
  try {
    let url = articleTarget(input.canonicalUrl, input.mdxPath);
    for (let hop = 0; hop < 3; hop++) {
      const check = await validateRemoteUrl(url, async (host) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            (deps.lookup ?? ((name) => lookup(name, { all: true })))(host),
            new Promise<import("./urlGuard").LookupAddress[]>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Article DNS timed out")),
                5000,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      });
      const response = await (deps.read ?? pinnedHtml)(url, check);
      if (isRedirectStatus(response.status)) {
        const next = resolveRedirectLocation(
          response.headers.get("location") ?? "",
          url,
        );
        if (!next || next.replace(/\/$/, "") !== input.canonicalUrl)
          throw new Error("Article redirect left the allowed target");
        url = next;
        continue;
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html")
      )
        throw new Error("Canonical article is unavailable");
      const html = await response.text();
      if (Buffer.byteLength(html) > 1000000)
        throw new Error("Article response too large");
      const dom = parse(html);
      const article = findElement(dom, "article");
      if (!article)
        throw new Error("Canonical article structure is unverified");
      const heading = findElement(article, "h1");
      const headingText = heading ? elementText(heading) : "";
      const text = normalized(elementText(article));
      if (
        normalized(headingText) !== normalized(input.title) ||
        !expected ||
        !text.includes(expected)
      )
        throw new Error(
          "Canonical page does not contain the expected title and article copy",
        );
      return {
        availability: "verified" as const,
        expectedHash,
        observedHash: createHash("sha256").update(text).digest("hex"),
      };
    }
    throw new Error("Article redirect limit exceeded");
  } catch {
    return {
      availability: "blocked" as const,
      expectedHash,
      reason:
        "Canonical article check was blocked or did not match expected content; inspect the bound page.",
    };
  }
}
