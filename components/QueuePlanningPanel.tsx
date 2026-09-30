"use client";
import {QueueReleasePanel} from "./QueueReleasePanel";
import { useState } from "react";
import Link from "next/link";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { BufferDestination } from "@/lib/bufferContracts";
import { destinationIdentity } from "@/lib/bufferContracts";
import { linkedInPayload } from "@/lib/socialPayload";
import type { capacityProjection } from "@/lib/queueCapacity";
type Plan = {
  projection: ReturnType<typeof capacityProjection>;
  destination: BufferDestination | null;
  snapshot: Doc<"queueObservations"> | null;
  constraint: Doc<"queueConstraints"> | null;
  reservations: Doc<"queueReservations">[];
  candidates: {
    post: Doc<"v2Posts">;
    dueAt: string | null;
    eligible: boolean;
    hold: string | null;
    reservationId?: Id<"queueReservations">;
  }[];
  partial: boolean;
};
export function QueuePlanningPanel({
  initialBrandId,
  initialSeriesId,
}: {
  initialBrandId?: string;
  initialSeriesId?: string;
}) {
  const { isAuthenticated } = useConvexAuth();
  const brands = useQuery(
    api.publishing.listBrands,
    isAuthenticated ? {} : "skip",
  ) as Doc<"v2Brands">[] | undefined;
  const series = useQuery(api.series.list, isAuthenticated ? {} : "skip") as
    | Doc<"postSeries">[]
    | undefined;
  const [selectedBrand, setBrand] = useState<Doc<"v2Posts">["brandId"]>(
    (initialBrandId ?? "corvo") as Doc<"v2Posts">["brandId"],
  );
  const [seriesId, setSeriesId] = useState(initialSeriesId ?? "");
  const selectedSeries = series?.find(s => s._id === seriesId);
  const seriesResolved = !seriesId || series !== undefined;
  const brand = selectedSeries?.brandId ?? (brands?.some(b => b.brandId === selectedBrand)
    ? selectedBrand : (brands?.[0]?.brandId ?? "corvo"));
  const authorized = isAuthenticated && seriesResolved && Boolean(brands?.some(b => b.brandId === brand));
  const args = {brandId: brand, ...(selectedSeries ? {seriesId: selectedSeries._id} : {})};
  const plan = useQuery(api.queuePlanning.plan, authorized ? args : "skip") as
    | Plan
    | undefined;
  const last = useQuery(
    api.queuePlanning.lastPlan,
    authorized ? { brandId: brand } : "skip",
  ) as Doc<"queuePlans"> | null | undefined;
  const refresh = useAction(api.bufferLive.refreshCapacity);
  const confirm = useMutation(api.queuePlanning.confirmConstraint);
  const reserve = useMutation(api.queuePlanning.reserve);
  const release = useMutation(api.queuePlanning.release);
  const save = useMutation(api.queuePlanning.saveDryRun);
  const [channelLimit, setChannelLimit] = useState("");
  const [orgLimit, setOrgLimit] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [evidence, setEvidence] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      const result = await fn();
      setMessage(
        result && typeof result === "object" && "reason" in result
          ? String(result.reason ?? "Provider count checked.")
          : "Planning record saved. No post was submitted.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Planning failed");
    } finally {
      setBusy(false);
    }
  }
  const p = plan?.projection;
  const d = plan?.destination;
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Queue planning</h1>
      <p>
        Review capacity and held companions. Local reservations do not reserve
        slots in Buffer.
      </p>
      {seriesId && seriesResolved && !selectedSeries && <p role="status">This series is unavailable. Showing the accessible brand queue.</p>}
      <div className="flex flex-wrap gap-4">
        <label>
          Brand
          <select
            className="ml-2 rounded border p-2"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value as typeof brand);
              setSeriesId("");
            }}
          >
            {brands?.map((b) => (
              <option key={b.brandId} value={b.brandId}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Series filter
          <select
            className="ml-2 rounded border p-2"
            value={selectedSeries?._id ?? ""}
            onChange={(e) => setSeriesId(e.target.value)}
          >
            <option value="">All LinkedIn posts</option>
            {series
              ?.filter((s) => s.brandId === brand)
              .map((s) => (
                <option key={s._id} value={s._id}>
                  {s.title}
                </option>
              ))}
          </select>
        </label>
      </div>
      {plan && (
        <>
          <QueueReleasePanel key={`${brand}:${selectedSeries?._id ?? ""}`} brandId={brand} seriesId={selectedSeries?._id} candidates={plan.candidates}/>
          <section
            aria-label="Queue capacity"
            className="space-y-2 rounded border bg-white p-4"
          >
            <h2 className="text-lg font-semibold">
              {d
                ? `${d.displayName} — LinkedIn ${d.accountType}`
                : "Destination unverified"}
            </h2>
            {d && (
              <p>
                @{d.handle} · channel {d.channelId} · organization{" "}
                {d.organizationId}
              </p>
            )}
            {p?.unknown ? (
              <p role="status">Capacity unknown: {p.unknown}</p>
            ) : (
              <p aria-label="Available capacity">
                {p?.availableForBacklog} slots available to backlog
              </p>
            )}
            <p>
              Channel: {p?.channelUsed} used · {p?.channelFree ?? "unknown"}{" "}
              free · {p?.channelReserved} reserved · {p?.channelClaims}{" "}
              unreflected claims · ceiling{" "}
              {plan.constraint?.channelLimit ?? "unknown"}
            </p>
            <p>
              Organization: {p?.organizationUsed} used ·{" "}
              {p?.organizationFree ?? "unknown"} free ·{" "}
              {p?.organizationReserved} reserved · ceiling{" "}
              {plan.snapshot?.observation.organizationLimit ??
                plan.constraint?.organizationLimit ??
                "unknown"}
            </p>
            <p>
              Daily posting limit: {plan.constraint?.dailyLimit ?? "unknown"}
              {plan.constraint?.dailyLimit !== undefined
                ? " (operator confirmed)"
                : "; review the account plan separately"}
            </p>
            {plan.constraint && (
              <p>
                Planning constraints confirmed{" "}
                {new Date(plan.constraint.checkedAt).toLocaleString()}:{" "}
                {plan.constraint.evidence}
              </p>
            )}
            <p>
              Provider count:{" "}
              {plan.snapshot?.observation.complete
                ? "complete"
                : "incomplete or unchecked"}{" "}
              · checked{" "}
              {plan.snapshot
                ? new Date(plan.snapshot.checkedAt).toLocaleString()
                : "never"}
            </p>
            <p>
              API request quotas:{" "}
              {plan.snapshot?.observation.apiWindows?.length
                ? plan.snapshot.observation.apiWindows
                    .map(
                      (w) =>
                        `${w.policy}: ${w.remaining} remaining, resets ${new Date(w.resetsAt).toLocaleString()}`,
                    )
                    .join(" · ")
                : "unknown (separate from queue slots)"}
            </p>
            <button
              className="rounded border px-3 py-2"
              disabled={busy}
              onClick={() => void run(() => refresh({ brandId: brand }))}
            >
              Refresh capacity (read only)
            </button>{" "}
            <Link className="underline" href="/#connections">
              Review connection
            </Link>
            {d && (
              <details>
                <summary>Confirm planning limits for displayed account</summary>
                <label className="block">
                  Per-channel queue ceiling
                  <input
                    type="number"
                    min={0}
                    className="ml-2 rounded border p-2"
                    value={channelLimit}
                    onChange={(e) => setChannelLimit(e.target.value)}
                  />
                </label>
                <label className="block">
                  Organization ceiling if provider value is unknown
                  <input
                    type="number"
                    min={0}
                    className="ml-2 rounded border p-2"
                    value={orgLimit}
                    onChange={(e) => setOrgLimit(e.target.value)}
                  />
                </label>
                <label className="block">
                  Daily posting limit (optional)
                  <input
                    type="number"
                    min={0}
                    className="ml-2 rounded border p-2"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                  />
                </label>
                <label className="block">
                  Account plan evidence
                  <input
                    className="w-full rounded border p-2"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy || !channelLimit || !evidence.trim()}
                  onClick={() =>
                    void run(() =>
                      confirm({
                        brandId: brand,
                        identity: destinationIdentity(d),
                        channelLimit: Number(channelLimit),
                        ...(orgLimit
                          ? { organizationLimit: Number(orgLimit) }
                          : {}),
                        ...(dailyLimit
                          ? { dailyLimit: Number(dailyLimit) }
                          : {}),
                        evidence,
                      }),
                    )
                  }
                >
                  Confirm these account constraints
                </button>
              </details>
            )}
          </section>
          <section aria-label="Eligible queue plan" className="space-y-3">
            <h2 className="text-lg font-semibold">Dry-run candidates</h2>
            <p>
              {plan.candidates.filter((r) => r.eligible).length} eligible ·{" "}
              {plan.candidates.filter((r) => !r.eligible).length} held
              {plan.partial ? " · partial list (500 post limit)" : ""}
            </p>
            <button
              disabled={busy}
              className="rounded border px-3 py-2"
              onClick={() => void run(() => save(args))}
            >
              Save dry-run review
            </button>
            {last && (
              <p>
                Last saved dry run: {new Date(last.checkedAt).toLocaleString()}{" "}
                · {last.rows.filter((r) => !r.eligible).length} held
              </p>
            )}
            <ul className="space-y-3">
              {plan.candidates.map((row) => (
                <li
                  className="space-y-2 rounded border bg-white p-4"
                  key={row.post._id}
                >
                  <Link
                    className="font-medium underline"
                    href={`/?postId=${row.post._id}`}
                  >
                    {row.post.title}
                  </Link>
                  <p>
                    {row.post.scheduledDate ?? "Unscheduled"}{" "}
                    {row.post.scheduledTime} {row.post.timezone} · UTC{" "}
                    {row.dueAt ?? "requires review"}
                  </p>
                  <p>
                    {row.eligible
                      ? "Eligible for a new queue review"
                      : `Held: ${row.hold}`}
                  </p>
                  <details>
                    <summary>Read exact saved copy</summary>
                    <pre className="whitespace-pre-wrap">
                      {linkedInPayload(
                        row.post.content,
                        row.post.platformSettings,
                      )}
                    </pre>
                    {row.post.linkedinFirstComment && (
                      <pre className="whitespace-pre-wrap">
                        First comment: {row.post.linkedinFirstComment}
                      </pre>
                    )}
                  </details>
                  {row.reservationId ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          release({ reservationId: row.reservationId! }),
                        )
                      }
                    >
                      Release local reservation
                    </button>
                  ) : (
                    selectedSeries && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            reserve({
                              seriesId: selectedSeries._id,
                              postId: row.post._id,
                            }),
                          )
                        }
                      >
                        Reserve a local launch slot
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
