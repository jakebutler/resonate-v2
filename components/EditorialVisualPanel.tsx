"use client";

import type { BrandId } from "@/lib/domain";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { composeScenePrompt, stableInputSignature, type SceneConcept } from "@/lib/visualWorkflow";
import { MAX_VISUAL_REFERENCE_BYTES, validateVisualProfileContent, type VisualGuidance } from "@/lib/visualProfile";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { localFixtureTokenUrl } from "@/lib/localFixtureAuth";

export type EditorialVisualPanelProps = { postId: string; brandId: BrandId; savedContentChanged?: boolean; savedPostContext?: { title: string; blogSlug?: string; channelId: string } };
const article7Title = "What Corvo Labs learned building an AI editorial workflow";
const article7Slug = "what-corvo-labs-learned-building-an-ai-editorial-workflow";
const sceneFields: [keyof SceneConcept, string][] = [["subject", "Subject"], ["metaphor", "Core metaphor"], ["action", "Visible action"], ["reveal", "Reveal"], ["articleConnection", "Article connection"], ["articleAnchor", "Article passage"]];
const usd = (micros: number) => (micros / 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" });
type Profile = FunctionReturnType<typeof api.visualProfiles.getProfile>;
type ProfileSave = FunctionArgs<typeof api.visualProfiles.saveRevision>;
type ProfileSaveReceipt = FunctionReturnType<typeof api.visualProfiles.saveRevision>;
type ExceptionSaveReceipt = FunctionReturnType<typeof api.visualProfiles.setPostException>;
type HeroCrop = NonNullable<FunctionArgs<typeof api.visualExports.prepareHero>["crop"]>;
function Field({ label, value, onChange, multiline = false, numericBounds }: { label: string; value: string; onChange(value: string): void; multiline?: boolean; numericBounds?: { min: number; max: number } }) {
  const props = { value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), className: "mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm font-normal text-gray-900", ...(numericBounds ? { type: "number", step: 1, ...numericBounds } : {}) };
  return <label className="block text-xs font-semibold text-gray-600">{label}{multiline ? <textarea {...props} rows={3} /> : <input {...props} />}</label>;
}
function SceneEditor({ scene, disabled, generationDisabled, onSave, onGenerate }: { scene: SceneConcept; disabled: boolean; generationDisabled: boolean; onSave(scene: SceneConcept): void; onGenerate(): void }) {
  const [draft, setDraft] = useState(scene);
  const dirty = JSON.stringify(draft) !== JSON.stringify(scene);
  return <div className="space-y-3 rounded-lg border border-gray-200 p-3">
    <h3 className="text-sm font-semibold">Selected concept: {scene.title}</h3>
    <details><summary className="cursor-pointer text-sm font-semibold">Refine this scene</summary><div className="mt-3 space-y-2">
      {([["title", "Title"], ...sceneFields] as [keyof SceneConcept, string][]).map(([key, label]) => <Field key={key} label={`Refine ${label.toLowerCase()}`} value={draft[key]} onChange={value => setDraft({ ...draft, [key]: value })} multiline />)}
      <Button type="button" variant="outline" disabled={disabled || !dirty || Object.values(draft).some(value => !value.trim())} onClick={() => onSave(draft)}>Save scene refinement</Button>
    </div></details>
    {dirty && <p className="text-sm text-amber-700">Save the scene refinement before generation.</p>}
    <Button type="button" disabled={disabled || generationDisabled || dirty} onClick={onGenerate}>Generate this concept</Button>
  </div>;
}
function storedHeroCrop(version: Doc<"v2VisualVersions">): HeroCrop | null {
  try {
    const crop = JSON.parse(version.exportMetadata?.crop ?? "null")?.crop;
    if (crop && [crop.left, crop.top, crop.width, crop.height].every(Number.isSafeInteger) && crop.left >= 0 && crop.top >= 0 && crop.width > 0 && crop.height > 0 && crop.left + crop.width <= version.width && crop.top + crop.height <= version.height) return { left: crop.left, top: crop.top, width: crop.width, height: crop.height };
  } catch { /* Older presentation fixtures can have a plain descriptive crop string. */ }
  return null;
}
function HeroReview({ version, disabled, onPrepare, onApprove }: { version: Doc<"v2VisualVersions"> & { exportUrl: string | null }; disabled: boolean; onPrepare(crop?: HeroCrop): void; onApprove(alt: string, hash: string): void }) {
  const [loaded, setLoaded] = useState(false);
  const [alt, setAlt] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const storedCrop = storedHeroCrop(version);
  const [cropMode, setCropMode] = useState(storedCrop ? "manual" : "center");
  const [cropFields, setCropFields] = useState(() => ({ left: String(storedCrop?.left ?? 0), top: String(storedCrop?.top ?? 0), width: String(storedCrop?.width ?? version.width), height: String(storedCrop?.height ?? version.height) }));
  const crop = { left: Number(cropFields.left), top: Number(cropFields.top), width: Number(cropFields.width), height: Number(cropFields.height) };
  const cropValid = cropMode === "center" || Object.values(cropFields).every(value => /^\d+$/.test(value)) && Object.values(crop).every(Number.isSafeInteger) && crop.left >= 0 && crop.top >= 0 && crop.width > 0 && crop.height > 0 && crop.left + crop.width <= version.width && crop.top + crop.height <= version.height;
  const cropMatchesExport = cropValid && stableInputSignature(cropMode === "center" ? null : crop) === stableInputSignature(storedCrop);
  const exportAvailable = Boolean(version.exportHash && version.exportUrl && version.exportMetadata);
  const metadata = version.exportMetadata;
  const ready = exportAvailable && metadata?.width === 1600 && metadata.height === 900 && metadata.format === "webp" && Number.isSafeInteger(metadata.bytes) && metadata.bytes > 0 && metadata.bytes < 150000;
  return <div className="space-y-3 rounded-lg border border-gray-200 p-3">
    <h3 className="text-sm font-semibold">Final hero</h3>
    <p className="text-xs text-gray-500">Prepare a proportional 16:9 crop as 1600 × 900 WebP under 150 KB, then review the stored export.</p>
    <p className="text-xs text-gray-500">Source dimensions: {version.width} × {version.height} pixels</p>
    <label className="block text-xs font-semibold text-gray-600">Crop mode <select className="rounded border border-gray-200 p-1" value={cropMode} disabled={disabled} onChange={event => setCropMode(event.target.value)}><option value="center">Centered 16:9 crop</option><option value="manual">Manual pixel rectangle</option></select></label>
    {cropMode === "manual" && <div className="grid grid-cols-2 gap-2">{(["left", "top", "width", "height"] as const).map(key => <Field key={key} label={`Crop ${key}`} value={cropFields[key]} onChange={value => setCropFields({ ...cropFields, [key]: value })} numericBounds={{ min: key === "width" || key === "height" ? 1 : 0, max: key === "left" ? version.width - 1 : key === "top" ? version.height - 1 : key === "width" ? version.width : version.height }} />)}</div>}
    {!cropValid && <p role="alert" className="text-sm text-amber-700">Use whole pixels inside the source image, with positive width and height.</p>}
    {!cropMatchesExport && cropValid && <p className="text-sm text-amber-700">Prepare this crop, then review its saved export before approval.</p>}
    <Button type="button" variant="outline" disabled={disabled || !cropValid} onClick={() => { if (cropValid) onPrepare(cropMode === "manual" ? crop : undefined); }}>Prepare final hero crop</Button>
    {exportAvailable && <>
      {/* Display the authorized stored export directly so review cannot see a second optimized rendition. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={version.exportUrl!} alt="Final hero crop preview" onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} className="w-full rounded-lg border border-gray-200" />
      <p className="text-xs text-gray-500">{version.exportMetadata!.width} × {version.exportMetadata!.height} · {version.exportMetadata!.bytes} bytes · {version.exportMetadata!.format.toUpperCase()}</p>
      {!ready && <p role="alert" className="text-sm text-amber-700">This export does not meet the 1600 × 900 WebP and below 150,000-byte requirements. Prepare a compliant crop before approval.</p>}
      <Field label="Descriptive hero alt text" value={alt} onChange={setAlt} multiline />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed this crop for identity, story and thumbnail readability.</label>
      {version.approvedAt && version.approvedExportHash === version.exportHash && version.approvedExportMetadataSignature === stableInputSignature(version.exportMetadata) && <p className="text-sm text-green-700">Hero approval is saved.</p>}
    </>}
    <Button type="button" disabled={disabled || !cropMatchesExport || !ready || !loaded || !reviewed || alt.trim().length < 5 || alt.length > 1000} onClick={() => { if (cropMatchesExport && ready && loaded && reviewed && version.exportHash) onApprove(alt.trim(), version.exportHash); }}>Approve hero</Button>
  </div>;
}
function ProfileEditor({ brandId, profile, disabled, onSave, onUpload }: { brandId: BrandId; profile: Profile; disabled: boolean; onSave(input: ProfileSave): Promise<ProfileSaveReceipt | null>; onUpload(file: File): Promise<Id<"v2VisualReferences"> | null> }) {
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
      {conflict && <p role="alert" className="text-sm text-amber-700">Brand profile changed in another session. Your draft is preserved; reload the saved profile to continue.</p>}
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
      {validationError && <p role="alert" className="text-sm text-red-700">{validationError}</p>}
      <Button type="button" variant="outline" disabled={disabled || !guidance.artDirection.trim() || !paletteText.trim()} onClick={() => void save()}>Save brand visual profile</Button>
      </fieldset>
    </div>
  </details>;
}

function Article7ExceptionEditor({ context, exception, disabled, seedImported, onApply, onSave }: { context: NonNullable<EditorialVisualPanelProps["savedPostContext"]>; exception: Doc<"v2VisualPostExceptions"> | null; disabled: boolean; seedImported: boolean; onApply(expectedExceptionId: Id<"v2VisualPostExceptions"> | null): Promise<ExceptionSaveReceipt | null>; onSave(guidance: string, expectedExceptionId: Id<"v2VisualPostExceptions"> | null): Promise<ExceptionSaveReceipt | null> }) {
  const [baseException, setBaseException] = useState(exception);
  const [ownExceptionId, setOwnExceptionId] = useState<Id<"v2VisualPostExceptions"> | null>(null);
  const [guidance, setGuidance] = useState(exception?.guidance ?? "");
  const conflict = (exception?._id ?? null) !== (baseException?._id ?? null) && exception?._id !== ownExceptionId;
  const waitingForSave = ownExceptionId !== null && exception?._id !== ownExceptionId;
  if (ownExceptionId !== null && exception?._id === ownExceptionId) {
    setGuidance(current => current.trim() === (baseException?.guidance ?? "") ? exception.guidance : current);
    setBaseException(exception); setOwnExceptionId(null);
  }
  const dirty = guidance.trim() !== (baseException?.guidance ?? "");
  async function apply() { if (disabled || conflict || waitingForSave || !seedImported) return; const receipt = await onApply(baseException?._id ?? null); if (receipt) setOwnExceptionId(receipt.postExceptionId); }
  async function save() { if (disabled || conflict || waitingForSave || !dirty || !guidance.trim() || guidance.trim().length > 4000) return; const receipt = await onSave(guidance.trim(), baseException?._id ?? null); if (receipt) setOwnExceptionId(receipt.postExceptionId); }
  return <details className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Article-7 visual exception{baseException ? ` · revision ${baseException.revision}` : " · none saved"}</summary><div className="mt-3 space-y-3">
    {conflict && <p role="alert" className="text-sm text-amber-700">Article-7 exception changed in another session. Your draft is preserved; reload the saved exception to continue.</p>}
    {waitingForSave && <p role="status" className="text-sm text-gray-500">Waiting for the saved article-7 exception revision…</p>}
    {(conflict || waitingForSave) && <Button type="button" variant="outline" disabled={disabled} onClick={() => { setBaseException(exception); setGuidance(exception?.guidance ?? ""); setOwnExceptionId(null); }}>Reload saved article-7 exception</Button>}
    <fieldset disabled={disabled || conflict || waitingForSave} className="space-y-3">
    <p className="text-sm font-semibold">{context.title}</p><p className="text-xs text-gray-500">{context.blogSlug} · {context.channelId}</p>
    <p className="text-xs text-gray-500">The approved photographic hand is specific to this saved article. Ordinary human elements use paper construction.</p>
    {!seedImported && <p className="text-sm text-amber-700">Import the verified Corvo archive before applying its approved hand exception.</p>}
    <Button type="button" variant="outline" disabled={disabled || !seedImported} onClick={() => void apply()}>Apply approved article-7 hand exception</Button>
    <Field label="Article-7 exception guidance" value={guidance} onChange={setGuidance} multiline />
    <Button type="button" variant="outline" disabled={disabled || !dirty || !guidance.trim() || guidance.trim().length > 4000} onClick={() => void save()}>Save article-7 exception guidance</Button>
    <p className="text-xs text-gray-500">Authored guidance creates a post-specific revision. Reload if the post association or exception changes during saving.</p>
    </fieldset>
  </div></details>;
}

export function EditorialVisualPanel(props: EditorialVisualPanelProps) {
  return <SavedPostVisualPanel key={`${props.brandId}:${props.postId}`} {...props} />;
}

function SavedPostVisualPanel({ postId, brandId, savedContentChanged, savedPostContext }: EditorialVisualPanelProps) {
  const workflow = useQuery(api.visualWorkflow.get, { postId: postId as Id<"v2Posts"> });
  const profile = useQuery(api.visualProfiles.getProfile, { brandId });
  const availability = useQuery(api.visualProviderConfig.getAvailability, { postId: postId as Id<"v2Posts"> });
  const textAvailability = useQuery(api.visualTextConfig.getAvailability, { postId: postId as Id<"v2Posts"> });
  const seed = useQuery(api.visualProfiles.getSeedStatus, brandId === "corvo" ? { brandId: "corvo" } : "skip");
  const exactArticle7 = brandId === "corvo" && savedPostContext?.channelId === "corvo-blog" && savedPostContext.blogSlug === article7Slug && savedPostContext.title === article7Title;
  const postProfile = useQuery(api.visualProfiles.resolveForPost, exactArticle7 && profile ? { postId: postId as Id<"v2Posts"> } : "skip");
  const requestPlan = useMutation(api.visualWorkflow.requestPlan);
  const selectScene = useMutation(api.visualWorkflow.selectScene);
  const requestGeneration = useMutation(api.visualWorkflow.requestGeneration);
  const selectVersion = useMutation(api.visualWorkflow.selectVersion);
  const requestEdit = useMutation(api.visualWorkflow.requestEdit);
  const cancelQueuedAttempt = useMutation(api.visualWorkflow.cancelQueuedAttempt);
  const prepareHero = useAction(api.visualExports.prepareHero);
  const executeImageAttempt = useAction(api.visualProviderActions.executeImageAttempt);
  const executeTextAttempt = useAction(api.visualTextActions.executeTextAttempt);
  const approveHero = useMutation(api.visualWorkflow.approveHero);
  const confirmRelevance = useMutation(api.visualWorkflow.confirmRelevance);
  const saveRevision = useMutation(api.visualProfiles.saveRevision);
  const uploadReference = useAction(api.visualProfiles.uploadReference);
  const setMonthlyBudget = useMutation(api.visualWorkflow.setMonthlyBudget);
  const applyArticle7Exception = useMutation(api.visualProfiles.applyCorvoArticle7Exception);
  const setPostException = useMutation(api.visualProfiles.setPostException);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [instructions, setInstructions] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [providerOverride, setProviderOverride] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pendingVersionId, setPendingVersionId] = useState<string | null>(null);
  useEffect(() => {
    if (pendingVersionId === null) return;
    const timeout = setTimeout(() => {
      setPendingVersionId(null);
      setError("Image version selection was not confirmed within 10 seconds. Reload and inspect the current saved selection before acting again. No action was retried.");
    }, 10000);
    return () => clearTimeout(timeout);
  }, [pendingVersionId]);
  const [pendingScene, setPendingScene] = useState<string | null>(null);
  useEffect(() => {
    if (pendingScene === null) return;
    const timeout = setTimeout(() => {
      setPendingScene(null);
      setError("Scene selection was not confirmed within 10 seconds. Reload and inspect the current saved selection before acting again. No action was retried.");
    }, 10000);
    return () => clearTimeout(timeout);
  }, [pendingScene]);
  const [budgetInput, setBudgetInput] = useState("");
  const operations = useRef(new Map<string, { key: string; accepted: boolean }>());
  const planSignature = JSON.stringify([postId, workflow?.articleSignature, "plan", workflow?.attempts.filter(attempt => attempt.stage === "planning").map(attempt => [attempt._id, attempt.status])]);
  const pending = workflow?.attempts.some(attempt => attempt.stage !== "reflection" && ["queued", "running", "uncertain"].includes(attempt.status));
  const latestPlan = workflow?.plans[0];
  const completePlan = latestPlan?.status === "complete" && latestPlan.scenes.length === 3 && latestPlan.scenes.every(scene => Object.values(scene).every(value => typeof value === "string" && value.trim())) ? latestPlan : null;
  const selectedPlan = workflow?.plans.find(plan => plan._id === workflow.state?.selectedPlanId);
  const selectedIndex = workflow?.state?.selectedSceneIndex;
  const selectedScene = selectedPlan?.status === "complete" && selectedIndex !== undefined ? workflow?.state?.refinedScene ?? selectedPlan.scenes[selectedIndex] : null;
  const sceneSelectionPending = pendingScene !== null && pendingScene !== JSON.stringify([selectedPlan?._id, selectedIndex, workflow?.state?.refinedScene ?? null]);
  if (pendingScene !== null && !sceneSelectionPending) setPendingScene(null);
  const overrides = { ...(modelOverride.trim() ? { modelOverride: modelOverride.trim() } : {}), ...(providerOverride.trim() ? { providerOverride: providerOverride.trim() } : {}) };
  const localFixture = Boolean(localFixtureTokenUrl({ runtime: process.env.NODE_ENV, bypass: process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1", convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL, tokenUrl: process.env.NEXT_PUBLIC_VISUAL_FIXTURE_TOKEN_URL, vercel: Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL) }));
  const brandRoute = profile?.revision.defaultRoute;
  const canFixturePlan = localFixture && brandRoute?.provider === "offline-fixture" && brandRoute.model === "offline-fixture";
  const canPlan = canFixturePlan || textAvailability?.planning === true;
  const fixtureGeneration = canFixturePlan && (overrides.providerOverride ?? brandRoute?.provider) === "offline-fixture" && (overrides.modelOverride ?? brandRoute?.model) === "offline-fixture";
  const qualifiedRoutes = availability?.imageRoutes ?? [];
  const requestedGenerationModel = overrides.modelOverride ?? brandRoute?.model ?? "gpt-image-2";
  const generationRoutes = qualifiedRoutes.filter(route => route.generation && route.model === requestedGenerationModel);
  const generationRoute = generationRoutes.find(route => route.provider === (overrides.providerOverride ?? brandRoute?.provider))
    ?? (!overrides.providerOverride ? generationRoutes.find(route => route.provider === "digitalocean") ?? generationRoutes.find(route => route.provider === "openai") : undefined);
  const canGenerate = fixtureGeneration || Boolean(generationRoute);
  const generationOverrides = generationRoute && !fixtureGeneration ? { ...overrides, quality: generationRoute.quality, outputFormat: generationRoute.outputFormat, ...(generationRoute.inputFidelity ? { inputFidelity: generationRoute.inputFidelity } : {}), ...(generationRoute.provider !== brandRoute?.provider ? { providerOverride: generationRoute.provider } : {}), ...(generationRoute.model !== brandRoute?.model ? { modelOverride: generationRoute.model } : {}) } : overrides;
  const viewedScene = workflow && selectedPlan && selectedIndex !== undefined && selectedScene ? { expectedArticleSignature: workflow.articleSignature, expectedPlanId: selectedPlan._id, expectedSceneIndex: selectedIndex, expectedRefinedSceneSignature: stableInputSignature(workflow.state?.refinedScene ?? null) } : null;
  const generationSignature = JSON.stringify([postId, "generation", viewedScene, instructions, overrides, workflow?.attempts.filter(attempt => ["generation", "edit"].includes(attempt.stage)).map(attempt => [attempt._id, attempt.status])]);
  const selectedVersion = workflow?.versions.find(version => version._id === workflow.state?.selectedVersionId);
  const fixtureEdit = canFixturePlan && (overrides.providerOverride ?? selectedVersion?.provider) === "offline-fixture" && (overrides.modelOverride ?? selectedVersion?.model) === "offline-fixture";
  const requestedEditModel = overrides.modelOverride ?? selectedVersion?.model;
  const supportsInputFidelity = (model: string | undefined) => model === "gpt-image-1-mini" || model === "gpt-image-1";
  const editFidelity = supportsInputFidelity(requestedEditModel) ? selectedVersion?.input.inputFidelity ?? "low" : null;
  const editRoutes = qualifiedRoutes.filter(route => route.edit && route.model === requestedEditModel && route.quality === (selectedVersion?.input.quality ?? "medium") && route.size === (selectedVersion?.input.size ?? "1536x1024") && route.outputFormat === (selectedVersion?.input.outputFormat ?? "webp") && (route.inputFidelity ?? (supportsInputFidelity(route.model) ? "low" : null)) === editFidelity);
  const editRoute = editRoutes.find(route => route.provider === (overrides.providerOverride ?? selectedVersion?.provider))
    ?? (!overrides.providerOverride ? editRoutes.find(route => route.provider === "digitalocean") ?? editRoutes.find(route => route.provider === "openai") : undefined);
  const canEdit = fixtureEdit || Boolean(editRoute);
  const editOverrides = editRoute && !fixtureEdit ? { ...overrides, ...(editRoute.provider !== selectedVersion?.provider ? { providerOverride: editRoute.provider } : {}) } : overrides;
  const selectionPending = pendingVersionId !== null && pendingVersionId !== workflow?.state?.selectedVersionId;
  if (pendingVersionId !== null && !selectionPending) setPendingVersionId(null);
  const editSignature = JSON.stringify([postId, "edit", viewedScene, selectedVersion?._id, feedback, overrides, workflow?.attempts.filter(attempt => ["generation", "edit"].includes(attempt.stage)).map(attempt => [attempt._id, attempt.status])]);
  async function run(work: () => Promise<unknown>) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError("");
    try { await work(); return true; }
    catch { setError("This action could not be saved. Check the current saved state before retrying."); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function edit() {
    if (busyRef.current || !canEdit || pending || savedContentChanged || selectionPending || sceneSelectionPending || !viewedScene || !selectedVersion || !feedback.trim() || operations.current.get(editSignature)?.accepted) return;
    const operation = operations.current.get(editSignature) ?? { key: crypto.randomUUID(), accepted: false };
    operations.current.set(editSignature, operation);
    await run(async () => {
      const attemptId = await requestEdit({ postId: postId as Id<"v2Posts">, operationKey: operation.key, feedback: feedback.trim(), ...viewedScene, expectedParentVersionId: selectedVersion._id, ...editOverrides });
      operation.accepted = true;
      if (!fixtureEdit) {
        const result = await executeImageAttempt({ attemptId });
        if (result.status !== "completed") setError(result.status === "uncertain" ? "The image request needs reconciliation. Inspect its saved receipt before taking another action." : "The image request did not start. Inspect the saved attempt and route before taking another action.");
      }
    });
  }
  async function plan() {
    if (busyRef.current || !canPlan || pending || savedContentChanged || !profile || operations.current.get(planSignature)?.accepted) return;
    const operation = operations.current.get(planSignature) ?? { key: crypto.randomUUID(), accepted: false };
    operations.current.set(planSignature, operation);
    await run(async () => {
      const attemptId = await requestPlan({ postId: postId as Id<"v2Posts">, operationKey: operation.key });
      operation.accepted = true;
      if (!canFixturePlan) {
        const result = await executeTextAttempt({ attemptId });
        if (result.status !== "completed" || result.reason) setError(result.status === "uncertain" ? "The planning request needs reconciliation. Inspect its saved receipt before taking another action." : "The planning request did not produce usable concepts. Inspect the saved attempt before requesting another plan.");
      }
    });
  }
  async function generate() {
    if (busyRef.current || !canGenerate || pending || savedContentChanged || sceneSelectionPending || !viewedScene || operations.current.get(generationSignature)?.accepted) return;
    const operation = operations.current.get(generationSignature) ?? { key: crypto.randomUUID(), accepted: false };
    operations.current.set(generationSignature, operation);
    await run(async () => {
      const attemptId = await requestGeneration({ postId: postId as Id<"v2Posts">, operationKey: operation.key, ...viewedScene, ...(instructions.trim() ? { prompt: instructions.trim() } : {}), ...generationOverrides });
      operation.accepted = true;
      if (!fixtureGeneration) {
        const result = await executeImageAttempt({ attemptId });
        if (result.status !== "completed") setError(result.status === "uncertain" ? "The image request needs reconciliation. Inspect its saved receipt before taking another action." : "The image request did not start. Inspect the saved attempt and route before taking another action.");
      }
    });
  }
  async function saveScene(planId: Id<"v2VisualPlans">, sceneIndex: number, refinedScene?: SceneConcept) {
    if (busyRef.current) return;
    setPendingScene(JSON.stringify([planId, sceneIndex, refinedScene ?? null]));
    const saved = await run(() => selectScene({ planId, sceneIndex, ...(refinedScene ? { refinedScene } : {}) }));
    if (!saved) setPendingScene(null);
  }
  async function saveBudget() {
    if (busyRef.current) return;
    const match = budgetInput.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
    const limitMicros = match ? Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(6, "0")) : NaN;
    if (!Number.isSafeInteger(limitMicros) || limitMicros < 0) { setError("Enter a nonnegative USD amount with at most six decimal places."); return; }
    await run(() => setMonthlyBudget({ brandId, limitMicros }));
  }
  return <section aria-label="Editorial visuals" className="space-y-4 rounded-xl border border-gray-200 p-4">
    <h2 className="text-base font-semibold">Editorial visuals</h2>
    {workflow ? <p className="text-sm text-gray-600">Spent {usd(workflow.month?.spentMicros ?? 0)} · Reserved {usd(workflow.month?.reservedMicros ?? 0)} · Limit {workflow.budget ? usd(workflow.budget.limitMicros) : "not set"}</p> : <p role="status" className="text-sm text-gray-500">Loading saved visual state…</p>}
    <details className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Monthly budget</summary><div className="mt-3 space-y-2">
      <Field label="Monthly visual budget in USD (brand owner)" value={budgetInput} onChange={setBudgetInput} />
      <Button type="button" variant="outline" disabled={busy || !budgetInput.trim()} onClick={() => void saveBudget()}>Save visual budget</Button>
      <p className="text-xs text-gray-500">Only the brand owner can set the shared monthly limit. Planning, images, edits and reflection use this budget.</p>
    </div></details>
    {brandRoute && <p className="text-sm text-amber-700">Brand route: {brandRoute.provider} · {brandRoute.model}. Qualification: {brandRoute.qualification}.</p>}
    {generationRoute && !fixtureGeneration && <p className="text-sm text-gray-600">Generation route: {generationRoute.provider} · {generationRoute.apiModelId}.</p>}
    {!canPlan && !canGenerate && !canEdit && <p className="text-sm text-amber-700">Qualification pending: new planning, generation and edit requests are disabled until provider evidence and a reliable cost bound are available.</p>}
    {canFixturePlan && <p className="text-sm text-amber-700">Local offline rehearsal only. No provider qualification or paid call is implied.</p>}
    {!canPlan && (canGenerate || canEdit) && <p className="text-sm text-amber-700">Scene planning is paused until an approved text route and cost bound are available.</p>}
    {canPlan && (!canGenerate || selectedVersion && !canEdit) && <p className="text-sm text-amber-700">The selected image route or override is unqualified; its image request is disabled.</p>}
    {profile === null && <p className="text-sm text-amber-700">Set up the brand visual profile before planning.</p>}
    {profile !== undefined && <ProfileEditor brandId={brandId} profile={profile} disabled={busy} onSave={async input => { let receipt: ProfileSaveReceipt | null = null; const saved = await run(async () => { receipt = await saveRevision(input); }); return saved ? receipt : null; }}
      onUpload={async file => { let referenceId: Id<"v2VisualReferences"> | null = null; await run(async () => { const uploaded = await uploadReference({ brandId, fileName: file.name, contentType: file.type, bytes: await file.arrayBuffer() }); referenceId = uploaded.referenceId; }); return referenceId; }} />}
    {seed && <div className="space-y-2 text-xs text-gray-500"><p>Corvo archive: {seed.imported ? "imported" : "not imported"} · {seed.assets.filter(asset => asset.referenceId !== null).length} of {seed.assets.length} assets verified.</p><p>Historical model unknown; candidate prompts remain untested.</p>
      <details><summary className="cursor-pointer font-semibold">Guarded archive import from local masters</summary><div className="mt-2 space-y-2">
        <p>All approved PNG masters must match the fixed manifest hashes. Run from the project checkout, first verifying local bytes:</p>
        <pre className="overflow-x-auto rounded bg-gray-50 p-2">node scripts/import-visual-seed.mjs --source-directory /path/to/approved-masters</pre>
        <p>After inspecting the dry run and explicit destination, provide an authenticated application JWT through RESONATE_VISUAL_IMPORT_TOKEN in the command environment:</p>
        <pre className="overflow-x-auto rounded bg-gray-50 p-2">{"node scripts/import-visual-seed.mjs --source-directory /path/to/approved-masters --apply --url <explicit-destination-url>"}</pre>
        <p>Replace both path and destination placeholders. The command uploads the verified masters and imports the archive. Inspect saved status here before any retry.</p>
      </div></details>
    </div>}
    {exactArticle7 && savedPostContext && (postProfile ? <Article7ExceptionEditor context={savedPostContext} exception={postProfile.postException} seedImported={Boolean(seed?.imported)} disabled={Boolean(busy || savedContentChanged)}
      onApply={async expectedExceptionId => { let receipt: ExceptionSaveReceipt | null = null; const saved = await run(async () => { receipt = await applyArticle7Exception({ postId: postId as Id<"v2Posts">, expectedExceptionId, expectedPostContext: savedPostContext }); }); return saved ? receipt : null; }}
      onSave={async (guidance, expectedExceptionId) => { let receipt: ExceptionSaveReceipt | null = null; const saved = await run(async () => { receipt = await setPostException({ postId: postId as Id<"v2Posts">, expectedExceptionId, expectedPostContext: savedPostContext, guidance }); }); return saved ? receipt : null; }} /> : <p className="text-xs text-gray-500">{profile ? "Loading article-7 exception…" : "Set up the brand profile to configure article-7 guidance."}</p>)}
    {savedContentChanged && <p className="text-sm text-amber-700">Save article changes before requesting visuals.</p>}
    {error && <p role="alert">{error}</p>}
    <Button type="button" disabled={busy || !canPlan || pending || savedContentChanged || !profile || !workflow || operations.current.get(planSignature)?.accepted} onClick={() => void plan()}>Plan visuals</Button>
    {latestPlan && !completePlan && <div role="status" className="text-sm text-amber-700">Plan incomplete.{latestPlan.reasons.map(reason => <p key={reason}>{reason}</p>)}</div>}
    {completePlan && <div className="grid gap-3 lg:grid-cols-3">{completePlan.scenes.map((scene, index) => <article key={index} aria-label={`Scene ${index + 1}`} className="space-y-3 rounded-lg border border-gray-200 p-3">
      <h3 className="text-sm font-semibold">{scene.title}</h3>
      <dl className="space-y-2 text-sm">{sceneFields.map(([key, label]) => <div key={key}><dt className="text-xs font-semibold text-gray-500">{label}</dt><dd>{scene[key]}</dd></div>)}</dl>
      <Button type="button" variant="outline" disabled={busy || pending || savedContentChanged || sceneSelectionPending} onClick={() => void saveScene(completePlan._id, index)}>Select scene</Button>
    </article>)}</div>}
    {(selectedScene || selectedVersion) &&
      <details><summary className="cursor-pointer text-sm font-semibold">Prompt and route inspector</summary><div className="mt-3 space-y-3">
        {selectedVersion && <div><p className="mb-1 text-xs font-semibold text-gray-500">Submitted prompt for selected version</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs">{selectedVersion.input.prompt}</pre></div>}
        {selectedScene && <><p className="text-xs font-semibold text-gray-500">Selected scene request</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs">{composeScenePrompt(selectedScene)}</pre>
        <Field label="Additional production instructions" value={instructions} onChange={setInstructions} multiline />
        <p className="text-xs text-gray-500">These instructions are appended to the saved scene and brand guidance.</p></>}
        <Field label="Model override" value={modelOverride} onChange={setModelOverride} />
        <Field label="Provider override" value={providerOverride} onChange={setProviderOverride} />
        <p className="text-xs text-gray-500">Blank overrides use the configured brand route for generation and the selected parent route for edits.</p>
      </div></details>}
    {selectedScene && selectedPlan && selectedIndex !== undefined &&
      <SceneEditor key={JSON.stringify([selectedPlan._id, selectedIndex, selectedScene])} scene={selectedScene} disabled={Boolean(busy || pending || savedContentChanged || sceneSelectionPending)} generationDisabled={Boolean(!canGenerate || operations.current.get(generationSignature)?.accepted)}
        onSave={refinedScene => void saveScene(selectedPlan._id, selectedIndex, refinedScene)} onGenerate={() => void generate()} />}
    {Boolean(workflow?.versions.length) && <div className="space-y-3">
      <h3 className="text-sm font-semibold">Image versions</h3>
      <div className="flex flex-wrap gap-2">{workflow?.versions.map((version, index) => <Button key={version._id} type="button" variant="outline" disabled={busy || savedContentChanged} aria-pressed={version._id === selectedVersion?._id}
        onClick={() => { setPendingVersionId(version._id); void run(() => selectVersion({ postId: postId as Id<"v2Posts">, versionId: version._id })).then(saved => { if (!saved) setPendingVersionId(null); }); }}>Select version {(workflow?.versions.length ?? 0) - index}</Button>)}</div>
      {selectedVersion && <div className="space-y-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {selectedVersion.url ? <img src={selectedVersion.url} alt="Selected hero version" className="w-full rounded-lg border border-gray-200" /> : <p className="text-sm">Selected source image is unavailable.</p>}
        <p className="text-xs text-gray-500">Edit parent route: {selectedVersion.provider} · {selectedVersion.model}</p>
        {workflow?.state?.relevanceReason && <div className="space-y-2 rounded-lg bg-amber-50 p-3">
          <p className="text-sm text-amber-800">{workflow.state.relevanceReason}</p>
          <Button type="button" variant="outline" disabled={busy || savedContentChanged || selectionPending} onClick={() => void run(() => confirmRelevance({ postId: postId as Id<"v2Posts">, versionId: selectedVersion._id, expectedArticleSignature: workflow.articleSignature }))}>Confirm hero still fits this article</Button>
        </div>}
        {selectedVersion.feedback && <p className="text-sm">Previous feedback: {selectedVersion.feedback}</p>}
        <Field label="Edit feedback" value={feedback} onChange={setFeedback} multiline />
        <Button type="button" variant="outline" disabled={busy || !canEdit || pending || savedContentChanged || selectionPending || sceneSelectionPending || !viewedScene || !feedback.trim() || operations.current.get(editSignature)?.accepted} onClick={() => void edit()}>Edit selected version</Button>
        <HeroReview key={JSON.stringify([selectedVersion._id, selectedVersion.exportHash, selectedVersion.exportUrl, selectedVersion.exportMetadata, workflow?.articleSignature])} version={selectedVersion} disabled={Boolean(busy || pending || savedContentChanged || selectionPending || workflow?.state?.relevanceReason)}
          onPrepare={crop => void run(() => prepareHero({ versionId: selectedVersion._id, ...(crop ? { crop } : {}) }))}
          onApprove={(alt, expectedExportHash) => { if (workflow) void run(() => approveHero({ postId: postId as Id<"v2Posts">, versionId: selectedVersion._id, alt, expectedExportHash, expectedArticleSignature: workflow.articleSignature, expectedExportMetadataSignature: stableInputSignature(selectedVersion.exportMetadata) })); }} />
      </div>}
    </div>}
    {Boolean(workflow?.reflections.length) && <details className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Prompting reflection</summary><div className="mt-3 space-y-3">
      {workflow?.reflections.map(reflection => <div key={reflection._id} className="space-y-2 text-sm">
        {reflection.candidatePrompt && <><p className="font-semibold">Candidate prompt · untested</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs">{reflection.candidatePrompt}</pre></>}
        {reflection.deferredReason && <p className="text-xs text-amber-700">Reflection deferred: {reflection.deferredReason}</p>}
        {Boolean(reflection.profileChangeProposals.length) && <><p className="font-semibold">Profile proposals awaiting human review</p><ul className="list-disc space-y-1 pl-5">{reflection.profileChangeProposals.map((proposal, index) => <li key={index}>{proposal}</li>)}</ul></>}
      </div>)}
      <p className="text-xs text-gray-500">Reflection is advisory and does not grant human approval. Candidate prompts have no one-shot validation. Review profile proposals before saving any guidance change.</p>
    </div></details>}
    {Boolean(workflow?.attempts.length) && <div className="space-y-2" aria-label="Visual activity"><h3 className="text-sm font-semibold">Activity</h3>
      {workflow?.attempts.map(attempt => <div key={attempt._id} className="rounded-lg bg-gray-50 p-3 text-sm">
        <p>{attempt.stage} · {attempt.status === "queued" ? attempt.pauseReason ? "Paused" : "Pending" : attempt.status[0].toUpperCase() + attempt.status.slice(1)}</p>
        {attempt.pauseReason && <p className="text-xs text-amber-700">{attempt.pauseReason === "planning-route-unqualified" ? "Planning route is unqualified." : attempt.pauseReason === "provider-route-unqualified" ? "Provider route is unqualified; no image call has been dispatched." : attempt.pauseReason}</p>}
        {attempt.error && <p className="text-xs text-red-700">{attempt.error}</p>}
        {attempt.status === "uncertain" && <p className="text-xs text-amber-700">Reconciliation is required before another request. No automatic retry.</p>}
        {attempt.status === "queued" && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => cancelQueuedAttempt({ attemptId: attempt._id }))}>Cancel queued request</Button>}
      </div>)}
    </div>}
  </section>;
}
