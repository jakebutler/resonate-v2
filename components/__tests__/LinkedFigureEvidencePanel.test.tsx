import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LinkedFigureEvidencePanel } from "../LinkedFigureEvidencePanel";

const { importEvidence, queries } = vi.hoisted(() => ({ importEvidence: vi.fn(), queries: { snapshot: null as unknown } }));
vi.mock("convex/react", () => ({ useQuery: () => queries.snapshot, useMutation: () => importEvidence }));
vi.mock("@/convex/_generated/api", () => ({ api: { visualLinkedEvidence: { getSnapshot: "snapshot", importLinkedEvidence: "import" } } }));

describe("linked figure evidence import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries.snapshot = { snapshotHash: "viewed-hash", expectedSourceId: null, sourceKey: "linked-research", content: "Exact fictional supporting passage", records: [{ kind: "claim", id: "claim-1", sourceIds: ["source-1"], status: "accepted", eligible: true, text: "Exact fictional supporting passage", sha256: "passage-hash", updatedAt: 1, reason: null }], reasons: [] };
    importEvidence.mockResolvedValue({ sourceId: "persisted-source", revision: 1, snapshotHash: "viewed-hash", reasons: [] });
  });

  it("requires passage inspection and explicitly imports the displayed snapshot and source revision", async () => {
    render(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    expect(screen.getByRole("button", { name: "Import linked research" })).toBeDisabled();
    expect(importEvidence).not.toHaveBeenCalled();
    expect(screen.getByText("Exact fictional supporting passage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /checked the linked passages/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import linked research" }));
    expect(importEvidence).toHaveBeenCalledWith({ postId: "post-1", expectedSnapshotHash: "viewed-hash", expectedSourceId: null });
    expect(await screen.findByText(/waiting for the saved evidence/)).toBeInTheDocument();
  });

  it("keeps excluded linked records outside the import gate", () => {
    queries.snapshot = { ...(queries.snapshot as object), content: "Snapshot audit metadata only", records: [{ kind: "claim", id: "claim-1", sourceIds: [], status: "unreviewed", eligible: false, text: "An unreviewed fictional claim", sha256: "hash", updatedAt: 1, reason: "Claim is not accepted" }] };
    render(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    expect(screen.getByRole("checkbox", { name: /checked the linked passages/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import linked research" })).toBeDisabled();
    expect(importEvidence).not.toHaveBeenCalled();
  });
  it("omits unsupported legacy links after the owned query finishes", () => {
    queries.snapshot = null;
    render(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    expect(screen.queryByText(/Loading linked research/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import linked research" })).not.toBeInTheDocument();
  });
  it("requires fresh passage review after a snapshot change and blocks unsaved article imports", () => {
    const view = render(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /checked the linked passages/ }));
    expect(screen.getByRole("button", { name: "Import linked research" })).toBeEnabled();
    queries.snapshot = { ...(queries.snapshot as object), snapshotHash: "changed-hash" };
    view.rerender(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    expect(screen.getByRole("checkbox", { name: /checked the linked passages/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Import linked research" })).toBeDisabled();
    view.rerender(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged />);
    expect(screen.getByRole("checkbox", { name: /checked the linked passages/ })).toBeDisabled();
    expect(importEvidence).not.toHaveBeenCalled();
  });
  it("observes the exact imported source revision before reporting it saved", async () => {
    const view = render(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /checked the linked passages/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import linked research" }));
    await screen.findByText(/waiting for the saved evidence/);
    queries.snapshot = { ...(queries.snapshot as object), expectedSourceId: "persisted-source" };
    view.rerender(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    expect(screen.getByText("Saved linked evidence revision observed.")).toBeInTheDocument();
    expect(screen.queryByText(/waiting for the saved evidence/)).not.toBeInTheDocument();
    expect(importEvidence).toHaveBeenCalledTimes(1);
  });
  it("expires an unobserved receipt and requires inspection without automatically repeating the import", async () => {
    vi.useFakeTimers();
    const view = render(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole("checkbox", { name: /checked the linked passages/ }));
        fireEvent.click(screen.getByRole("button", { name: "Import linked research" }));
        await Promise.resolve();
      });
      expect(screen.getByRole("button", { name: "Import linked research" })).toBeDisabled();
      await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
      expect(screen.getByRole("alert")).toHaveTextContent("Reload and inspect saved evidence");
      expect(screen.getByRole("checkbox", { name: /checked the linked passages/ })).not.toBeChecked();
      expect(importEvidence).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); vi.useRealTimers(); }
  });
  it("retires a confirmed import receipt before a later evidence head changes", async () => {
    vi.useFakeTimers();
    const view = render(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole("checkbox", { name: /checked the linked passages/ }));
        fireEvent.click(screen.getByRole("button", { name: "Import linked research" }));
        await Promise.resolve();
      });
      queries.snapshot = { ...(queries.snapshot as object), expectedSourceId: "persisted-source" };
      view.rerender(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
      expect(screen.getByText("Saved linked evidence revision observed.")).toBeInTheDocument();
      queries.snapshot = { ...(queries.snapshot as object), expectedSourceId: "newer-source", snapshotHash: "newer-hash" };
      view.rerender(<LinkedFigureEvidencePanel postId="post-1" savedContentChanged={false} />);
      expect(screen.getByRole("checkbox", { name: /checked the linked passages/ })).toBeEnabled();
      expect(screen.getByRole("checkbox", { name: /checked the linked passages/ })).not.toBeChecked();
      expect(screen.getByRole("button", { name: "Import linked research" })).toBeDisabled();
      expect(screen.queryByText(/waiting for the saved evidence/)).not.toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(importEvidence).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); vi.useRealTimers(); }
  });
});
