import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import { CropControl, HeroReview } from "@/components/editorialVisual/HeroReview";
import { stableInputSignature } from "@/lib/visualWorkflow";

const version = {
  _id: "hero-v2", parentVersionId: null, provider: "offline-fixture", model: "offline-fixture", feedback: null,
  width: 1536, height: 1024, input: { prompt: "Pinned workshop prompt" }, url: "https://storage.example/master-v2",
  exportUrl: null, exportHash: undefined,
} as unknown as Doc<"v2VisualVersions"> & { exportUrl: string | null };

afterEach(() => { vi.restoreAllMocks(); });

describe("CropControl", () => {
  it("renders a proportional selection rectangle from the crop state", () => {
    render(<CropControl sourceWidth={1536} sourceHeight={1024} crop={{ left: 384, top: 256, width: 768, height: 512 }} onChange={() => {}} />);
    const rect = screen.getByTestId("crop-rect");
    expect(rect.style.left).toBe("25%");
    expect(rect.style.top).toBe("25%");
    expect(rect.style.width).toBe("50%");
    expect(rect.style.height).toBe("50%");
  });
  it("reflects numeric fine-tune edits, including non-integer drafts, clamped for display", () => {
    render(<CropControl sourceWidth={1536} sourceHeight={1024} crop={{ left: 200, top: 0, width: 1200.5, height: 675 }} onChange={() => {}} />);
    const rect = screen.getByTestId("crop-rect");
    expect(rect.style.left).toMatch(/^13\.0\d+%$/);
    expect(Number.parseFloat(rect.style.width)).toBeCloseTo((1201 / 1536) * 100, 5);
  });
  it("moves the rectangle by dragging its body, clamped to the source bounds", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 300, height: 200, x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 200, toJSON: () => ({}) } as DOMRect);
    const onChange = vi.fn();
    render(<CropControl sourceWidth={1536} sourceHeight={1024} crop={{ left: 100, top: 20, width: 800, height: 600 }} onChange={onChange} />);
    const rect = screen.getByTestId("crop-rect");
    fireEvent.pointerDown(rect, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    // 38 px at a 5.12 source-px-per-screen-px scale ≈ 194.56 source px.
    fireEvent.pointerMove(rect, { clientX: 88, clientY: 60 });
    expect(onChange).toHaveBeenLastCalledWith({ left: 295, top: 71, width: 800, height: 600 });
    fireEvent.pointerUp(rect);
  });
  it("resizes from a corner handle and never leaves the source image", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 300, height: 200, x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 200, toJSON: () => ({}) } as DOMRect);
    const onChange = vi.fn();
    const view = render(<CropControl sourceWidth={1536} sourceHeight={1024} crop={{ left: 100, top: 20, width: 800, height: 600 }} onChange={onChange} />);
    const handle = screen.getByTestId("crop-handle-se");
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(handle, { clientX: 138, clientY: 119 });
    expect(onChange).toHaveBeenLastCalledWith({ left: 100, top: 20, width: 995, height: 697 });
    // Dragging the north-west handle past the origin clamps the rectangle inside the source.
    fireEvent.pointerDown(screen.getByTestId("crop-handle-nw"), { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(screen.getByTestId("crop-handle-nw"), { clientX: -500, clientY: -500 });
    expect(onChange).toHaveBeenLastCalledWith({ left: 0, top: 0, width: 1536, height: 1024 });
    view.unmount();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("HeroReview", () => {
  it("restores a stored manual crop into the visual control and prepares its exact presentation", async () => {
    const onPrepare = vi.fn().mockResolvedValue({});
    const stored = { ...version, exportMetadata: { width: 1600, height: 900, bytes: 120000, format: "webp", crop: JSON.stringify({ crop: { left: 100, top: 20, width: 1200, height: 675 } }) } };
    render(<HeroReview version={stored} disabled={false} onPrepare={onPrepare} onApprove={() => {}} />);
    expect(screen.getByLabelText("Crop mode")).toHaveValue("manual");
    expect(screen.getByTestId("crop-rect")).toBeInTheDocument();
    expect(screen.getByLabelText("Crop left")).toHaveValue(100);
    fireEvent.click(screen.getByRole("button", { name: "Prepare final hero crop" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith({ left: 100, top: 20, width: 1200, height: 675 }));
  });
  it("marks noncompliant exports with a non-color indicator and blocks approval", () => {
    const noncompliant = { ...version, exportHash: "export-a", exportUrl: "https://storage.example/export-a", exportMetadata: { width: 1599, height: 900, bytes: 120000, format: "webp", crop: "center" } };
    render(<HeroReview version={noncompliant} disabled={false} onPrepare={() => {}} onApprove={() => {}} />);
    const note = screen.getByRole("alert");
    expect(note).toHaveTextContent(/does not meet the 1600 × 900/);
    expect(note).toHaveTextContent("⚠");
    expect(screen.getByRole("button", { name: "Approve hero" })).toBeDisabled();
  });
  it("approves only the loaded exact export with human alt text and review", async () => {
    const onApprove = vi.fn();
    const exported = { ...version, exportHash: "export-a", exportUrl: "https://storage.example/export-a", exportMetadata: { width: 1600, height: 900, bytes: 120000, format: "webp", crop: "center" } };
    render(<HeroReview version={exported} disabled={false} onPrepare={() => {}} onApprove={onApprove} />);
    expect(screen.getByRole("button", { name: "Approve hero" })).toBeDisabled();
    fireEvent.load(screen.getByRole("img", { name: "Final hero crop preview" }));
    fireEvent.change(screen.getByLabelText("Descriptive hero alt text"), { target: { value: "A raven mechanic checks a restrained roadster." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I reviewed this crop/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve hero" }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("A raven mechanic checks a restrained roadster.", "export-a"));
    expect(stableInputSignature(exported.exportMetadata)).toEqual(expect.any(String));
  });
  it("keeps an unreviewed crop mismatch from preparing an export", () => {
    render(<HeroReview version={version} disabled={false} onPrepare={() => {}} onApprove={() => {}} />);
    fireEvent.change(screen.getByLabelText("Crop mode"), { target: { value: "manual" } });
    expect(screen.getByRole("button", { name: "Prepare final hero crop" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Crop left"), { target: { value: "100.5" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Use whole pixels inside the source image/);
    expect(screen.getByRole("button", { name: "Prepare final hero crop" })).toBeDisabled();
  });
});
