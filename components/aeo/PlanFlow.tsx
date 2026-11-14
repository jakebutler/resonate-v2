"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StrategyPlanPanel } from "./StrategyPlanPanel";
import { MutationFeedbackBar, useAeoMutation } from "./mutationFeedback";
import { keywordGapRowToKeywordGap, planRowToStrategyPlan } from "./mappings";
import { mergePlanTargetKeywords } from "@/lib/keywordResearch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { Loadable, StrategyPlan } from "./types";
import type { Id } from "@/convex/_generated/dataModel";

type CampaignOption = { _id: Id<"campaigns">; title: string };

/**
 * The answer-engine cron's schedule, from convex/crons.ts (`aeo-answer-engine-runs`,
 * daily at 07:35 UTC). The cron config has no read API, so the label lives
 * beside its definition and must be updated with it.
 */
const INTEL_CRON_LABEL = "daily at 07:35 UTC (cron)";

/**
 * Plan step: review actions resolve the plan's review state; the only content
 * actions seed downstream drafts — captured ideas (from gaps) or campaign
 * brief fields. Nothing here approves or publishes anything (L8).
 */
export function PlanFlow() {
  const { brandId } = useAeoBrand();
  const planRow = useQuery(api.aeoIntel.getLatestStrategyPlan, { brandId });
  const findingRows = useQuery(api.aeoIntel.listFindings, { brandId });
  const campaignRows = useQuery(api.campaigns.listCampaigns, {});
  const runRows = useQuery(api.aeoIntel.listRuns, { brandId });
  const savePlan = useAeoMutation(
    useMutation(api.aeoIntel.saveStrategyPlan)
  );
  const seedKeywords = useAeoMutation(
    useMutation(api.aeoIntel.saveStrategyPlan)
  );
  const keywordGapRows = useQuery(api.keywordResearch.listKeywordGaps, { brandId });
  const keywordGaps = (keywordGapRows ?? []).map(keywordGapRowToKeywordGap);
  const seedBrief = useAeoMutation(useMutation(api.shapes.saveBrief));

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");

  // List query: undefined is pending; null is the sync fixture's empty-set
  // convention — normalize so derivations always see an array.
  const runList = runRows ?? [];
  const intelCycle =
    runRows === undefined
      ? undefined
      : {
          schedule: INTEL_CRON_LABEL,
          lastRun: [...runList].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
        };

  const plan: Loadable<StrategyPlan | null> =
    planRow === undefined
      ? { status: "loading" }
      : planRow === null
        ? { status: "ready", data: null }
        : { status: "ready", data: planRowToStrategyPlan(planRow).plan };

  const gapTitles =
    planRow !== undefined && planRow !== null
      ? planRowToStrategyPlan(planRow).gapTitles
      : undefined;

  // A cited answer suspected of describing a different product carries its
  // warning into the plan: same verdict, same detail, as the intel screen.
  // Tolerates null/undefined while the subscription is loading or unmocked.
  const gapWarnings = Object.fromEntries(
    (findingRows ?? [])
      .filter((row) => row.brandMatch === "suspect")
      .map((row) => [
        row._id,
        row.brandMatchDetail ??
          "the cited answer may describe a different product with the same name.",
      ]),
  );

  const brandCampaigns: CampaignOption[] = (campaignRows ?? []).filter(
    (campaign) => campaign.brandId === brandId
  );

  // Deriving the typed campaign from the selected id keeps saveBrief's
  // Id<"campaigns"> argument honest without casting the select's string value.
  const selectedCampaign =
    brandCampaigns.find((campaign) => campaign._id === selectedCampaignId) ??
    null;

  const seedBriefDisabled =
    !selectedCampaign ||
    planRow === null ||
    planRow === undefined ||
    seedBrief.state.status === "pending";

  const seedKeywordsDisabled =
    planRow === null ||
    planRow === undefined ||
    keywordGapRows === undefined ||
    keywordGaps.length === 0 ||
    seedKeywords.state.status === "pending";

  function seedTargetKeywords() {
    if (!planRow || keywordGaps.length === 0) return;
    void seedKeywords.run(
      {
        brandId,
        // Seeding appends a draft version for review — the plan itself is
        // never approved or published by this action (L8).
        status: "draft",
        reviewNotes: "Seeded target keywords from keyword-gap research.",
        expectedVersion: planRow.version,
        plan: {
          ...planRow.plan,
          targetKeywords: mergePlanTargetKeywords(planRow.plan.targetKeywords, keywordGaps),
        },
      },
    );
  }

  function seedCampaignBrief() {
    if (!planRow || !selectedCampaign) return;
    void seedBrief.run({
      campaignId: selectedCampaign._id,
      goal: planRow.plan.brief.goal,
      audience: planRow.plan.brief.audience,
    });
  }

  return (
    <>
      <StrategyPlanPanel
        plan={plan}
        gapTitles={gapTitles}
        gapWarnings={gapWarnings}
        intelCycle={intelCycle}
        reviewPending={savePlan.state.status === "pending"}
        onAccept={(planId) => {
          if (!planRow) return;
          void savePlan.run({
            brandId,
            status: "reviewed",
            // Optimistic concurrency: refuse the save when another save
            // appended a newer version since this row was loaded.
            expectedVersion: planRow.version,
            plan: planRow.plan,
          });
          void planId;
        }}
        onRequestChanges={(planId, note) => {
          if (!planRow) return;
          void savePlan.run({
            brandId,
            status: "draft",
            reviewNotes: note,
            expectedVersion: planRow.version,
            plan: planRow.plan,
          });
          void planId;
        }}
      />
      <section
        aria-label="Seed campaign brief"
        className="rounded border border-black/10 bg-white p-4 space-y-3"
      >
        <p className="text-sm font-medium">Seed a campaign brief</p>
        <p className="text-sm text-gray-500">
          Copies the plan&apos;s goal and audience into a campaign&apos;s brief fields as
          a starting point. The campaign stays untouched otherwise — seeding
          never schedules or publishes (L8).
        </p>
        {brandCampaigns.length === 0 ? (
          <p className="text-sm text-gray-500">
            No campaigns for this brand yet — create one on the Campaigns
            surface first.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedCampaignId ?? ""}
              onValueChange={(value) => {
                setSelectedCampaignId(value);
                seedBrief.reset();
              }}
            >
              <SelectTrigger className="w-64" aria-label="Campaign">
                <SelectValue placeholder="Choose a campaign" />
              </SelectTrigger>
              <SelectContent>
                {brandCampaigns.map((campaign) => (
                  <SelectItem key={campaign._id} value={campaign._id}>
                    {campaign.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={seedBriefDisabled}
              onClick={() => {
                seedCampaignBrief();
              }}
            >
              Seed brief fields
            </Button>
            <MutationFeedbackBar
              state={seedBrief.state}
              successLabel="Brief fields seeded into the campaign."
              onRetry={
                seedBrief.state.status === "error" ? seedBrief.retry : undefined
              }
            />
          </div>
        )}
      </section>
      <section
        aria-label="Keyword gaps"
        className="rounded border border-black/10 bg-white p-4 space-y-3"
      >
        <p className="text-sm font-medium">Keyword gaps from research</p>
        <p className="text-sm text-gray-500">
          Researched queries and their honest presence status, derived only from
          real data. Seeding appends a draft plan version whose target keywords
          merge the observed gaps in — the plan stays unapproved until reviewed.
        </p>
        {keywordGaps.length === 0 ? (
          <p className="text-sm text-gray-500">
            No keyword gaps researched yet — run keyword research on the Gaps
            step first.
          </p>
        ) : (
          <>
            <p className="text-sm">
              {keywordGaps.filter((gap) => gap.status === "absent").length}{" "}
              missing of {keywordGaps.length}:{" "}
              {keywordGaps.map((gap) => gap.keyword).join(" · ")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={seedKeywordsDisabled}
                onClick={seedTargetKeywords}
              >
                Seed target keywords from gaps
              </Button>
              <MutationFeedbackBar
                state={seedKeywords.state}
                successLabel="Target keywords seeded as a draft plan version."
                onRetry={
                  seedKeywords.state.status === "error"
                    ? seedKeywords.retry
                    : undefined
                }
              />
            </div>
          </>
        )}
      </section>
      <MutationFeedbackBar
        state={savePlan.state}
        onRetry={savePlan.state.status === "error" ? savePlan.retry : undefined}
      />
    </>
  );
}
