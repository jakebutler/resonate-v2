import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import { PostExceptionEditor, type PostContext } from "@/components/editorialVisual/PostExceptionEditor";

const context: PostContext = { title: "Seasonal tune-ups", blogSlug: "seasonal-tune-ups", channelId: "channel-1" };

function exception(id: string, guidance: string | null, revision = 1) {
  return { _id: id, guidance, revision } as unknown as Doc<"v2VisualPostExceptions">;
}

describe("PostExceptionEditor", () => {
  it("saves authored guidance pinned to the saved exception base", () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<PostExceptionEditor context={context} exception={exception("exception-a", "Saved guidance")} approvedSeedException disabled={false} onApply={async () => null} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Post exception guidance"), { target: { value: "Keep the seasonal framing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save post exception guidance" }));
    expect(onSave).toHaveBeenCalledWith("Keep the seasonal framing", "exception-a");
  });
  it("applies the approved article-7 hand exception and waits for its saved revision", async () => {
    const onApply = vi.fn().mockResolvedValue({ postExceptionId: "exception-own" });
    render(<PostExceptionEditor context={context} exception={null} approvedSeedException disabled={false} onApply={onApply} onSave={async () => null} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply approved article-7 hand exception" }));
    await screen.findByText(/Waiting for the saved post exception revision/);
    expect(onApply).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", { name: "Save post exception guidance" })).toBeDisabled();
  });
  it("blocks a stale draft with a non-color note and reloads the saved exception on demand", () => {
    const onSave = vi.fn().mockResolvedValue(null);
    const view = render(<PostExceptionEditor context={context} exception={exception("exception-a", "Saved guidance")} approvedSeedException disabled={false} onApply={async () => null} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Post exception guidance"), { target: { value: "My unsaved draft framing" } });
    view.rerender(<PostExceptionEditor context={context} exception={exception("exception-b", "External guidance", 2)} approvedSeedException disabled={false} onApply={async () => null} onSave={onSave} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Post exception changed in another session\. Your draft is preserved/);
    expect(alert).toHaveTextContent("⚠");
    expect(screen.getByRole("button", { name: "Save post exception guidance" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved post exception" }));
    expect(screen.getByLabelText("Post exception guidance")).toHaveValue("External guidance");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Post exception guidance"), { target: { value: "My reloaded draft framing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save post exception guidance" }));
    expect(onSave).toHaveBeenCalledWith("My reloaded draft framing", "exception-b");
  });
});
