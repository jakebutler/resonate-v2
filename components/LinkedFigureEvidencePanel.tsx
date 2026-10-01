"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export function LinkedFigureEvidencePanel({ postId, savedContentChanged }: { postId: string; savedContentChanged: boolean }) {
  const snapshot = useQuery(api.visualLinkedEvidence.getSnapshot, { postId: postId as Id<"v2Posts"> });
  const importEvidence = useMutation(api.visualLinkedEvidence.importLinkedEvidence);
  const [reviewedSnapshotKey, setReviewedSnapshotKey] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [observedSourceId, setObservedSourceId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const reviewKey = JSON.stringify([postId, snapshot?.snapshotHash ?? null, snapshot?.expectedSourceId ?? null]);
  if (reviewedSnapshotKey !== null && reviewedSnapshotKey !== reviewKey) setReviewedSnapshotKey(null);
  const matchedReceipt = Boolean(pendingSourceId && snapshot?.expectedSourceId === pendingSourceId);
  const observed = matchedReceipt || Boolean(observedSourceId && snapshot?.expectedSourceId === observedSourceId);
  const waiting = Boolean(pendingSourceId && !matchedReceipt);
  // Retire this receipt once observed so a later head cannot reactivate its wait.
  if (matchedReceipt) { setObservedSourceId(pendingSourceId); setPendingSourceId(null); }
  useEffect(() => {
    if (!waiting) return;
    const timeout = setTimeout(() => {
      setPendingSourceId(null);
      setReviewedSnapshotKey(null);
      setError("The import receipt was not observed. Reload and inspect saved evidence before another explicit import.");
    }, 10000);
    return () => clearTimeout(timeout);
  }, [waiting, pendingSourceId]);
  if (snapshot === undefined) return <p className="text-xs text-gray-500">Loading linked research…</p>;
  if (snapshot === null) return null;
  if (!snapshot.records.length && !snapshot.content) return null;
  const eligible = snapshot.records.some(record => record.eligible) && Boolean(snapshot.content);
  const reviewed = reviewedSnapshotKey === reviewKey;
  const disabled = savedContentChanged || requesting || waiting;
  return <section aria-label="Linked research for figures" className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
    <h2 className="text-sm font-semibold">Linked research</h2>
    <p className="text-xs text-gray-600">Inspect existing passages and review status before importing a saved evidence revision. This does not approve a figure.</p>
    {snapshot.records.map(record => <details key={`${record.kind}-${record.id}`} className="rounded border p-3">
      <summary className="cursor-pointer text-sm">{record.kind} · {record.status} · {record.eligible ? "eligible passage" : "excluded"}</summary>
      <p className="mt-2 text-xs text-gray-500">Source {record.id} · SHA-256 {record.sha256}</p>
      {record.text && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{record.text}</pre>}
      {record.reason && <p className="mt-2 text-xs text-amber-700">{record.reason}</p>}
    </details>)}
    {snapshot.reasons.map((reason, index) => <p key={index} className="text-xs text-amber-700">{reason}</p>)}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={disabled || !eligible} onChange={event => setReviewedSnapshotKey(event.target.checked ? reviewKey : null)} />I checked the linked passages and their review status.</label>
    <Button type="button" variant="outline" disabled={disabled || !reviewed || !eligible} onClick={() => {
      setRequesting(true); setError(""); setPendingSourceId(null); setObservedSourceId(null);
      void importEvidence({ postId: postId as Id<"v2Posts">, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: snapshot.expectedSourceId })
        .then(receipt => { setPendingSourceId(receipt.sourceId); setReviewedSnapshotKey(null); })
        .catch(() => { setReviewedSnapshotKey(null); setError("The import outcome needs inspection. Reload saved evidence before another explicit import."); })
        .finally(() => setRequesting(false));
    }}>Import linked research</Button>
    {waiting && <p role="status" className="text-xs text-gray-600">Import recorded; waiting for the saved evidence.</p>}
    {observed && <p role="status" className="text-xs text-gray-600">Saved linked evidence revision observed.</p>}
    {savedContentChanged && <p className="text-xs text-amber-700">Save or reload the current article before importing linked evidence.</p>}
    {error && <p role="alert" className="text-sm text-amber-700">{error}</p>}
  </section>;
}
