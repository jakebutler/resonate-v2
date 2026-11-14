"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StrategyPlanPanel } from "./StrategyPlanPanel";
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
  const campaignRows = useQuery(api.campaigns.listCampaigns, {});
  const saveStrategyPlan = useMutation(api.aeoIntel.saveStrategyPlan);
  const saveBrief = useMutation(api.shapes.saveBrief);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [briefSeeded, setBriefSeeded] = useState(false);

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

  const brandCampaigns: CampaignOption[] = (campaignRows ?? []).filter(
    (campaign) => campaign.brandId === brandId
  );

  // Deriving the typed campaign from the selected id keeps saveBrief's
  // Id<"campaigns"> argument honest without casting the select's string value.
  const selectedCampaign =
    brandCampaigns.find((campaign) => campaign._id === selectedCampaignId) ??
    null;

  const seedBriefDisabled =
    !selectedCampaign || planRow === null || planRow === undefined;

  async function seedCampaignBrief() {
    if (!planRow || !selectedCampaign) return;
    await saveBrief({
      campaignId: selectedCampaign._id,
      goal: planRow.plan.brief.goal,
      audience: planRow.plan.brief.audience,
    });
    setBriefSeeded(true);
  }

  return (
    <>
      <StrategyPlanPanel
        plan={plan}
        gapTitles={gapTitles}
        onAccept={(planId) => {
          if (!planRow) return;
          void saveStrategyPlan({
            brandId,
            status: "reviewed",
            plan: planRow.plan,
          }).then(() => undefined, () => undefined);
          void planId;
        }}
        onRequestChanges={(planId, note) => {
          if (!planRow) return;
          void saveStrategyPlan({
            brandId,
            status: "draft",
            reviewNotes: note,
            plan: planRow.plan,
          }).then(() => undefined, () => undefined);
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
                setBriefSeeded(false);
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
                void seedCampaignBrief();
              }}
            >
              Seed brief fields
            </Button>
            {briefSeeded ? (
              <p role="status" className="text-sm">
                Brief fields seeded into the campaign.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
