"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StrategyPlanPanel } from "./StrategyPlanPanel";
import { MutationFeedbackBar, useAeoMutation } from "./mutationFeedback";
import { planRowToStrategyPlan } from "./mappings";
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
 * Plan step: review actions resolve the plan's review state; the only content
 * actions seed downstream drafts — captured ideas (from gaps) or campaign
 * brief fields. Nothing here approves or publishes anything (L8).
 */
export function PlanFlow() {
  const { brandId } = useAeoBrand();
  const planRow = useQuery(api.aeoIntel.getLatestStrategyPlan, { brandId });
  const findingRows = useQuery(api.aeoIntel.listFindings, { brandId });
  const campaignRows = useQuery(api.campaigns.listCampaigns, {});
  const savePlan = useAeoMutation(
    useMutation(api.aeoIntel.saveStrategyPlan)
  );
  const seedBrief = useAeoMutation(useMutation(api.shapes.saveBrief));

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");

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
      <MutationFeedbackBar
        state={savePlan.state}
        onRetry={savePlan.state.status === "error" ? savePlan.retry : undefined}
      />
    </>
  );
}
