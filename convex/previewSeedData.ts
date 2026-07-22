type BrandId = "personal" | "corvo" | "lower-db" | "freshproof";
type ChannelId =
  | "linkedin"
  | "x"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "reddit"
  | "corvo-blog";

export type PreviewSeedIdea = {
  legacyId: string;
  brandId: BrandId;
  content: string;
  tags: string[];
  sourceUrl?: string;
  sourceDomain?: string;
};

export type PreviewSeedPost = {
  legacyId: string;
  brandId: BrandId;
  channelId: ChannelId;
  title: string;
  content: string;
  scheduledTime: string;
  /** Days from seed run date (0 = today). */
  dayOffset: number;
  blogExcerpt?: string;
  blogAuthor?: string;
  blogCategory?: string;
  blogTags?: string[];
  blogSlug?: string;
  heroImageUrl?: string;
};

/** Minimal preview fixtures derived from prod snapshot shapes (2026-06-06 export). */
export const previewSeedIdeas: PreviewSeedIdea[] = [
  {
    legacyId: "preview-harness-engineering",
    brandId: "corvo",
    tags: ["ai", "openai", "engineering"],
    sourceUrl:
      "https://openai.com/index/harness-engineering/?utm_campaign=applied-ai-digest-week-of-05-04",
    sourceDomain: "openai.com",
    content: `- Distill project into testable components (issues)
- Ephemeral observability per worktree (for debugging/tracing; tests do validation)
AGENTS.md file -> roadmap vs. detail
- human code review + other input act as documentation/evals to improve the system`,
  },
];

export const previewSeedPosts: PreviewSeedPost[] = [
  {
    legacyId: "preview-corvo-linkedin-harness",
    brandId: "corvo",
    channelId: "linkedin",
    title: "Harness engineering beats prompt roulette",
    content:
      "The teams shipping reliable agentic workflows treat AGENTS.md, architecture boundaries, and review feedback as evals—not optional docs.\n\nIf your harness cannot explain what changed, what was verified, and what to try next, you are not running agents. You are gambling.",
    dayOffset: 1,
    scheduledTime: "09:30",
  },
  {
    legacyId: "preview-corvo-linkedin-game-design",
    brandId: "corvo",
    channelId: "linkedin",
    title: "Game designers already understand agent guardrails",
    content:
      "Game designers are especially well equipped for agentic development. They already think in rules, roles, win conditions, and failure states.\n\nBorrow that mindset when you design approval gates and publishing workflows.",
    dayOffset: 1,
    scheduledTime: "14:00",
  },
  {
    legacyId: "preview-corvo-blog-parity",
    brandId: "corvo",
    channelId: "corvo-blog",
    title: "Preview seed: blog composer parity check",
    content: `# Preview seed: blog composer parity check

## Why this post exists

This fixture gives localhost and Vercel Preview a realistic Corvo blog draft without touching production data.

## What to verify

- Compose metadata fields save and reload
- Preview renders markdown headings instead of raw \`#\` tokens
- Approve + Open PR stays gated until required blog fields are filled

## Source note

Body copy is adapted from production research notes; scheduling metadata is synthetic for the preview sandbox.`,
    dayOffset: 3,
    scheduledTime: "10:00",
    blogExcerpt:
      "Synthetic Corvo blog fixture for preview deployments—use it to verify composer metadata, markdown preview, and PR gating.",
    blogAuthor: "Jake Butler",
    blogCategory: "strategy",
    blogTags: ["preview", "parity"],
    blogSlug: "preview-blog-composer-parity",
  },
];
