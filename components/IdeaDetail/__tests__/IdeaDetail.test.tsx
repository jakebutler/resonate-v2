import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IdeaDetail } from "@/components/IdeaDetail/IdeaDetail";
import type { Id } from "@/convex/_generated/dataModel";

describe("IdeaDetail", () => {
  it("links an existing undated draft directly to the root composer", () => {
    render(
      <IdeaDetail
        open
        idea={{
          _id: "idea_1" as Id<"capturedIdeas">,
          status: "used",
          tags: [],
          entries: [],
          postLinks: [{
            link: { _id: "link_1" as Id<"capturedIdeaV2PostLinks">, channelId: "corvo-blog", createdAt: 0 },
            post: { _id: "post_1" as Id<"v2Posts">, title: "Unscheduled blog", status: "draft", approvalState: "unapproved", channelId: "corvo-blog" },
          }],
        }}
        onClose={vi.fn()}
        onCreateBlogPost={vi.fn()}
        onCreateLinkedInPost={vi.fn()}
      />
    );
    expect(screen.getByRole("link", { name: "Open composer for Unscheduled blog" })).toHaveAttribute("href", "/?postId=post_1");
  });

  it("shows idea entries and expose create-post actions", () => {
    render(
      <IdeaDetail
        open
        idea={{
          _id: "idea_1" as Id<"ideas">,
          status: "inbox",
          tags: ["ai"],
          sourceTitle: "Episode 12",
          sourceDomain: "spotify.com",
          entries: [
            { _id: "entry_1" as Id<"ideaEntries">, content: "First thought", createdAt: Date.now() - 1000 },
            { _id: "entry_2" as Id<"ideaEntries">, content: "Second thought", createdAt: Date.now() },
          ],
        }}
        onClose={vi.fn()}
        onCreateBlogPost={vi.fn()}
        onCreateLinkedInPost={vi.fn()}
      />
    );

    expect(screen.getByText("First thought")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create blog draft" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create LinkedIn draft" })
    ).toBeInTheDocument();
  });
});
