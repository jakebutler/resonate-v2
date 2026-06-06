# Inspiration & Ideas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the web-first `Inspiration & Ideas` feature with a dedicated Ideas route, note-threaded ideas, optional source attachment, and downstream post creation hooks.

**Architecture:** Ship this as a separate `ideas` domain rather than overloading `posts`. Start by wiring Clerk auth through Convex so new user-scoped idea records can be enforced in the backend, then add shared idea-domain helpers, a dedicated Ideas route, Convex-backed queries/mutations, and finally the capture/detail workflows.

**Tech Stack:** Next.js App Router, React 19, Clerk, Convex, TypeScript, Tailwind CSS v4, Vitest + React Testing Library.

---

### Task 1: Wire Clerk authentication through Convex

**Files:**
- Create: `convex/auth.config.ts`
- Create: `components/__tests__/ConvexClientProvider.test.tsx`
- Modify: `components/ConvexClientProvider.tsx`
- Modify: `.env.local.example`

**Step 1: Write the failing test**

Create `components/__tests__/ConvexClientProvider.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

const mockUseAuth = vi.fn();
const mockConvexProviderWithClerk = vi.fn(({ children }: { children: React.ReactNode }) => (
  <div data-testid="convex-provider">{children}</div>
));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("convex/react-clerk", () => ({
  ConvexProviderWithClerk: (props: { children: React.ReactNode }) =>
    mockConvexProviderWithClerk(props),
}));

describe("ConvexClientProvider", () => {
  it("wraps children with ConvexProviderWithClerk using Clerk auth", () => {
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      getToken: vi.fn(),
      orgId: null,
      orgRole: null,
    });

    render(
      <ConvexClientProvider>
        <div>child</div>
      </ConvexClientProvider>
    );

    expect(screen.getByTestId("convex-provider")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(mockConvexProviderWithClerk).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run components/__tests__/ConvexClientProvider.test.tsx
```

Expected: FAIL because `ConvexClientProvider` still uses plain `ConvexProvider`.

**Step 3: Implement the minimal auth wiring**

Update `components/ConvexClientProvider.tsx`:

```tsx
"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
```

Create `convex/auth.config.ts`:

```ts
import { type AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
```

Add to `.env.local.example`:

```env
CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-frontend-api-url
```

**Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run components/__tests__/ConvexClientProvider.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add convex/auth.config.ts components/ConvexClientProvider.tsx components/__tests__/ConvexClientProvider.test.tsx .env.local.example
git commit -m "feat: wire Clerk auth through Convex"
```

---

### Task 2: Add shared ideas domain helpers

**Files:**
- Create: `lib/ideas.ts`
- Create: `lib/__tests__/ideas.test.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/ideas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildIdeaPreview,
  normalizeIdeaSourceUrl,
  sanitizeIdeaTags,
} from "@/lib/ideas";

describe("normalizeIdeaSourceUrl", () => {
  it("removes tracking params and normalizes host casing", () => {
    expect(
      normalizeIdeaSourceUrl("https://YouTube.com/watch?v=abc&utm_source=rss&utm_medium=email")
    ).toBe("https://youtube.com/watch?v=abc");
  });

  it("returns null for empty input", () => {
    expect(normalizeIdeaSourceUrl("")).toBeNull();
  });
});

describe("sanitizeIdeaTags", () => {
  it("trims, deduplicates, and lowercases tags", () => {
    expect(sanitizeIdeaTags([" AI ", "voice", "ai", ""])).toEqual(["ai", "voice"]);
  });
});

describe("buildIdeaPreview", () => {
  it("prefers the latest entry text and truncates long previews", () => {
    expect(buildIdeaPreview("A".repeat(160))).toBe(`${"A".repeat(140)}…`);
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run lib/__tests__/ideas.test.ts
```

Expected: FAIL because `lib/ideas.ts` does not exist.

**Step 3: Implement the minimal helper module**

Create `lib/ideas.ts`:

```ts
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_KEYS = new Set(["fbclid", "gclid", "si"]);

export function normalizeIdeaSourceUrl(input?: string | null): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  url.hostname = url.hostname.toLowerCase();

  const params = new URLSearchParams(url.search);
  for (const key of Array.from(params.keys())) {
    if (
      TRACKING_PARAM_KEYS.has(key) ||
      TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      params.delete(key);
    }
  }
  url.search = params.toString() ? `?${params.toString()}` : "";

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function sanitizeIdeaTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
    )
  );
}

export function buildIdeaPreview(content: string, maxLength = 140): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}
```

**Step 4: Run the test to verify it passes**

Run:

```bash
npx vitest run lib/__tests__/ideas.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/ideas.ts lib/__tests__/ideas.test.ts
git commit -m "feat: add shared idea normalization helpers"
```

---

### Task 3: Add the Ideas route shell and top-level navigation

**Files:**
- Create: `app/ideas/page.tsx`
- Create: `app/ideas/__tests__/page.test.tsx`
- Create: `components/IdeasPage/IdeasPage.tsx`
- Modify: `app/page.tsx`

**Step 1: Write the failing test**

Create `app/ideas/__tests__/page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import IdeasRoute from "@/app/ideas/page";

vi.mock("@/components/IdeasPage/IdeasPage", () => ({
  IdeasPage: () => <div data-testid="ideas-page">Ideas page</div>,
}));

describe("/ideas", () => {
  it("renders the ideas page shell", () => {
    render(<IdeasRoute />);
    expect(screen.getByTestId("ideas-page")).toBeInTheDocument();
  });
});
```

Update `app/__tests__/page.test.tsx` with a new failing assertion:

```tsx
it("renders an Ideas navigation link", () => {
  render(<Dashboard />);
  expect(screen.getByRole("link", { name: "Ideas" })).toBeInTheDocument();
});
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run app/ideas/__tests__/page.test.tsx app/__tests__/page.test.tsx
```

Expected: FAIL because the route and nav do not exist.

**Step 3: Implement the minimal route shell**

Create `components/IdeasPage/IdeasPage.tsx`:

```tsx
"use client";

export function IdeasPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="font-forum text-3xl text-[#001524]">Inspiration & Ideas</h1>
        <p className="mt-2 text-sm text-gray-500">
          Capture ideas now, refine them later, and turn the best ones into posts.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Your ideas inbox will live here.
      </div>
    </div>
  );
}
```

Create `app/ideas/page.tsx`:

```tsx
import { IdeasPage } from "@/components/IdeasPage/IdeasPage";

export default function IdeasRoute() {
  return <IdeasPage />;
}
```

Update `app/page.tsx` header nav to include:

```tsx
<Link
  href="/ideas"
  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#001524] transition-colors"
>
  <Library size={15} />
  Ideas
</Link>
```

Use a separate icon if needed, but keep the link text exactly `Ideas` for the test.

**Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run app/ideas/__tests__/page.test.tsx app/__tests__/page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/ideas/page.tsx app/ideas/__tests__/page.test.tsx components/IdeasPage/IdeasPage.tsx app/page.tsx
git commit -m "feat: add ideas route shell and navigation"
```

---

### Task 4: Add the ideas backend schema and Convex functions

**Files:**
- Create: `convex/ideas.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/_generated/api.d.ts`
- Modify: `convex/_generated/api.js`
- Modify: `convex/_generated/dataModel.d.ts`

**Step 1: Write the failing test**

Add a failing import-and-shape test to `app/ideas/__tests__/page.test.tsx`:

```tsx
vi.mock("@/convex/_generated/api", () => ({
  api: {
    ideas: {
      list: "ideas:list",
      create: "ideas:create",
    },
  },
}));
```

Then add:

```tsx
it("loads ideas from the Convex ideas API", async () => {
  const { useQuery } = await import("convex/react");
  expect(useQuery).toBeDefined();
});
```

This test is only there to force the route task to compile once `api.ideas` is used in the next task.

**Step 2: Run the route test to verify the backend API is still missing**

Run:

```bash
npx vitest run app/ideas/__tests__/page.test.tsx
```

Expected: FAIL once the component starts referencing `api.ideas`.

**Step 3: Implement the backend**

Add `ideas`, `ideaEntries`, and `ideaPostLinks` to `convex/schema.ts`.

Suggested fields:

```ts
ideas: defineTable({
  userId: v.string(),
  status: v.union(
    v.literal("inbox"),
    v.literal("reviewing"),
    v.literal("ready"),
    v.literal("used"),
    v.literal("archived")
  ),
  tags: v.array(v.string()),
  sourceUrl: v.optional(v.string()),
  normalizedSourceUrl: v.optional(v.string()),
  sourceTitle: v.optional(v.string()),
  sourceDomain: v.optional(v.string()),
  latestEntryPreview: v.string(),
  lastCapturedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  archivedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_user_and_status", ["userId", "status"])
  .index("by_user_and_source", ["userId", "normalizedSourceUrl"]),
```

Create `convex/ideas.ts` with:

- `list`
- `getById`
- `findByNormalizedSourceUrl`
- `create`
- `appendEntry`
- `updateMeta`
- `archive`
- `remove`

Every function should require:

```ts
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new Error("Unauthorized");
const userId = identity.subject;
```

Then run codegen:

```bash
npx convex dev --once
```

If `--once` is unsupported in the local CLI version, run `npx convex dev`, wait for codegen, then stop it after generation completes.

**Step 4: Verify the backend compiles**

Run:

```bash
npx convex dev --once
npx vitest run app/ideas/__tests__/page.test.tsx
```

Expected: Convex codegen succeeds and the route test passes compilation once `api.ideas` exists.

**Step 5: Commit**

```bash
git add convex/schema.ts convex/ideas.ts convex/_generated/api.d.ts convex/_generated/api.js convex/_generated/dataModel.d.ts
git commit -m "feat: add ideas schema and convex functions"
```

---

### Task 5: Build the web capture and ideas list experience

**Files:**
- Create: `components/IdeasPage/__tests__/IdeasPage.test.tsx`
- Modify: `components/IdeasPage/IdeasPage.tsx`
- Modify: `app/ideas/page.tsx`

**Step 1: Write the failing test**

Create `components/IdeasPage/__tests__/IdeasPage.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { IdeasPage } from "@/components/IdeasPage/IdeasPage";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ideas: {
      list: "ideas:list",
      findByNormalizedSourceUrl: "ideas:findByNormalizedSourceUrl",
      create: "ideas:create",
      appendEntry: "ideas:appendEntry",
    },
  },
}));

describe("IdeasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery)
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([] as any);
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue(undefined) as any);
  });

  it("requires a note before saving", async () => {
    render(<IdeasPage />);
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));
    expect(screen.getByText("Add a note before saving.")).toBeInTheDocument();
  });

  it("shows duplicate matches inline when source URL matches an existing idea", () => {
    vi.mocked(useQuery)
      .mockReturnValueOnce([] as any)
      .mockReturnValueOnce([
        { _id: "idea_1", latestEntryPreview: "Existing idea", sourceTitle: "Episode 12" },
      ] as any);

    render(<IdeasPage />);
    fireEvent.change(screen.getByLabelText("Source URL"), {
      target: { value: "https://youtube.com/watch?v=abc&utm_source=newsletter" },
    });

    expect(screen.getByText("Existing idea")).toBeInTheDocument();
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run components/IdeasPage/__tests__/IdeasPage.test.tsx
```

Expected: FAIL because the composer and duplicate UI do not exist.

**Step 3: Implement the capture/list UI**

Update `components/IdeasPage/IdeasPage.tsx` to:

- use `useQuery(api.ideas.list, { status: activeStatus, search })`
- use `useQuery(api.ideas.findByNormalizedSourceUrl, { normalizedSourceUrl })` only when a normalized URL exists
- render a note-first composer with:
  - `textarea` labeled `Idea note`
  - `input` labeled `Source URL`
  - simple tag input/tokenizer
  - `Save idea` button
- validate note presence client-side
- show duplicate matches inline
- render status chips
- render idea rows newest-first
- hide archived by default

Use the `normalizeIdeaSourceUrl`, `sanitizeIdeaTags`, and `buildIdeaPreview` helpers from `lib/ideas.ts`.

**Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run components/IdeasPage/__tests__/IdeasPage.test.tsx app/ideas/__tests__/page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add components/IdeasPage/IdeasPage.tsx components/IdeasPage/__tests__/IdeasPage.test.tsx app/ideas/page.tsx
git commit -m "feat: add ideas capture and inbox list UI"
```

---

### Task 6: Add idea detail and promote-to-post actions

**Files:**
- Create: `components/IdeaDetail/IdeaDetail.tsx`
- Create: `components/IdeaDetail/__tests__/IdeaDetail.test.tsx`
- Modify: `components/IdeasPage/IdeasPage.tsx`
- Modify: `convex/ideas.ts`
- Modify: `convex/posts.ts`

**Step 1: Write the failing test**

Create `components/IdeaDetail/__tests__/IdeaDetail.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IdeaDetail } from "@/components/IdeaDetail/IdeaDetail";

describe("IdeaDetail", () => {
  it("shows idea entries and expose create-post actions", () => {
    render(
      <IdeaDetail
        open
        idea={{
          _id: "idea_1" as any,
          status: "inbox",
          tags: ["ai"],
          sourceTitle: "Episode 12",
          sourceDomain: "spotify.com",
          entries: [
            { _id: "entry_1" as any, content: "First thought", createdAt: Date.now() - 1000 },
            { _id: "entry_2" as any, content: "Second thought", createdAt: Date.now() },
          ],
        }}
        onClose={vi.fn()}
        onCreateBlogPost={vi.fn()}
        onCreateLinkedInPost={vi.fn()}
      />
    );

    expect(screen.getByText("First thought")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create blog draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create LinkedIn draft" })).toBeInTheDocument();
  });
});
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run components/IdeaDetail/__tests__/IdeaDetail.test.tsx
```

Expected: FAIL because the detail component does not exist.

**Step 3: Implement the minimal detail and promotion path**

Create `components/IdeaDetail/IdeaDetail.tsx` using the existing `SlideOver`.

It should:

- render the source context if present
- render the entry thread in chronological order
- allow editing status/tags/source
- expose `Create blog draft` and `Create LinkedIn draft`

Update `convex/ideas.ts` with a mutation to create an `ideaPostLinks` row after a post is created.

Update `convex/posts.ts` with a mutation or extend `create` so the UI can create a blog or LinkedIn draft from idea context while preserving the original idea.

Wire `IdeasPage.tsx` to open the detail drawer and call the promote action.

**Step 4: Run the tests to verify they pass**

Run:

```bash
npx vitest run components/IdeaDetail/__tests__/IdeaDetail.test.tsx components/IdeasPage/__tests__/IdeasPage.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add components/IdeaDetail/IdeaDetail.tsx components/IdeaDetail/__tests__/IdeaDetail.test.tsx components/IdeasPage/IdeasPage.tsx convex/ideas.ts convex/posts.ts
git commit -m "feat: add idea detail and post promotion flow"
```

---

### Task 7: Final verification and polish

**Files:**
- Modify: `README.md`
- Modify: any touched files from earlier tasks as needed

**Step 1: Add/update docs**

Update `README.md` feature list and project structure so `Inspiration & Ideas` is reflected accurately.

**Step 2: Run full verification**

Run:

```bash
npx convex dev --once
npx vitest run
```

If browser tests exist for the new route later, also run:

```bash
npm run test:e2e
```

Only run E2E if the local environment is already configured for Playwright and the app can boot with the required env vars.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document ideas feature"
```
