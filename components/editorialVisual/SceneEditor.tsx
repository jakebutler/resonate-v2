"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/editorialVisual/Field";
import { StatusNote } from "@/components/editorialVisual/StatusNote";
import type { SceneConcept } from "@/lib/visualWorkflow";

export const sceneFields: [keyof SceneConcept, string][] = [["subject", "Subject"], ["metaphor", "Core metaphor"], ["action", "Visible action"], ["reveal", "Reveal"], ["articleConnection", "Article connection"], ["articleAnchor", "Article passage"]];

export function SceneEditor({ scene, disabled, generationDisabled, onSave, onGenerate }: { scene: SceneConcept; disabled: boolean; generationDisabled: boolean; onSave(scene: SceneConcept): void; onGenerate(): void }) {
  const [draft, setDraft] = useState(scene);
  const dirty = JSON.stringify(draft) !== JSON.stringify(scene);
  return <div className="space-y-3 rounded-lg border border-gray-200 p-3">
    <h3 className="text-sm font-semibold">Selected concept: {scene.title}</h3>
    <details><summary className="cursor-pointer text-sm font-semibold">Refine this scene</summary><div className="mt-3 space-y-2">
      {([["title", "Title"], ...sceneFields] as [keyof SceneConcept, string][]).map(([key, label]) => <Field key={key} label={`Refine ${label.toLowerCase()}`} value={draft[key]} onChange={value => setDraft({ ...draft, [key]: value })} multiline />)}
      <Button type="button" variant="outline" disabled={disabled || !dirty || Object.values(draft).some(value => !value.trim())} onClick={() => onSave(draft)}>Save scene refinement</Button>
    </div></details>
    {dirty && <StatusNote role="status">Save the scene refinement before generation.</StatusNote>}
    <Button type="button" disabled={disabled || generationDisabled || dirty} onClick={onGenerate}>Generate this concept</Button>
  </div>;
}
