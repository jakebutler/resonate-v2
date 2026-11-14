"use client";

import { useState } from "react";
import type { BrandId } from "@/lib/domain";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/editorialVisual/Field";
import { StatusNote } from "@/components/editorialVisual/StatusNote";
import { MAX_VISUAL_REFERENCE_BYTES, validateVisualProfileContent, type VisualGuidance } from "@/lib/visualProfile";

export type Profile = FunctionReturnType<typeof api.visualProfiles.getProfile>;
export type ProfileSave = FunctionArgs<typeof api.visualProfiles.saveRevision>;
export type ProfileSaveReceipt = FunctionReturnType<typeof api.visualProfiles.saveRevision>;

export function ProfileEditor({ brandId, profile, disabled, onSave, onUpload }: { brandId: BrandId; profile: Profile; disabled: boolean; onSave(input: ProfileSave): Promise<ProfileSaveReceipt | null>; onUpload(file: File): Promise<Id<"v2VisualReferences"> | null> }) {
  const [baseProfile, setBaseProfile] = useState(profile);
  const [ownRevisionId, setOwnRevisionId] = useState<Id<"v2VisualProfileRevisions"> | null>(null);
  const revision = baseProfile?.revision;
  const conflict = (profile?.revision._id ?? null) !== (revision?._id ?? null) && profile?.revision._id !== ownRevisionId;
  const waitingForSave = ownRevisionId !== null && profile?.revision._id !== ownRevisionId;
  // Only a returned own-save receipt advances the draft base automatically.
  if (ownRevisionId !== null && profile?.revision._id === ownRevisionId) { setBaseProfile(profile); setOwnRevisionId(null); }
  const [guidance, setGuidance] = useState<VisualGuidance>(() => ({ artDirection: revision?.artDirection ?? "", palette: revision?.palette ?? [],
    mascotGuidance: revision?.mascotGuidance ?? "", compositionGuidance: revision?.compositionGuidance ?? "", textPolicy: revision?.textPolicy ?? "", heroChartPolicy: revision?.heroChartPolicy ?? "" }));
  const [paletteText, setPaletteText] = useState(revision?.palette.map(color => `${color.name} = ${color.color}`).join("\n") ?? "");
  const [bindings, setBindings] = useState(revision?.referenceBindings ?? []);
  const [provider, setProvider] = useState(revision?.defaultRoute?.provider ?? "");
  const [model, setModel] = useState(revision?.defaultRoute?.model ?? "");
  const [validationError, setValidationError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadRole, setUploadRole] = useState<"identity" | "style" | "composition">("identity");
  const [uploadedNames, setUploadedNames] = useState<Record<string, string>>({});
  function reload() {
    const saved = profile?.revision;
    setBaseProfile(profile); setOwnRevisionId(null);
    setGuidance({ artDirection: saved?.artDirection ?? "", palette: saved?.palette ?? [], mascotGuidance: saved?.mascotGuidance ?? "", compositionGuidance: saved?.compositionGuidance ?? "", textPolicy: saved?.textPolicy ?? "", heroChartPolicy: saved?.heroChartPolicy ?? "" });
    setPaletteText(saved?.palette.map(color => `${color.name} = ${color.color}`).join("\n") ?? "");
    setBindings(saved?.referenceBindings ?? []); setProvider(saved?.defaultRoute?.provider ?? ""); setModel(saved?.defaultRoute?.model ?? "");
    setUploadedNames({}); setFile(null); setValidationError("");
  }
  function moveReference(index: number, direction: -1 | 1) {
    if (disabled) return;
    setBindings(current => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return reordered;
    });
  }
  async function upload() {
    if (!file || disabled) return;
    if (!file.size || file.size > MAX_VISUAL_REFERENCE_BYTES || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setValidationError("Choose a PNG, JPEG or WebP reference up to 5 MiB."); return;
    }
    setValidationError("");
    const referenceId = await onUpload(file);
    if (referenceId) {
      setBindings(current => [...current, { referenceId, role: uploadRole }]);
      setUploadedNames(current => ({ ...current, [referenceId]: file.name })); setFile(null);
    }
  }
  async function save() {
    if (disabled || conflict || waitingForSave) return;
    try {
      if (Boolean(provider.trim()) !== Boolean(model.trim())) throw new Error("Choose both a default provider and model, or leave both blank.");
      const palette = paletteText.split("\n").filter(line => line.trim()).map(line => {
        const match = line.match(/^(.+?)\s*=\s*(#[a-f\d]{6})\s*$/i);
        if (!match) throw new Error("Palette entries must use Name = #RRGGBB, one per line.");
        return { name: match[1].trim(), color: match[2] };
      });
      const routeChanged = provider.trim() !== (revision?.defaultRoute?.provider ?? "") || model.trim() !== (revision?.defaultRoute?.model ?? "");
      const content = { guidance: { ...guidance, palette }, referenceBindings: bindings,
        defaultRoute: routeChanged ? provider.trim() && model.trim() ? { provider: provider.trim(), model: model.trim(), qualification: "unqualified" as const } : null : revision?.defaultRoute ?? null };
      validateVisualProfileContent(content); setValidationError("");
      const receipt = await onSave({ brandId, expectedRevisionId: revision?._id ?? null, ...content });
      if (receipt) setOwnRevisionId(receipt.profileRevisionId);
    } catch (error) { setValidationError(error instanceof Error ? error.message : "Check the visual profile fields."); }
  }
  return <details open={!profile} className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Brand visual profile{revision ? ` · revision ${revision.revision}` : " · setup required"}</summary>
    <div className="mt-3 space-y-3">
      {conflict && <StatusNote role="alert">Brand profile changed in another session. Your draft is preserved; reload the saved profile to continue.</StatusNote>}
      {waitingForSave && <p role="status" className="text-sm text-gray-500">Waiting for the saved brand profile revision…</p>}
      {(conflict || waitingForSave) && <Button type="button" variant="outline" disabled={disabled} onClick={reload}>Reload saved brand profile</Button>}
      <fieldset disabled={disabled || conflict || waitingForSave} className="space-y-3">
      <Field label="Art direction" value={guidance.artDirection} onChange={artDirection => setGuidance({ ...guidance, artDirection })} multiline />
      <Field label="Palette (Name = #RRGGBB)" value={paletteText} onChange={setPaletteText} multiline />
      {([["mascotGuidance", "Mascot guidance"], ["compositionGuidance", "Composition guidance"], ["textPolicy", "Text policy"], ["heroChartPolicy", "Hero chart policy"]] as const).map(([key, label]) => <Field key={key} label={label} value={guidance[key]} onChange={value => setGuidance({ ...guidance, [key]: value })} multiline />)}
      <div className="space-y-2 text-sm">{bindings.map((binding, index) => <div key={binding.referenceId}>
        <p>{index + 1}. {binding.role} · {uploadedNames[binding.referenceId] ?? baseProfile?.references.find(reference => reference._id === binding.referenceId)?.fileName ?? binding.referenceId}</p>
        <label className="text-xs">Reference {index + 1} role <select disabled={disabled} value={binding.role} onChange={event => setBindings(bindings.map((value, i) => i === index ? { ...value, role: event.target.value as typeof binding.role } : value))} className="rounded border border-gray-200 p-1">{["identity", "style", "composition"].map(role => <option key={role}>{role}</option>)}</select></label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" aria-label={`Move reference ${index + 1} up`} disabled={disabled || index === 0} onClick={() => moveReference(index, -1)}>Move up</Button>
          <Button type="button" size="sm" variant="outline" aria-label={`Move reference ${index + 1} down`} disabled={disabled || index === bindings.length - 1} onClick={() => moveReference(index, 1)}>Move down</Button>
          <Button type="button" size="sm" variant="outline" aria-label={`Remove reference ${index + 1}`} disabled={disabled} onClick={() => setBindings(bindings.filter((_, i) => i !== index))}>Remove binding</Button>
        </div>
      </div>)}</div>
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600">Reference image<input type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block text-sm" disabled={disabled || bindings.length >= 8} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="block text-xs font-semibold text-gray-600">New reference role <select value={uploadRole} onChange={event => setUploadRole(event.target.value as typeof uploadRole)} className="rounded border border-gray-200 p-1">{["identity", "style", "composition"].map(role => <option key={role}>{role}</option>)}</select></label>
        <Button type="button" variant="outline" disabled={disabled || !file || bindings.length >= 8} onClick={() => void upload()}>Upload reference</Button>
        <p className="text-xs text-gray-500">PNG, JPEG or WebP, up to 5 MiB. Save the profile to bind uploaded references in this order.</p>
      </div>
      <Field label="Default provider (brand owner)" value={provider} onChange={setProvider} />
      <Field label="Default model (brand owner)" value={model} onChange={setModel} />
      <p className="text-xs text-gray-500">Guidance-only saves preserve the stored route. A changed route starts unqualified; only the brand owner can change it.</p>
      {validationError && <StatusNote role="alert">{validationError}</StatusNote>}
      <Button type="button" variant="outline" disabled={disabled || !guidance.artDirection.trim() || !paletteText.trim()} onClick={() => void save()}>Save brand visual profile</Button>
      </fieldset>
    </div>
  </details>;
}
