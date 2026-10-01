"use client";
/* eslint-disable @next/next/no-img-element -- The bound SVG must render as a native data-URL image without an optimizer or network fetch. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { BrandId } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { figureSignatures, type FigureSpec } from "@/lib/visualFigures";

export type EditorialFigurePanelProps = { postId: string; brandId: BrandId; savedContentChanged?: boolean };
type Receipt = { kind: "plan"; id: string } | { kind: "source"; id: string } | { kind: "state"; id: string; status: string } | { kind: "removed"; id: string } | { kind: "candidate"; id: string };
type FigureEdit = { rows: string[][]; palette: { background: string; ink: string; accent: string }; insertionAnchor: string };
function FigureCard({ candidate, state, disabled, onAccept, onDecline, onEdit, onMove, onRemove }: {
  candidate: Doc<"v2FigureCandidates">; state: Doc<"v2FigureStates"> | undefined; disabled: boolean;
  onAccept(): void; onDecline(): void; onEdit(edit: FigureEdit): void; onMove(anchor: string): void; onRemove(): void;
}) {
  const [rows, setRows] = useState(() => candidate.spec.rows.map(row => [...row]));
  const [palette, setPalette] = useState(() => ({ background: candidate.spec.presentation.background, ink: candidate.spec.presentation.ink, accent: candidate.spec.presentation.accent }));
  const [anchor, setAnchor] = useState(candidate.spec.insertionAnchor);
  const rowPaletteChanged = JSON.stringify(rows) !== JSON.stringify(candidate.spec.rows) || Object.entries(palette).some(([key, value]) => value !== candidate.spec.presentation[key as keyof typeof palette]);
  const dirty = rowPaletteChanged || anchor !== candidate.spec.insertionAnchor;
  const validDraft = rows.length >= 1 && rows.length <= 12 && rows.every(row => row.length === candidate.spec.columns.length && row.every(cell => cell.length <= 160)) && Object.values(palette).every(color => /^#[0-9a-f]{6}$/iu.test(color)) && Boolean(anchor.trim()) && anchor.length <= 16000;
  const terminal = !state || ["declined", "removed", "superseded"].includes(state.status);
  const [src, setSrc] = useState(""); const [previewError, setPreviewError] = useState("");
  const [loaded, setLoaded] = useState(false); const [reviewedFor, setReviewedFor] = useState<string | null>(null);
  const reviewIdentity = JSON.stringify([state?.status ?? null, state?.reviewReason ?? null, state?.insertedBlock ?? null, state?.acceptedCandidateId ?? null]);
  const reviewed = reviewedFor === reviewIdentity;
  const specText = JSON.stringify(candidate.spec);
  const { svg, svgSha256, dataSignature, presentationSignature, rendererVersion } = candidate;
  useEffect(() => {
    let active = true;
    void figureSignatures(JSON.parse(specText) as FigureSpec).then(rendered => {
      if (rendered.svg !== svg || rendered.svgSha256 !== svgSha256 || rendered.dataSignature !== dataSignature || rendered.presentationSignature !== presentationSignature || rendered.rendererVersion !== rendererVersion) throw new Error("Stored figure preview failed verification; reload the current candidate");
      if (active) { setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.svg)}`); setLoaded(false); setReviewedFor(null); setPreviewError(""); }
    }).catch(error => { if (active) { setSrc(""); setLoaded(false); setReviewedFor(null); setPreviewError(error instanceof Error ? error.message : "Figure preview failed verification"); } });
    return () => { active = false; };
  }, [specText, svg, svgSha256, dataSignature, presentationSignature, rendererVersion]);
  return <article className="space-y-3 rounded-lg border border-gray-200 p-3" aria-label={`${candidate.spec.family} figure`}>
    <h3 className="text-sm font-semibold">{candidate.spec.presentation.title}</h3>
    <p className="text-xs text-gray-500">{candidate.spec.family} · {state?.status ?? "unavailable"}</p>
    {src && <img src={src} alt={candidate.spec.presentation.alt} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setPreviewError("Figure preview could not load"); }} className="w-full rounded-lg border border-gray-200" />}
    {previewError && <p role="alert" className="text-sm text-red-700">{previewError}</p>}
    <p className="text-sm text-gray-700">{candidate.spec.presentation.caption}</p>
    <p className="text-xs text-gray-600">{candidate.spec.presentation.sourceNote}</p>
    <p className="text-xs text-gray-600">Alt text: {candidate.spec.presentation.alt}</p>
    {state?.reviewReason && <p className="text-sm text-amber-700">{state.reviewReason}</p>}
    <details><summary className="cursor-pointer text-sm font-semibold">Exact evidence rows</summary>
      {[...candidate.spec.evidence, ...candidate.spec.claimTraceEvidence].map((span, index) => <div key={index} className="mt-2">
        <p className="text-xs text-gray-500">Source {span.sourceId} · row {span.row} · UTF-16 offsets {span.start}–{span.end}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-800">{span.text}</pre>
      </div>)}
    </details>
    <p className="text-xs text-gray-600">Insertion anchor: {candidate.spec.insertionAnchor}</p>
    <details><summary className="cursor-pointer text-sm font-semibold">Edit figure evidence and presentation</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-600">Labels, values, units, ordering and relationships must match a complete current article table and its required claim trace. Save edits to create a new preview before accepting.</p>
        <div className="max-h-72 space-y-3 overflow-auto">
          {rows.map((row, rowIndex) => <fieldset key={rowIndex} className="rounded border border-gray-200 p-2">
            <legend className="px-1 text-xs font-semibold">Row {rowIndex + 1}</legend>
            <div className="grid gap-2 sm:grid-cols-2">{row.map((cell, columnIndex) => <label key={columnIndex} className="block text-xs">{candidate.spec.columns[columnIndex]}
              <input aria-label={`${candidate.spec.columns[columnIndex]} row ${rowIndex + 1}`} value={cell} maxLength={160} disabled={disabled || terminal} onChange={event => setRows(previous => previous.map((values, index) => index === rowIndex ? values.map((value, column) => column === columnIndex ? event.target.value : value) : values))} className="mt-1 w-full rounded border p-2 text-sm" />
            </label>)}</div>
            <Button type="button" variant="outline" disabled={disabled || terminal || rows.length <= 1} onClick={() => setRows(previous => previous.filter((_, index) => index !== rowIndex))}>Remove row {rowIndex + 1}</Button>
          </fieldset>)}
        </div>
        <Button type="button" variant="outline" disabled={disabled || terminal || rows.length >= 12} onClick={() => setRows(previous => [...previous, candidate.spec.columns.map(() => "")])}>Add evidence row</Button>
        <div className="grid gap-2 sm:grid-cols-3">{(["background", "ink", "accent"] as const).map(key => <label key={key} className="block text-xs font-semibold">{key === "background" ? "Background" : key === "ink" ? "Ink" : "Accent"} color
          <input value={palette[key]} disabled={disabled || terminal} maxLength={7} onChange={event => setPalette(previous => ({ ...previous, [key]: event.target.value }))} className="mt-1 w-full rounded border p-2 text-sm" />
        </label>)}</div>
        <label className="block text-xs font-semibold">Figure insertion anchor<textarea value={anchor} disabled={disabled || terminal} maxLength={16000} onChange={event => setAnchor(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm" /></label>
        <p className="text-xs text-gray-600">Use exact whole lines from the saved article. Each active figure needs a separate unique anchor.</p>
        {dirty && <p className="text-sm text-amber-700">Edits are unsaved. Accept the newly saved preview after reviewing it.</p>}
        {dirty && !validDraft && <p className="text-sm text-red-700">Use bounded evidence rows, six-digit hex colors and a nonempty insertion anchor.</p>}
        <Button type="button" variant="outline" disabled={disabled || terminal || !dirty || !validDraft} onClick={() => onEdit({ rows, palette, insertionAnchor: anchor })}>Save figure edit</Button>
      </div>
    </details>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={disabled || !loaded || terminal} onChange={event => setReviewedFor(event.target.checked ? reviewIdentity : null)} />I reviewed the evidence, values, units, relationships, caption, alt text and placement.</label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={disabled || terminal || dirty || !loaded || !reviewed || Boolean(previewError)} onClick={onAccept}>Accept figure</Button>
      <Button type="button" variant="outline" disabled={disabled || terminal || Boolean(state?.insertedBlock)} onClick={onDecline}>Decline figure</Button>
      <Button type="button" variant="outline" disabled={disabled || !state?.insertedBlock || state.acceptedCandidateId !== candidate._id || terminal || !loaded || !reviewed || Boolean(previewError) || rowPaletteChanged || anchor === candidate.spec.insertionAnchor || !validDraft} onClick={() => onMove(anchor)}>Move figure</Button>
      <Button type="button" variant="outline" disabled={disabled || !state?.insertedBlock} onClick={onRemove}>Remove figure</Button>
    </div>
  </article>;
}
export function EditorialFigurePanel({ postId, brandId, savedContentChanged = false }: EditorialFigurePanelProps) {
  const workspace = useQuery(api.visualFigures.getWorkspace, { postId: postId as Id<"v2Posts"> });
  const planFigures = useMutation(api.visualFigures.planFigures);
  const acceptCandidate = useMutation(api.visualFigures.acceptCandidate);
  const attachEvidence = useMutation(api.visualFigures.attachEvidence);
  const editCandidate = useMutation(api.visualFigures.editCandidate);
  const moveFigure = useMutation(api.visualFigures.moveFigure);
  const removeFigure = useMutation(api.visualFigures.removeFigure);
  const declineCandidate = useMutation(api.visualFigures.declineCandidate);
  const [file, setFile] = useState<File | null>(null); const [evidenceKey, setEvidenceKey] = useState("claim-trace");
  const [purpose, setPurpose] = useState<"claim-trace" | "data">("claim-trace");
  const [observedSourceId, setObservedSourceId] = useState<Id<"v2FigureSources"> | null>(null); const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const locked = useRef(false);
  const [expected, setExpected] = useState<Receipt | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    if (!expected || !workspace) return;
    const fresh = expected.kind === "plan" ? workspace.plan?._id === expected.id
      : expected.kind === "source" ? workspace.sources.some(source => source._id === expected.id)
      : expected.kind === "candidate" ? workspace.candidates.some(candidate => candidate._id === expected.id) && workspace.states.some(state => state.selectedCandidateId === expected.id)
      : expected.kind === "removed" ? workspace.states.some(state => state.selectedCandidateId === expected.id && state.status === "removed") || (!workspace.states.some(state => state.selectedCandidateId === expected.id) && !workspace.candidates.some(candidate => candidate._id === expected.id))
      : workspace.states.some(state => state.selectedCandidateId === expected.id && state.status === expected.status);
    // This external subscription confirms that the committed mutation is independently readable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fresh) { locked.current = false; setBusy(false); setExpected(null); }
  }, [expected, workspace]);
  useEffect(() => {
    if (!expected) return;
    const timeout = setTimeout(() => {
      locked.current = false; setBusy(false); setExpected(null);
      setError("Saved figure state was not confirmed within 10 seconds. Inspect the current saved figure state before acting again. No action was retried.");
    }, 10000);
    return () => clearTimeout(timeout);
  }, [expected]);
  const disabled = savedContentChanged || busy || !workspace;
  const currentSourceId = workspace?.sources.find(source => source.purpose !== "article" && source.key === evidenceKey)?._id ?? null;
  const evidenceChanged = Boolean(file && observedSourceId !== currentSourceId);
  async function run(action: () => Promise<Receipt>) {
    if (disabled || locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { setExpected(await action()); }
    catch (error) { setError(error instanceof Error ? error.message : "Figure action failed"); locked.current = false; setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4" aria-label="Informational figures">
    <h2 className="text-sm font-semibold text-gray-900">Informational figures</h2>
    <p className="text-sm text-gray-600">Plan up to three figures from explicit article evidence. Unsupported material can yield zero candidates.</p>
    {savedContentChanged && <p className="text-sm text-amber-700">Save article changes before planning or reviewing figures.</p>}
    {brandId === "corvo" && <p className="text-xs text-gray-600">Numeric figures require an attached claim trace matching the explicit article table, including units, population, denominator and a public citation in every numeric row.</p>}
    <details><summary className="cursor-pointer text-sm font-semibold">Article evidence attachments</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-600">Choose a Markdown, text or CSV file up to 64 KiB. Uploaded evidence stays linked to this saved article. Supporting data is retained for inspection; candidates still require explicit article tables.</p>
        <label className="block text-xs font-semibold">Evidence key<input value={evidenceKey} disabled={disabled} onChange={event => { setEvidenceKey(event.target.value); setObservedSourceId(workspace?.sources.find(source => source.purpose !== "article" && source.key === event.target.value)?._id ?? null); }} className="mt-1 w-full rounded border p-2 text-sm" /></label>
        <label className="block text-xs font-semibold">Evidence purpose<select value={purpose} disabled={disabled} onChange={event => setPurpose(event.target.value as "claim-trace" | "data")} className="mt-1 w-full rounded border p-2 text-sm"><option value="claim-trace">Claim trace</option><option value="data">Supporting data</option></select></label>
        <label className="block text-xs font-semibold">Evidence file<input ref={fileInput} type="file" accept=".md,.txt,.csv" disabled={disabled} onChange={event => { setFile(event.target.files?.[0] ?? null); setObservedSourceId(currentSourceId); }} className="mt-1 block w-full text-sm" /></label>
        {evidenceChanged && <p className="text-sm text-amber-700">Evidence changed while this file was selected. Select the file again before replacing the current source.</p>}
        <Button type="button" variant="outline" disabled={disabled || !file || evidenceChanged} onClick={() => void run(async () => {
          if (!file || !file.size || file.size > 65536) throw new Error("Choose nonempty UTF-8 evidence up to 64 KiB");
          if (evidenceKey === "__article__" || workspace?.sources.some(source => source.purpose === "article" && source.key === evidenceKey)) throw new Error("The article source key is reserved; use a separate evidence key");
          if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(evidenceKey)) throw new Error("Evidence key needs lowercase letters, numbers and hyphens");
          const extension = file.name.split(".").at(-1)?.toLowerCase();
          const format = extension === "md" ? "markdown" : extension === "txt" ? "text" : extension === "csv" ? "csv" : null;
          if (!format) throw new Error("Choose a .md, .txt or .csv evidence file");
          const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
          const saved = await attachEvidence({ postId: postId as Id<"v2Posts">, key: evidenceKey, expectedSourceId: observedSourceId, name: file.name, format, purpose, content });
          setFile(null); if (fileInput.current) fileInput.current.value = "";
          return { kind: "source", id: saved.sourceId };
        })}>Attach evidence</Button>
        {workspace?.sources.filter(source => source.purpose !== "article").map(source => <details key={source._id} className="rounded border border-gray-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{source.name} · revision {source.revision}</summary>
          {source.parseErrors.map((parseError, index) => <p key={index} className="mt-2 text-sm text-amber-700">{parseError}</p>)}
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-800">{source.content}</pre>
        </details>)}
      </div>
    </details>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => void run(async () => ({ kind: "plan", id: (await planFigures({ postId: postId as Id<"v2Posts"> })).planId }))}>Plan informational figures</Button>
    {workspace?.plan && workspace.candidates.length === 0 && <p className="text-sm text-gray-600">No additional supported figures.</p>}
    {workspace?.plan?.reasons.map((reason, index) => <p className="text-sm text-gray-600" key={index}>{reason}</p>)}
    {workspace?.candidates.map(candidate => {
      const state = workspace.states.find(state => state.selectedCandidateId === candidate._id);
      const review = { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature };
      return <FigureCard key={candidate._id} candidate={candidate} state={state} disabled={disabled}
        onAccept={() => void run(async () => { await acceptCandidate(review); return { kind: "state", id: candidate._id, status: "accepted" }; })}
        onDecline={() => void run(async () => { await declineCandidate({ candidateId: candidate._id }); return { kind: "state", id: candidate._id, status: "declined" }; })}
        onEdit={edit => void run(async () => { const saved = await editCandidate({ ...review, ...edit }); return { kind: "candidate", id: saved.candidateId }; })}
        onMove={insertionAnchor => void run(async () => { const moved = await moveFigure({ ...review, insertionAnchor }); return { kind: "candidate", id: moved.candidateId }; })}
        onRemove={() => void run(async () => { await removeFigure({ candidateId: candidate._id }); return { kind: "removed", id: candidate._id }; })} />;
    })}
    {busy && <p className="text-sm text-gray-500" role="status">Waiting for saved figure state…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
