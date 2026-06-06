import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { IdeasPage } from "@/components/IdeasPage/IdeasPage";

vi.mock("convex/react", () => ({
  useConvexAuth: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    ideas: {
      list: "ideas:list",
      getById: "ideas:getById",
      findByNormalizedSourceUrl: "ideas:findByNormalizedSourceUrl",
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

const createIdeaMock = vi.fn().mockResolvedValue("idea_2");
const appendEntryMock = vi.fn().mockResolvedValue("entry_2");
const updateMetaMock = vi.fn().mockResolvedValue(undefined);
const archiveMock = vi.fn().mockResolvedValue(undefined);
const createPostFromIdeaMock = vi.fn().mockResolvedValue("legacy_post_1");
const spawnV2PostsMock = vi.fn().mockResolvedValue([
  { postId: "v2_post_1", intentId: "intent_1" },
]);

const ideaSummary = {
  _id: "idea_1",
  brandId: "corvo",
  status: "ready",
  tags: ["validation"],
  sourceUrl: "https://example.com/source",
  sourceTitle: "Source note",
  sourceDomain: "example.com",
  latestEntryPreview: "Draft from this source idea.",
  lastCapturedAt: 1812758400000,
  createdAt: 1812758400000,
  updatedAt: 1812758400000,
};

const ideaDetail = {
  ...ideaSummary,
  entries: [
    {
      _id: "entry_1",
      content: "Draft from this source idea.",
      createdAt: 1812758400000,
    },
  ],
  postLinks: [],
  v2PostLinks: [],
};

describe("IdeasPage v2 idea flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConvexAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
    });
    vi.mocked(useQuery).mockImplementation((reference, args) => {
      if (reference === "ideas:list") return [ideaSummary];
      if (reference === "ideas:getById" && args !== "skip") return ideaDetail;
      if (reference === "ideas:findByNormalizedSourceUrl") return [];
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
    vi.mocked(useMutation).mockImplementation((reference) => {
      switch (reference) {
        case "ideas:create":
          return createIdeaMock;
        case "ideas:appendEntry":
          return appendEntryMock;
        case "ideas:updateMeta":
          return updateMetaMock;
        case "ideas:archive":
          return archiveMock;
        case "ideas:spawnV2Posts":
          return spawnV2PostsMock;
        case "posts:createFromIdea":
          return createPostFromIdeaMock;
        default:
          throw new Error(`Unexpected mutation reference: ${String(reference)}`);
      }
    });
  });

  it("captures a brand-assigned idea with normalized source metadata", async () => {
    render(<IdeasPage />);

    fireEvent.change(screen.getByLabelText("Brand"), {
      target: { value: "freshproof" },
    });
    fireEvent.change(screen.getByLabelText("Idea note"), {
      target: { value: "Use this clinical source in a FreshProof draft." },
    });
    fireEvent.change(screen.getByLabelText("Source URL"), {
      target: { value: "https://Example.com/post/?utm_source=newsletter&id=42" },
    });
    fireEvent.change(screen.getByLabelText("Tags"), {
      target: { value: "GLP-1, Evidence, glp-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save idea" }));

    await waitFor(() => {
      expect(createIdeaMock).toHaveBeenCalledWith({
        brandId: "freshproof",
        content: "Use this clinical source in a FreshProof draft.",
        tags: ["glp-1", "evidence"],
        sourceUrl: "https://Example.com/post/?utm_source=newsletter&id=42",
        normalizedSourceUrl: "https://example.com/post?id=42",
      });
    });
  });

  it("spawns linked v2 drafts for all MVP channels from one idea", async () => {
    render(<IdeasPage />);

    fireEvent.click(screen.getByText("Draft from this source idea."));
    fireEvent.click(screen.getByRole("button", { name: "All MVP posts" }));

    await waitFor(() => {
      expect(spawnV2PostsMock).toHaveBeenCalledWith({
        ideaId: "idea_1",
        brandId: "corvo",
        channelIds: ["linkedin", "reddit", "corvo-blog"],
      });
    });
  });
});
