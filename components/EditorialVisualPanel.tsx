"use client";

import type { BrandId } from "@/lib/domain";
import { isClientE2eAuthBypassRequested } from "@/lib/e2eAuthBypass";
import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { composeScenePrompt, stableInputSignature, type SceneConcept } from "@/lib/visualWorkflow";
import { localFixtureTokenUrl } from "@/lib/localFixtureAuth";
import { Field } from "@/components/editorialVisual/Field";
import { StatusNote } from "@/components/editorialVisual/StatusNote";
import { SceneEditor, sceneFields } from "@/components/editorialVisual/SceneEditor";
import { HeroReview } from "@/components/editorialVisual/HeroReview";
import { ProfileEditor, type ProfileSaveReceipt } from "@/components/editorialVisual/ProfileEditor";
import { PostExceptionEditor, type ExceptionSaveReceipt } from "@/components/editorialVisual/PostExceptionEditor";

export type EditorialVisualPanelProps = { postId: string; brandId: BrandId; savedContentChanged?: boolean; savedPostContext?: { title: string; blogSlug?: string; channelId: string } };
const usd = (micros: number) => (micros / 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function EditorialVisualPanel(props: EditorialVisualPanelProps) {
  return <SavedPostVisualPanel key={`${props.brandId}:${props.postId}`} {...props} />;
}

function SavedPostVisualPanel({ postId, brandId, savedContentChanged, savedPostContext }: EditorialVisualPanelProps) {
  const workflow = useQuery(api.visualWorkflow.get, { postId: postId as Id<"v2Posts"> });
  const profile = useQuery(api.visualProfiles.getProfile, { brandId });
  const availability = useQuery(api.visualProviderConfig.getAvailability, { postId: postId as Id<"v2Posts"> });
  const textAvailability = useQuery(api.visualTextConfig.getAvailability, { postId: postId as Id<"v2Posts"> });
  const seed = useQuery(api.visualProfiles.getSeedStatus, brandId === "corvo" ? { brandId: "corvo" } : "skip");
  const isCorvoBlogPost = brandId === "corvo" && savedPostContext?.channelId === "corvo-blog";
  const postProfile = useQuery(api.visualProfiles.resolveForPost, isCorvoBlogPost && profile ? { postId: postId as Id<"v2Posts"> } : "skip");
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
  const localFixture = Boolean(localFixtureTokenUrl({ runtime: process.env.NODE_ENV, bypass: isClientE2eAuthBypassRequested(), convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL, tokenUrl: process.env.NEXT_PUBLIC_VISUAL_FIXTURE_TOKEN_URL, vercel: Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL) }));
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
  // Persisted qualified routes become selectable choices; free-text stays available as an advanced fallback.
  const routeChoices = Array.from(new Map(qualifiedRoutes.map(route => [`${route.provider}:${route.model}`, { provider: route.provider, model: route.model }])).values());
  const routeKey = `${providerOverride.trim()}:${modelOverride.trim()}`;
  const overrideActive = Boolean(providerOverride.trim() || modelOverride.trim());
  const matchedRoute = routeChoices.find(route => `${route.provider}:${route.model}` === routeKey);
  const customOverride = overrideActive && !matchedRoute;
  function setRouteChoice(value: string) {
    const separator = value.indexOf(":");
    if (separator <= 0) { setProviderOverride(""); setModelOverride(""); return; }
    setProviderOverride(value.slice(0, separator)); setModelOverride(value.slice(separator + 1));
  }
  async function run(work: () => Promise<unknown>) {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError("");
    try { await work(); return true; }
    catch (error) { setError(error instanceof Error ? error.message : "This action could not be saved. Check the current saved state before retrying."); return false; }
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
    {brandRoute && <p className="text-sm text-gray-600">Brand default: {brandRoute.provider} · {brandRoute.model}.</p>}
    {generationRoute && !fixtureGeneration && <p className="text-sm text-gray-600">Generation route: {generationRoute.provider} · {generationRoute.apiModelId}.</p>}
    {!canPlan && !canGenerate && !canEdit && <StatusNote>Image actions are on hold: no provider route is qualified with a dependable cost bound yet. Once the brand owner qualifies a route, planning and generation become available here — nothing else to do in the meantime.</StatusNote>}
    {canFixturePlan && <StatusNote>Local offline rehearsal only. No provider qualification or paid call is implied.</StatusNote>}
    {!canPlan && (canGenerate || canEdit) && <StatusNote>Scene planning is paused until an approved text route and cost bound are available.</StatusNote>}
    {canPlan && (!canGenerate || selectedVersion && !canEdit) && <StatusNote>The selected image route or override is unqualified; its image request is disabled.</StatusNote>}
    {profile === null && <StatusNote>Set up the brand visual profile before planning.</StatusNote>}
    {profile !== undefined && <ProfileEditor brandId={brandId} profile={profile} disabled={busy} onSave={async input => { let receipt: ProfileSaveReceipt | null = null; const saved = await run(async () => { receipt = await saveRevision(input); }); return saved ? receipt : null; }}
      onUpload={async file => { let referenceId: Id<"v2VisualReferences"> | null = null; await run(async () => { const uploaded = await uploadReference({ brandId, fileName: file.name, contentType: file.type, bytes: await file.arrayBuffer() }); referenceId = uploaded.referenceId; }); return referenceId; }} />}
    {seed && <div className="space-y-2 text-xs text-gray-500"><p>Corvo archive: {seed.imported ? "imported" : "not imported"} · {seed.assets.filter(asset => asset.referenceId !== null).length} of {seed.assets.length} assets verified.</p><p>Historical model unknown; candidate prompts remain untested.</p>
      <p>Archive import from local masters is operator-run from the project checkout with an authenticated token — see <code>docs/editorial-visuals/seed-import.md</code> for the guarded commands.</p>
    </div>}
    {isCorvoBlogPost && savedPostContext && (postProfile ? <PostExceptionEditor context={savedPostContext} exception={postProfile.postException} approvedSeedException={postProfile.approvedSeedException} disabled={Boolean(busy || savedContentChanged)}
      onApply={async expectedExceptionId => { let receipt: ExceptionSaveReceipt | null = null; const saved = await run(async () => { receipt = await applyArticle7Exception({ postId: postId as Id<"v2Posts">, expectedExceptionId, expectedPostContext: savedPostContext }); }); return saved ? receipt : null; }}
      onSave={async (guidance, expectedExceptionId) => { let receipt: ExceptionSaveReceipt | null = null; const saved = await run(async () => { receipt = await setPostException({ postId: postId as Id<"v2Posts">, expectedExceptionId, expectedPostContext: savedPostContext, guidance }); }); return saved ? receipt : null; }} /> : <p className="text-xs text-gray-500">{profile ? "Loading post exception…" : "Set up the brand profile to configure post exception guidance."}</p>)}
    {savedContentChanged && <StatusNote>Save article changes before requesting visuals.</StatusNote>}
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
        <label className="block text-xs font-semibold text-gray-600">Generation route <select className="mt-1 rounded border border-gray-200 p-1 text-sm" value={customOverride ? "custom" : matchedRoute ? `${matchedRoute.provider}:${matchedRoute.model}` : ""} onChange={event => setRouteChoice(event.target.value)}>
          <option value="">Brand default{brandRoute ? ` (${brandRoute.provider} · ${brandRoute.model})` : ""}</option>
          {routeChoices.map(route => <option key={`${route.provider}:${route.model}`} value={`${route.provider}:${route.model}`}>{route.provider} · {route.model}</option>)}
          {customOverride && <option value="custom">Custom override (see advanced)</option>}
        </select></label>
        <p className="text-xs text-gray-500">Only qualified, persisted routes are listed. Blank keeps the configured brand route for generation and the selected parent route for edits.</p>
        <details className="text-sm"><summary className="cursor-pointer text-xs font-semibold text-gray-500">Advanced: raw provider and model overrides</summary><div className="mt-2 space-y-2">
          <Field label="Model override" value={modelOverride} onChange={setModelOverride} />
          <Field label="Provider override" value={providerOverride} onChange={setProviderOverride} />
        </div></details>
      </div></details>}
    {selectedScene && selectedPlan && selectedIndex !== undefined &&
      <SceneEditor key={JSON.stringify([selectedPlan._id, selectedIndex, selectedScene])} scene={selectedScene} disabled={Boolean(busy || pending || savedContentChanged || sceneSelectionPending)} generationDisabled={Boolean(!canGenerate || operations.current.get(generationSignature)?.accepted)}
        onSave={refinedScene => void saveScene(selectedPlan._id, selectedIndex, refinedScene)} onGenerate={() => void generate()} />}
    {Boolean(workflow?.versions.length) && <div className="space-y-3">
      <h3 className="text-sm font-semibold">Image versions</h3>
      <div className="flex flex-wrap gap-2">{workflow?.versions.map((version, index) => <Button key={version._id} type="button" variant="outline" disabled={busy || pending || selectionPending || savedContentChanged} aria-pressed={version._id === selectedVersion?._id}
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
    {Boolean(workflow?.attempts.length) && <section aria-label="Visual activity" className="space-y-2"><h3 className="text-sm font-semibold">Activity</h3>
      {workflow?.attempts.map(attempt => <div key={attempt._id} className="rounded-lg bg-gray-50 p-3 text-sm">
        <p>{attempt.stage} · {attempt.status === "queued" ? attempt.pauseReason ? "Paused" : "Pending" : attempt.status[0].toUpperCase() + attempt.status.slice(1)}</p>
        {attempt.pauseReason && <p className="text-xs text-amber-700">{attempt.pauseReason === "planning-route-unqualified" ? "Planning route is unqualified." : attempt.pauseReason === "provider-route-unqualified" ? "Provider route is unqualified; no image call has been dispatched." : attempt.pauseReason}</p>}
        {attempt.error && <p className="text-xs text-red-700">{attempt.error}</p>}
        {attempt.status === "uncertain" && <p className="text-xs text-amber-700">Reconciliation is required before another request. No automatic retry.</p>}
        {attempt.status === "queued" && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => cancelQueuedAttempt({ attemptId: attempt._id }))}>Cancel queued request</Button>}
      </div>)}
    </section>}
  </section>;
}
