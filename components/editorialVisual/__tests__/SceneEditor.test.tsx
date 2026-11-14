import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SceneEditor } from "@/components/editorialVisual/SceneEditor";
import type { SceneConcept } from "@/lib/visualWorkflow";

const sceneFixture: SceneConcept = {
  title: "Opening shop", subject: "The raven mechanic", metaphor: "Shop as cockpit",
  action: "Opens the shutters", reveal: "Dawn on the bench",
  articleConnection: "Seasonal tune-ups", articleAnchor: "First paragraph",
};

describe("SceneEditor", () => {
  it("generates a clean scene immediately", () => {
    const onGenerate = vi.fn();
    render(<SceneEditor scene={sceneFixture} disabled={false} generationDisabled={false} onSave={() => {}} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate this concept" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
  it("gates generation behind an explicit save of the refinement draft", () => {
    const onGenerate = vi.fn();
    const onSave = vi.fn();
    render(<SceneEditor scene={sceneFixture} disabled={false} generationDisabled={false} onSave={onSave} onGenerate={onGenerate} />);
    fireEvent.change(screen.getByLabelText("Refine subject"), { target: { value: "An unsaved subject for the bench" } });
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeDisabled();
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(/Save the scene refinement before generation/);
    expect(note).toHaveTextContent("⚠");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save scene refinement" }));
    expect(onSave).toHaveBeenCalledWith({ ...sceneFixture, subject: "An unsaved subject for the bench" });
    expect(onGenerate).not.toHaveBeenCalled();
  });
  it("keeps the save disabled while any refinement field is blank", () => {
    const onSave = vi.fn();
    render(<SceneEditor scene={sceneFixture} disabled={false} generationDisabled={false} onSave={onSave} onGenerate={() => {}} />);
    fireEvent.change(screen.getByLabelText("Refine subject"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save scene refinement" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate this concept" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
