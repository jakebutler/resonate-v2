import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileEditor, type Profile } from "@/components/editorialVisual/ProfileEditor";

const profileFixture = {
  revision: { _id: "profile-v1", revision: 1,
    artDirection: "Layered matte paper", palette: [{ name: "Teal", color: "#2E5B60" }],
    mascotGuidance: "Approved raven identity", compositionGuidance: "Show the action",
    textPolicy: "Only necessary specified strings", heroChartPolicy: "Illustrative graphics",
    referenceBindings: [{ referenceId: "raven", role: "identity" }, { referenceId: "paper", role: "style" }],
    defaultRoute: { provider: "offline-fixture", model: "offline-fixture", qualification: "unqualified" as const },
  },
  references: [{ _id: "raven", fileName: "raven.png" }, { _id: "paper", fileName: "paper.png" }],
} as unknown as Profile;

function pngFile(name: string) {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  const file = new File([bytes], name, { type: "image/png" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  return file;
}

describe("ProfileEditor", () => {
  it("saves brand guidance against its revision while preserving ordered references and the unqualified route", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<ProfileEditor brandId="corvo" profile={profileFixture} disabled={false} onSave={onSave} onUpload={async () => null} />);
    fireEvent.change(screen.getByLabelText("Art direction"), { target: { value: "Matte paper with visible fibers" } });
    fireEvent.click(screen.getByRole("button", { name: "Save brand visual profile" }));
    const { _id, referenceBindings, defaultRoute, artDirection, palette, mascotGuidance, compositionGuidance, textPolicy, heroChartPolicy } = profileFixture.revision;
    const guidance = { artDirection, palette, mascotGuidance, compositionGuidance, textPolicy, heroChartPolicy };
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ brandId: "corvo", expectedRevisionId: _id,
      guidance: { ...guidance, artDirection: "Matte paper with visible fibers" }, referenceBindings, defaultRoute }));
    expect(screen.getByText(/1. identity · raven.png/)).toBeInTheDocument();
    expect(screen.getByText(/2. style · paper.png/)).toBeInTheDocument();
  });
  it("surfaces the thrown validation message on a failed save", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Revision conflict: brand profile moved on. Reload."));
    render(<ProfileEditor brandId="corvo" profile={profileFixture} disabled={false} onSave={onSave} onUpload={async () => null} />);
    fireEvent.click(screen.getByRole("button", { name: "Save brand visual profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revision conflict: brand profile moved on. Reload.");
  });
  it("preserves a dirty profile draft across an external revision until explicit reload", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    const onUpload = vi.fn().mockResolvedValue({ referenceId: "new-reference" });
    const view = render(<ProfileEditor brandId="corvo" profile={profileFixture} disabled={false} onSave={onSave} onUpload={onUpload} />);
    fireEvent.change(screen.getByLabelText("Art direction"), { target: { value: "My unsaved paper direction" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove reference 1" }));
    fireEvent.change(screen.getByLabelText("Reference image"), { target: { files: [pngFile("my-unbound-reference.png")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload reference" }));
    await screen.findByText("2. identity · my-unbound-reference.png");
    const external = { ...profileFixture, revision: { ...profileFixture.revision, _id: "profile-external", revision: 2, artDirection: "External profile direction" } } as unknown as Profile;
    view.rerender(<ProfileEditor brandId="corvo" profile={external} disabled={false} onSave={onSave} onUpload={onUpload} />);
    expect(screen.getByLabelText("Art direction")).toHaveValue("My unsaved paper direction");
    expect(screen.getByRole("alert")).toHaveTextContent(/Brand profile changed.*draft is preserved/);
    expect(screen.getByRole("alert")).toHaveTextContent("⚠");
    expect(screen.getByRole("button", { name: "Save brand visual profile" })).toBeDisabled();
    expect(screen.queryByText("1. identity · raven.png")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload saved brand profile" }));
    expect(screen.getByLabelText("Art direction")).toHaveValue("External profile direction");
    expect(screen.queryByText(/my-unbound-reference.png/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save brand visual profile" })).toBeEnabled();
    expect(onSave).not.toHaveBeenCalled();
  });
  it("advances the profile CAS base on its own returned revision without losing local guidance", async () => {
    const onSave = vi.fn().mockResolvedValue({ profileRevisionId: "profile-own", revision: 2 });
    const view = render(<ProfileEditor brandId="corvo" profile={profileFixture} disabled={false} onSave={onSave} onUpload={async () => null} />);
    fireEvent.change(screen.getByLabelText("Art direction"), { target: { value: "My saved paper direction" } });
    fireEvent.click(screen.getByRole("button", { name: "Save brand visual profile" }));
    await screen.findByText(/Waiting for the saved brand profile revision/);
    const own = { ...profileFixture, revision: { ...profileFixture.revision, _id: "profile-own", revision: 2, artDirection: "My saved paper direction" } } as unknown as Profile;
    view.rerender(<ProfileEditor brandId="corvo" profile={own} disabled={false} onSave={onSave} onUpload={async () => null} />);
    await waitFor(() => expect(screen.queryByText(/Waiting for the saved brand profile revision/)).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Art direction"), { target: { value: "My next paper direction" } });
    fireEvent.click(screen.getByRole("button", { name: "Save brand visual profile" }));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevisionId: "profile-own", guidance: expect.objectContaining({ artDirection: "My next paper direction" }) })));
  });
  it("saves only the explicitly reordered, reassigned and retained reference bindings", async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<ProfileEditor brandId="corvo" profile={profileFixture} disabled={false} onSave={onSave} onUpload={async () => null} />);
    expect(screen.getByRole("button", { name: "Move reference 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move reference 2 down" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move reference 2 up" }));
    expect(screen.getByText("1. style · paper.png")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reference 1 role"), { target: { value: "composition" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove reference 2" }));
    expect(screen.queryByText(/identity · raven.png/)).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save brand visual profile" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expectedRevisionId: "profile-v1", referenceBindings: [{ referenceId: "paper", role: "composition" }] })));
  });
  it("rejects invalid reference type or size and enforces the eight-binding cap without uploads", async () => {
    const onUpload = vi.fn().mockResolvedValue({ referenceId: "unused" });
    const view = render(<ProfileEditor brandId="corvo" profile={profileFixture} disabled={false} onSave={async () => null} onUpload={onUpload} />);
    for (const file of [new File(["text"], "note.txt", { type: "text/plain" }), new File([], "empty.png", { type: "image/png" }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], "too-large.png", { type: "image/png" })]) {
      fireEvent.change(screen.getByLabelText("Reference image"), { target: { files: [file] } });
      fireEvent.click(screen.getByRole("button", { name: "Upload reference" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/PNG, JPEG or WebP reference up to 5 MiB/);
      expect(onUpload).not.toHaveBeenCalled();
    }
    view.unmount();
    const full = { ...profileFixture, revision: { ...profileFixture.revision, referenceBindings: Array.from({ length: 8 }, (_, index) => ({ referenceId: `reference-${index}`, role: "identity" })) } } as unknown as Profile;
    render(<ProfileEditor brandId="corvo" profile={full} disabled={false} onSave={async () => null} onUpload={onUpload} />);
    expect(screen.getByLabelText("Reference image")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload reference" })).toBeDisabled();
    expect(onUpload).not.toHaveBeenCalled();
  });
});
