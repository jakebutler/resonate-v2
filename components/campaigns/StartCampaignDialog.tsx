"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BrandId } from "@/lib/domain";

type StartCampaignDialogProps = {
  brandId: BrandId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (campaignId: string) => void;
};

export function StartCampaignDialog({
  brandId,
  open,
  onOpenChange,
  onCreated,
}: StartCampaignDialogProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createCampaign = useMutation(api.campaigns.createCampaign);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const result = await createCampaign({
        brandId,
        title,
      });
      setTitle("");
      onOpenChange(false);
      onCreated(result.campaignId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a campaign</DialogTitle>
          <DialogDescription>
            Title-only for now — goal and audience are confirmed on the Propose
            shape step. You can rename any time.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={title}
          placeholder="Campaign title"
          aria-label="Campaign title"
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && title.trim()) void handleStart();
          }}
        />
        {error ? (
          <p className="text-sm font-semibold text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!title.trim() || busy}
            onClick={() => void handleStart()}
            data-testid="confirm-start-campaign"
          >
            {busy ? "Starting…" : "Start campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
