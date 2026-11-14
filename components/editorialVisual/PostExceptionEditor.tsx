"use client";

import { useState } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/editorialVisual/Field";
import { StatusNote } from "@/components/editorialVisual/StatusNote";
export type PostContext = { title: string; blogSlug?: string; channelId: string };

export type ExceptionSaveReceipt = FunctionReturnType<typeof api.visualProfiles.setPostException>;

export function PostExceptionEditor({ context, exception, disabled, approvedSeedException, onApply, onSave }: { context: PostContext; exception: Doc<"v2VisualPostExceptions"> | null; disabled: boolean; approvedSeedException: boolean; onApply(expectedExceptionId: Id<"v2VisualPostExceptions"> | null): Promise<ExceptionSaveReceipt | null>; onSave(guidance: string, expectedExceptionId: Id<"v2VisualPostExceptions"> | null): Promise<ExceptionSaveReceipt | null> }) {
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
  async function apply() { if (disabled || conflict || waitingForSave || !approvedSeedException) return; const receipt = await onApply(baseException?._id ?? null); if (receipt) setOwnExceptionId(receipt.postExceptionId); }
  async function save() { if (disabled || conflict || waitingForSave || !dirty || !guidance.trim() || guidance.trim().length > 4000) return; const receipt = await onSave(guidance.trim(), baseException?._id ?? null); if (receipt) setOwnExceptionId(receipt.postExceptionId); }
  return <details className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Post visual exception{baseException ? ` · revision ${baseException.revision}` : " · none saved"}</summary><div className="mt-3 space-y-3">
    {conflict && <StatusNote role="alert">Post exception changed in another session. Your draft is preserved; reload the saved exception to continue.</StatusNote>}
    {waitingForSave && <p role="status" className="text-sm text-gray-500">Waiting for the saved post exception revision…</p>}
    {(conflict || waitingForSave) && <Button type="button" variant="outline" disabled={disabled} onClick={() => { setBaseException(exception); setGuidance(exception?.guidance ?? ""); setOwnExceptionId(null); }}>Reload saved post exception</Button>}
    <fieldset disabled={disabled || conflict || waitingForSave} className="space-y-3">
    <p className="text-sm font-semibold">{context.title}</p><p className="text-xs text-gray-500">{context.blogSlug} · {context.channelId}</p>
    <p className="text-xs text-gray-500">Authored guidance applies only to this saved post, on top of the brand profile.</p>
    {approvedSeedException && <><p className="text-xs text-gray-500">The approved photographic hand from the verified Corvo archive belongs to this saved article. Ordinary human elements use paper construction.</p>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => void apply()}>Apply approved article-7 hand exception</Button></>}
    <Field label="Post exception guidance" value={guidance} onChange={setGuidance} multiline />
    <Button type="button" variant="outline" disabled={disabled || !dirty || !guidance.trim() || guidance.trim().length > 4000} onClick={() => void save()}>Save post exception guidance</Button>
    <p className="text-xs text-gray-500">Authored guidance creates a post-specific revision. Reload if the post association or exception changes during saving.</p>
    </fieldset>
  </div></details>;
}
