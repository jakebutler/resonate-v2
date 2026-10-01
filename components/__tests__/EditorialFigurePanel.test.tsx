import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { EditorialFigurePanel } from "@/components/EditorialFigurePanel";
import { planFigureCandidates, figureSignatures } from "@/lib/visualFigures";
import { webcrypto } from "node:crypto";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock("@/convex/_generated/api", () => ({ api: { visualFigures: Object.fromEntries(
  ["getWorkspace", "attachEvidence", "planFigures", "acceptCandidate", "declineCandidate", "editCandidate", "moveFigure", "removeFigure"].map(name => [name, `figures:${name}`]),
) } }));
let workspace: { sources: unknown[]; plan: { _id: string; reasons: string[] } | null; candidates: unknown[]; states: unknown[] };
const calls: Record<string, ReturnType<typeof vi.fn>> = {};
async function fixture() {
  const source = { id: "source-1", name: "Article draft", format: "markdown" as const, purpose: "article" as const, content: "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |" };
  const spec = planFigureCandidates(source, []).candidates[0];
  return { _id: "figure-1", spec, ...await figureSignatures(spec) };
}
describe("EditorialFigurePanel", () => {
  it("shows the exact figure alt text and explicitly includes it in the acceptance acknowledgement", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, status: "proposed", insertedBlock: null }] };
    render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    const preview = await screen.findByRole("img", { name: candidate.spec.presentation.alt });
    expect(screen.getByText(`Alt text: ${candidate.spec.presentation.alt}`)).toBeVisible();
    const acknowledgement = screen.getByRole("checkbox", { name: /reviewed.*alt text/i });
    expect(screen.getByRole("button", { name: "Accept figure" })).toBeDisabled();
    fireEvent.load(preview);
    fireEvent.click(acknowledgement);
    expect(screen.getByRole("button", { name: "Accept figure" })).toBeEnabled();
  });

  beforeEach(() => {
    vi.clearAllMocks(); workspace = { sources: [], plan: null, candidates: [], states: [] };
    vi.stubGlobal("crypto", webcrypto);
    for (const name of ["attachEvidence", "planFigures", "acceptCandidate", "declineCandidate", "editCandidate", "moveFigure", "removeFigure"]) calls[name] = vi.fn().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(((_reference: unknown, args: unknown) => args === "skip" ? undefined : workspace) as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => calls[String(reference).split(":")[1]]) as never);
  });
  it("rejects non-UTF-8 files, unsupported extensions and invalid keys without importing anything", async () => {
    render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    const malformed = new File([new Uint8Array([255])], "trace.md", { type: "text/markdown" });
    Object.defineProperty(malformed, "arrayBuffer", { value: async () => new Uint8Array([255]).buffer });
    fireEvent.change(screen.getByLabelText("Evidence file"), { target: { files: [malformed] } });
    fireEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/encoding|encoded|UTF/i);
    const unsupported = new File(["data"], "trace.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Evidence file"), { target: { files: [unsupported] } });
    fireEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    expect(await screen.findByText("Choose a .md, .txt or .csv evidence file")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Evidence key"), { target: { value: "invalid key" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    expect(await screen.findByText("Evidence key needs lowercase letters, numbers and hyphens")).toBeInTheDocument();
    expect(calls.attachEvidence).not.toHaveBeenCalled();
  });
  it("disables every card mutation while article content is unsaved", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, acceptedCandidateId: candidate._id, status: "accepted", insertedBlock: "Inserted figure" }] };
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    fireEvent.load(await screen.findByRole("img"));
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed.*evidence/i }));
    fireEvent.change(screen.getByLabelText("Figure insertion anchor"), { target: { value: "## Discussion" } });
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" savedContentChanged />);
    for (const name of ["Accept figure", "Decline figure", "Save figure edit", "Move figure", "Remove figure"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
  });
  it("never claims or replaces reserved article source keys through evidence upload", async () => {
    workspace.sources = [{ _id: "article-source", key: "article", purpose: "article", revision: 1, name: "Article draft", content: "Canonical article", parseErrors: [] }];
    calls.attachEvidence.mockResolvedValue({ sourceId: "new-source", revision: 2 });
    render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    const bytes = new TextEncoder().encode("New attachment");
    const file = new File([bytes], "trace.md", { type: "text/markdown" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    fireEvent.change(screen.getByLabelText("Evidence key"), { target: { value: "article" } });
    fireEvent.change(screen.getByLabelText("Evidence file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    expect(await screen.findByText(/article source key is reserved/)).toBeInTheDocument();
    expect(calls.attachEvidence).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Evidence key"), { target: { value: "__article__" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    expect(await screen.findByText(/article source key is reserved/)).toBeInTheDocument();
    expect(calls.attachEvidence).not.toHaveBeenCalled();
  });
  it("requires fresh human review on meaningful figure-state changes while preserving local edits", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, status: "proposed", insertedBlock: null }] };
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    fireEvent.load(await screen.findByRole("img"));
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed.*evidence/i }));
    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#C2612C" } });
    workspace = { ...workspace, states: [{ selectedCandidateId: candidate._id, status: "needs-review", insertedBlock: "Inserted figure", acceptedCandidateId: candidate._id, reviewReason: "Evidence changed" }] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("checkbox", { name: /reviewed.*evidence/i })).not.toBeChecked();
    expect(screen.getByLabelText("Accent color")).toHaveValue("#C2612C");
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed.*evidence/i }));
    workspace = { ...workspace, states: [{ selectedCandidateId: candidate._id, status: "needs-review", insertedBlock: "Inserted figure", acceptedCandidateId: candidate._id, reviewReason: "Placement changed" }] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("checkbox", { name: /reviewed.*evidence/i })).not.toBeChecked();
  });
  it("releases a bounded receipt wait with an inspect-state error without retrying an ambiguous successful mutation", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, status: "proposed", insertedBlock: null }] };
    calls.editCandidate.mockResolvedValue({ candidateId: "unseen-candidate" });
    vi.useFakeTimers();
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    try {
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#C2612C" } });
        fireEvent.click(screen.getByRole("button", { name: "Save figure edit" }));
        await Promise.resolve();
      });
      expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeDisabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(10001); });
      expect(screen.getByText(/Inspect the current saved figure state/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeEnabled();
      expect(calls.editCandidate).toHaveBeenCalledTimes(1);
      expect(calls.planFigures).not.toHaveBeenCalled();
    } finally { view.unmount(); vi.useRealTimers(); }
  });
  it("uses the returned edit identity without predicting the authoritative saved state status", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, acceptedCandidateId: candidate._id, status: "accepted", insertedBlock: "Inserted figure" }] };
    calls.editCandidate.mockResolvedValue({ candidateId: "figure-2" });
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    fireEvent.load(await screen.findByRole("img"));
    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#C2612C" } });
    fireEvent.click(screen.getByRole("button", { name: "Save figure edit" }));
    await waitFor(() => expect(calls.editCandidate).toHaveBeenCalled());
    const spec = { ...candidate.spec, presentation: { ...candidate.spec.presentation, accent: "#C2612C" } };
    workspace = { ...workspace, candidates: [{ ...candidate, _id: "figure-2", spec, ...await figureSignatures(spec) }], states: [{ selectedCandidateId: "figure-2", status: "proposed", insertedBlock: null }] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeEnabled());
  });
  it("keeps an unchanged verified image loaded through unrelated Convex query refreshes", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, status: "proposed", insertedBlock: null }] };
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    fireEvent.load(await screen.findByRole("img"));
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed.*evidence/i }));
    workspace = { ...workspace, candidates: [structuredClone(candidate)], sources: [{ _id: "extra", key: "notes", purpose: "data", revision: 1, name: "notes.txt", content: "Unrelated notes", parseErrors: [] }] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByText("notes.txt · revision 1")).toBeInTheDocument());
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(screen.getByRole("checkbox", { name: /reviewed.*evidence/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Accept figure" })).toBeEnabled();
  });
  it("fails closed on tampered SVG and rejects oversized evidence before a storage mutation", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [{ ...candidate, svg: "<svg><script>bad</script></svg>" }], states: [{ selectedCandidateId: candidate._id, status: "proposed", insertedBlock: null }] };
    const { container } = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    expect(await screen.findByText(/Stored figure preview failed verification/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("button", { name: "Accept figure" })).toBeDisabled();
    const file = new File(["x".repeat(65537)], "oversized.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Evidence file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    expect(await screen.findByText("Choose nonempty UTF-8 evidence up to 64 KiB")).toBeInTheDocument();
    expect(calls.attachEvidence).not.toHaveBeenCalled();
    expect(calls.acceptCandidate).not.toHaveBeenCalled();
  });
  it("sends exact reviewed move signatures, then enables controls only for the independently loaded moved revision", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, acceptedCandidateId: candidate._id, status: "accepted", insertedBlock: "Inserted figure" }] };
    calls.moveFigure.mockResolvedValue({ candidateId: "figure-2" });
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    fireEvent.load(await screen.findByRole("img"));
    fireEvent.change(screen.getByLabelText("Figure insertion anchor"), { target: { value: "## Discussion" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed.*evidence/i }));
    fireEvent.click(screen.getByRole("button", { name: "Move figure" }));
    await waitFor(() => expect(calls.moveFigure).toHaveBeenCalledWith({ candidateId: "figure-1", expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature, insertionAnchor: "## Discussion" }));
    expect(screen.getByRole("button", { name: "Remove figure" })).toBeDisabled();
    const spec = { ...candidate.spec, insertionAnchor: "## Discussion" };
    workspace = { ...workspace, candidates: [{ ...candidate, _id: "figure-2", spec, ...await figureSignatures(spec) }], states: [{ selectedCandidateId: "figure-2", acceptedCandidateId: "figure-2", status: "accepted", insertedBlock: "Moved figure" }] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove figure" })).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: /reviewed.*evidence/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Accept figure" })).toBeDisabled();
  });
  it("declines only an explicit unused candidate and blocks a stale source replacement after query refresh", async () => {
    const candidate = await fixture();
    workspace = { sources: [{ _id: "source-old", key: "claim-trace", revision: 1, name: "trace.md", content: "Current source", parseErrors: [] }], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, status: "proposed", insertedBlock: null }] };
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    const file = new File(["Updated source"], "trace.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText("Evidence file"), { target: { files: [file] } });
    workspace = { ...workspace, sources: [{ _id: "source-new", key: "claim-trace", revision: 2, name: "trace.md", content: "Different source", parseErrors: [] }] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    expect(screen.getByRole("button", { name: "Attach evidence" })).toBeDisabled();
    expect(screen.getByText(/Evidence changed while this file was selected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decline figure" }));
    await waitFor(() => expect(calls.declineCandidate).toHaveBeenCalledWith({ candidateId: "figure-1" }));
    workspace = { ...workspace, states: [{ selectedCandidateId: candidate._id, status: "declined", insertedBlock: null }] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Save figure edit" })).toBeDisabled();
    expect(calls.acceptCandidate).not.toHaveBeenCalled();
    expect(calls.attachEvidence).not.toHaveBeenCalled();
  });
  it("unlocks after an older accepted candidate disappears from the independently refreshed workspace on explicit removal", async () => {
    const candidate = await fixture();
    workspace = { sources: [], plan: { _id: "newer-plan", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: candidate._id, acceptedCandidateId: candidate._id, status: "accepted", insertedBlock: "Inserted figure" }] };
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove figure" }));
    await waitFor(() => expect(calls.removeFigure).toHaveBeenCalledWith({ candidateId: "figure-1" }));
    expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeDisabled();
    workspace = { ...workspace, candidates: [], states: [] };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeEnabled());
  });
  it("saves explicit evidence edits with reviewed signatures and exposes decline, move and removal controls", async () => {
    const candidate = await fixture();
    const state = { selectedCandidateId: candidate._id, acceptedCandidateId: candidate._id, status: "accepted", insertedBlock: "Inserted figure" };
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [state] };
    calls.editCandidate.mockResolvedValue({ candidateId: "figure-2" });
    render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    fireEvent.load(await screen.findByRole("img"));
    fireEvent.change(screen.getByLabelText("Accent color"), { target: { value: "#C2612C" } });
    expect(screen.getByRole("button", { name: "Accept figure" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save figure edit" }));
    await waitFor(() => expect(calls.editCandidate).toHaveBeenCalledWith({ candidateId: "figure-1", expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature,
      rows: candidate.spec.rows, palette: { background: "#ECE9E2", ink: "#22272B", accent: "#C2612C" }, insertionAnchor: "## Flow" }));
    expect(screen.getByRole("button", { name: "Move figure" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove figure" })).toBeDisabled();
  });
  it("imports bounded UTF-8 evidence with the observed source revision and displays exact contents/errors as readonly text", async () => {
    workspace.sources = [{ _id: "old-source", key: "claim-trace", revision: 1, name: "trace.md", content: "<script>archive text</script>", parseErrors: ["Malformed table"] }];
    calls.attachEvidence.mockResolvedValue({ sourceId: "new-source", revision: 2 });
    const { container } = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    expect(screen.getByText("<script>archive text</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Malformed table")).toBeInTheDocument();
    const bytes = new TextEncoder().encode("Exact uploaded claim trace\n");
    const file = new File([bytes], "trace.md", { type: "text/markdown" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
    fireEvent.change(screen.getByLabelText("Evidence file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Attach evidence" }));
    await waitFor(() => expect(calls.attachEvidence).toHaveBeenCalledWith({ postId: "post-1", key: "claim-trace", expectedSourceId: "old-source", name: "trace.md", format: "markdown", purpose: "claim-trace", content: "Exact uploaded claim trace\n" }));
  });
  it("independently renders the bound SVG, requires loaded review and sends exact preview signatures on explicit acceptance", async () => {
    const source = { id: "source-1", name: "Article draft", format: "markdown" as const, purpose: "article" as const, content: "## Flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |" };
    const spec = planFigureCandidates(source, []).candidates[0];
    const rendered = await figureSignatures(spec);
    const candidate = { _id: "figure-1", spec, ...rendered };
    workspace = { sources: [], plan: { _id: "plan-1", reasons: [] }, candidates: [candidate], states: [{ selectedCandidateId: "figure-1", status: "proposed", insertedBlock: null }] };
    render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    const preview = await screen.findByRole("img", { name: spec.presentation.alt });
    expect(preview.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByRole("button", { name: "Accept figure" })).toBeDisabled();
    fireEvent.load(preview);
    fireEvent.click(screen.getByRole("checkbox", { name: /reviewed.*evidence/i }));
    fireEvent.click(screen.getByRole("button", { name: "Accept figure" }));
    await waitFor(() => expect(calls.acceptCandidate).toHaveBeenCalledWith({ candidateId: "figure-1", expectedDataSignature: rendered.dataSignature, expectedPresentationSignature: rendered.presentationSignature }));
    expect(screen.getByText("Source: The article’s explicit relationships.")).toBeInTheDocument();
    expect(screen.getByText("| Reader | Editor | sends feedback |")).toBeInTheDocument();
  });
  it("plans only on an explicit click, blocks unsaved content, and waits for the independently reloaded plan", async () => {
    calls.planFigures.mockResolvedValue({ planId: "plan-1", candidateIds: [], reasons: [] });
    const view = render(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    expect(calls.planFigures).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Plan informational figures" }));
    await waitFor(() => expect(calls.planFigures).toHaveBeenCalledWith({ postId: "post-1" }));
    expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeDisabled();
    workspace = { ...workspace, plan: { _id: "plan-1", reasons: ["No supported explicit table in the article"] } };
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeEnabled());
    view.rerender(<EditorialFigurePanel postId="post-1" brandId="corvo" savedContentChanged />);
    expect(screen.getByRole("button", { name: "Plan informational figures" })).toBeDisabled();
  });
});
