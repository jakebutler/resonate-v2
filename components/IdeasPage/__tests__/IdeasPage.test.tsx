import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { IdeasPage } from "@/components/IdeasPage/IdeasPage";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("convex/react", () => ({
  useConvexAuth: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ideas: {
      list: "ideas:list",
      findByNormalizedSourceUrl: "ideas:findByNormalizedSourceUrl",
      getById: "ideas:getById",
      create: "ideas:create",
      appendEntry: "ideas:appendEntry",
      updateMeta: "ideas:updateMeta",
      archive: "ideas:archive",
      spawnV2Posts: "ideas:spawnV2Posts",
    },
    posts: {
      createFromIdea: "posts:createFromIdea",
    },
    v2Publishing: {
      listBrands: "v2Publishing:listBrands",
    },
  },
}));

vi.mock("@/components/BlogPostEditor/BlogPostEditor", () => ({
  BlogPostEditor: () => null,
}));

vi.mock("@/components/LinkedInPostEditor/LinkedInPostEditor", () => ({
  LinkedInPostEditor: () => null,
}));

describe("IdeasPage", () => {
  let duplicateMatches: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    duplicateMatches = [];
    vi.mocked(useConvexAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "ideas:list") return [];
      if (reference === "ideas:getById") return undefined;
      if (reference === "ideas:findByNormalizedSourceUrl") return duplicateMatches;
      if (reference === "v2Publishing:listBrands") {
        return [
          { brandId: "personal", name: "Personal" },
          { brandId: "corvo", name: "Corvo Labs" },
          { brandId: "lower-db", name: "the lower dB" },
          { brandId: "freshproof", name: "FreshProof" },
        ];
      }
      return undefined;
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue(undefined));
  });

  it("requires a note before saving", async () => {
    render(<IdeasPage />);

    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    expect(screen.getByText("Add a note before saving.")).toBeInTheDocument();
  });

  it("shows duplicate matches inline when source URL matches an existing idea", () => {
    duplicateMatches = [
      {
        _id: "idea_1" as Id<"capturedIdeas">,
        latestEntryPreview: "Existing idea",
        sourceTitle: "Episode 12",
      },
    ];

    render(<IdeasPage />);

    fireEvent.change(screen.getByLabelText("Source URL"), {
      target: { value: "https://youtube.com/watch?v=abc&utm_source=newsletter" },
    });

    expect(screen.getByText("Existing idea")).toBeInTheDocument();
  });

  it("shows a syncing state while Convex auth is still loading", () => {
    vi.mocked(useConvexAuth).mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
    });

    render(<IdeasPage />);

    expect(screen.getByText("Connecting your ideas workspace…")).toBeInTheDocument();
  });

  it("shows setup guidance when Clerk is signed in but Convex auth is unavailable", () => {
    vi.mocked(useConvexAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
    });

    render(<IdeasPage />);

    expect(
      screen.getByText("Convex auth is not ready for this session.")
    ).toBeInTheDocument();
  });
});
