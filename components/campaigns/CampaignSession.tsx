"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CitationChip } from "@/components/campaigns/CitationChip";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { parseCorpusCitation } from "@/lib/campaignGrounding";

type IdeaDoc = {
  _id: string;
  title?: string;
  text: string;
  flavor?: "opinion" | "insight" | "thought" | undefined;
  excerptCitations?: string[];
  campaignHints?: { campaignId: string; campaignTitle: string }[];
};

type SessionData = {
  campaign: { _id: string; title: string; brandId: string; status: string };
  brief: { goal?: string; audience?: string } | null;
  corpora: {
    corpus: { _id: string; version: number };
    excerpts: { seq: number; text: string; provenance: string }[];
  }[];
  suggested: { join: { state: string }; idea: IdeaDoc | null }[];
  workingSet: { join: { primary: boolean }; idea: IdeaDoc | null }[];
  rejected: { idea: IdeaDoc | null }[];
  acceptedShape: { _id: string } | null;
};

const FLAVOR_TINTS: Record<string, string> = {
  opinion: "bg-[#fff1e0] text-[#b25400]",
  insight: "bg-[#e2eff1] text-[#0e4a54]",
  thought: "bg-[#efeafb] text-[#4a3591]",
};

type CampaignSessionProps = {
  campaignId: string;
};

export function CampaignSession({ campaignId }: CampaignSessionProps) {
  const typedCampaignId = campaignId as never;
  const session = useQuery(api.campaigns.getCampaignSession, {
    campaignId: typedCampaignId,
  }) as SessionData | null | undefined;
  const [toast, setToast] = useState<string | null>(null);
  const [mockConfirmOpen, setMockConfirmOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [inboxSearch, setInboxSearch] = useState("");

  const suggestIdeas = useMutation(api.campaigns.suggestIdeas);
  const addIdea = useMutation(api.campaigns.addIdeaToCampaign);
  const removeIdea = useMutation(api.campaigns.removeIdeaFromCampaign);
  const rejectIdea = useMutation(api.campaigns.rejectIdea);
  const undoRejection = useMutation(api.campaigns.undoIdeaRejection);
  const inboxResults = useQuery(
    api.campaigns.searchSessionIdeas,
    { campaignId: typedCampaignId, search: inboxSearch }
  ) as { idea: IdeaDoc; state: string | null }[] | undefined;

  const excerptLookup = useMemo(() => {
    const map = new Map<string, { seq: number; text: string; provenance: string }>();
    for (const entry of session?.corpora ?? []) {
      for (const excerpt of entry.excerpts) {
        map.set(String(excerpt.seq), excerpt);
      }
    }
    return map;
  }, [session?.corpora]);

  const workingSetIds = useMemo(
    () =>
      new Set(
        (session?.workingSet ?? [])
          .map((entry) => entry.idea?._id)
          .filter(Boolean) as string[]
      ),
    [session?.workingSet]
  );

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const result = await suggestIdeas({ campaignId: typedCampaignId, mockAcknowledged: true });
      setMockConfirmOpen(false);
      showToast(
        result.created > 0
          ? `Generated ${result.created} suggested idea(s) in mock mode — every one cites its corpus excerpts.`
          : "Suggestions are already up to date."
      );
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Suggestion failed.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleAdd(idea: IdeaDoc, inOtherCampaign?: string) {
    await addIdea({ campaignId: typedCampaignId, ideaId: idea._id as never });
    if (inOtherCampaign) {
      showToast(`Linked — still in ${inOtherCampaign} too. Many-to-many, nothing moved.`);
    } else {
      showToast("Added to campaign — campaign-primary. It stays in research with a soft “in campaign” hint.");
    }
  }

  async function handleRemove(idea: IdeaDoc) {
    const result = await removeIdea({ campaignId: typedCampaignId, ideaId: idea._id as never });
    showToast(
      result.removed
        ? "Removed from working set — also detached from any shape slot (one-way membership)."
        : "Not in the working set."
    );
  }

  if (session === undefined) {
    return (
      <main className={cn(tokens.maxWidth)}>
        <p className={cn("text-sm", tokens.textMuted)}>Loading session…</p>
      </main>
    );
  }

  if (session === null) {
    return (
      <main className={cn(tokens.maxWidth)}>
        <p className="text-sm font-semibold text-red-700">Campaign not found.</p>
        <Link href="/campaigns" className={cn("text-sm underline", tokens.accent)}>
          Back to Campaigns
        </Link>
      </main>
    );
  }

  const inOtherCampaigns = (idea: IdeaDoc) =>
    (idea.campaignHints ?? []).filter((hint) => hint.campaignId !== campaignId);

  function renderIdeaCard(idea: IdeaDoc, context: "suggested" | "inbox") {
    const added = workingSetIds.has(idea._id);
    const others = inOtherCampaigns(idea);
    const otherCampaign = others[0]?.campaignTitle;
    return (
      <div
        key={idea._id}
        data-idea={idea._id}
        className="border-t px-4 py-3.5"
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {idea.flavor ? (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-normal",
                FLAVOR_TINTS[idea.flavor] ?? tokens.pillIdle
              )}
            >
              {idea.flavor}
            </span>
          ) : null}
          {otherCampaign ? (
            <span className={cn("text-[11px]", tokens.textMuted)}>
              · already in <b>{otherCampaign}</b> — joining links it, nothing moves
            </span>
          ) : null}
        </div>
        {idea.title ? (
          <p className="text-sm font-semibold">{idea.title}</p>
        ) : null}
        <p className="mt-1 text-sm leading-relaxed">{idea.text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(idea.excerptCitations ?? []).length > 0 ? (
            (idea.excerptCitations ?? []).map((citation) => {
              const parsed = parseCorpusCitation(citation);
              if (!parsed) return null;
              const excerpt = excerptLookup.get(String(parsed.seq));
              return (
                <CitationChip
                  key={citation}
                  seq={parsed.seq}
                  provenance={excerpt?.provenance ?? "corpus excerpt"}
                  text={excerpt?.text ?? "Excerpt text unavailable."}
                  uri={citation}
                />
              );
            })
          ) : (
            <span className={cn("text-[11px]", tokens.textMuted)}>
              no citations — inbox capture
            </span>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            variant="accent"
            size="xs"
            disabled={added}
            onClick={() => void handleAdd(idea, otherCampaign)}
          >
            {added ? "In working set ✓" : "Add to campaign"}
          </Button>
          {context === "suggested" ? (
            <Button
              variant="secondary"
              size="xs"
              onClick={async () => {
                await rejectIdea({ campaignId: typedCampaignId, ideaId: idea._id as never });
                showToast("Marked not useful — undo any time. It stays in research.");
              }}
            >
              Not useful
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <main className={cn(tokens.maxWidth)}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{session.campaign.title}</h1>
        {session.acceptedShape ? (
          <Button variant="primary" size="sm" asChild>
            <Link href={`/campaigns/${campaignId}/shape`}>Open shape</Link>
          </Button>
        ) : null}
      </div>
      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
        Ideas only — opinions, insights, and thoughts are idea flavors. Every
        suggested idea cites corpus excerpts; hover a citation to read it.
      </p>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        <section className={cn(tokens.panel, "overflow-hidden")} aria-label="Corpus excerpts">
          <div className={cn("flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide", tokens.textMuted)}>
            <span>Corpus &amp; excerpts</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-normal", tokens.accentBg, tokens.accent)}>
              corpus v{session.corpora[0]?.corpus.version ?? 1}
            </span>
          </div>
          {session.corpora.length === 0 ? (
            <p className={cn("px-4 pb-4 text-sm", tokens.textMuted)}>
              No corpus attached yet — attach one from the Campaigns home.
            </p>
          ) : null}
          {session.corpora.map((entry) =>
            entry.excerpts.slice(0, 12).map((excerpt) => (
              <div key={`${entry.corpus._id}-${excerpt.seq}`} className="border-t px-4 py-2.5 text-sm" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">#{excerpt.seq}</span>
                  <span className={cn("text-[11px]", tokens.textMuted)}>{excerpt.provenance}</span>
                </div>
                <p className={cn("line-clamp-2 text-[13px]", tokens.textMuted)}>{excerpt.text}</p>
              </div>
            ))
          )}
          <p className={cn("border-t px-4 py-2.5 text-[11px] leading-relaxed", tokens.border, tokens.textMuted)}>
            Brand corpora are shared across campaigns. This campaign holds a
            working set — removing an idea from a slot never detaches the corpus.
          </p>
        </section>

        <section className={cn(tokens.panel, "overflow-hidden")} aria-label="Suggested ideas">
          <div className={cn("flex flex-wrap items-center justify-between gap-2 px-4 py-3")}>
            <span className={cn("text-xs font-semibold uppercase tracking-wide", tokens.textMuted)}>
              Suggested ideas
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#fff1e0] px-2.5 py-0.5 text-[11px] font-normal text-[#b25400]">
                mock AI
              </span>
              <Button
                variant="primary"
                size="xs"
                disabled={suggesting || session.corpora.length === 0}
                onClick={() => setMockConfirmOpen(true)}
                data-testid="suggest-ideas"
              >
                {session.corpora.length === 0
                  ? "Attach a corpus first"
                  : suggesting
                    ? "Suggesting…"
                    : "Suggest ideas"}
              </Button>
            </div>
          </div>
          {mockConfirmOpen ? (
            <div className="border-t bg-[#fff8f0] px-4 py-3 text-sm" style={{ borderColor: "rgba(255,125,0,0.3)" }} data-testid="mock-confirm">
              <p className="text-[#8a4b00]">
                Generation runs in <b>mock mode</b> — suggestions are template
                drafts grounded in your corpus excerpts. Nothing publishes and
                nothing submits.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="xs" disabled={suggesting} onClick={() => void handleSuggest()}>
                  {suggesting ? "Suggesting…" : "Run in mock mode"}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setMockConfirmOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {session.suggested.map((entry) =>
            entry.idea ? renderIdeaCard(entry.idea, "suggested") : null
          )}

          {session.rejected.length > 0 ? (
            <div className="border-t px-4 py-3" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
              <p className={cn("text-[11px] font-semibold uppercase tracking-wide", tokens.textMuted)}>
                Marked not useful
              </p>
              {session.rejected.map((entry) =>
                entry.idea ? (
                  <div key={entry.idea._id} className="mt-1.5 flex items-center gap-2 text-[13px] opacity-50">
                    <span className="line-through">{entry.idea.text.slice(0, 80)}…</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={async () => {
                        await undoRejection({ campaignId: typedCampaignId, ideaId: entry.idea!._id as never });
                        showToast("Restored — back in the suggestion list.");
                      }}
                    >
                      Undo
                    </Button>
                  </div>
                ) : null
              )}
            </div>
          ) : null}

          <div className="border-t" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
            <div className={cn("flex items-center justify-between gap-3 px-4 py-3")}>
              <span className={cn("text-xs font-semibold uppercase tracking-wide", tokens.textMuted)}>
                From your research inbox (one-offs)
              </span>
              <Input
                value={inboxSearch}
                onChange={(event) => setInboxSearch(event.target.value)}
                placeholder="Search your inbox…"
                aria-label="Search your inbox"
                className="h-7 w-44 text-xs"
              />
            </div>
            <div data-testid="inbox-results">
              {(inboxResults ?? []).filter((hit) => !workingSetIds.has(hit.idea._id)).length === 0 ? (
                <p className={cn("border-t px-4 py-4 text-center text-sm", tokens.border, tokens.textMuted)}>
                  No one-off ideas match{inboxSearch ? ` “${inboxSearch}”` : " yet"}.
                </p>
              ) : null}
              {(inboxResults ?? [])
                .filter((hit) => !workingSetIds.has(hit.idea._id))
                .slice(0, 6)
                .map((hit) => renderIdeaCard(hit.idea, "inbox"))}
            </div>
          </div>
        </section>

        <section className={cn(tokens.panel, "overflow-hidden")} aria-label="Campaign working set">
          <div className={cn("flex items-center justify-between px-4 py-3")}>
            <span className={cn("text-xs font-semibold uppercase tracking-wide", tokens.textMuted)}>
              Campaign working set
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-normal", tokens.accentBg, tokens.accent)} data-testid="working-count">
              {session.workingSet.length} ideas
            </span>
          </div>
          {session.workingSet.length === 0 ? (
            <p className={cn("border-t px-4 py-6 text-center text-sm", tokens.border, tokens.textMuted)}>
              No ideas yet. Accept suggestions or search the inbox. Accepting
              here makes the idea <b>campaign-primary</b>.
            </p>
          ) : null}
          {session.workingSet.map((entry) =>
            entry.idea ? (
              <div key={entry.idea._id} className="flex items-start gap-2 border-t px-3.5 py-2.5 text-sm" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                {entry.idea.flavor ? (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-normal", FLAVOR_TINTS[entry.idea.flavor])}>
                    {entry.idea.flavor}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-[13px]">{entry.idea.text}</span>
                <button
                  type="button"
                  aria-label="Remove from working set"
                  className="shrink-0 text-gray-400 hover:text-[#78290f]"
                  onClick={() => void handleRemove(entry.idea!)}
                >
                  ✕
                </button>
              </div>
            ) : null
          )}
          <p className={cn("border-t px-3.5 py-2.5 text-[11px] leading-relaxed", tokens.border, tokens.textMuted)}>
            Slot ↔ membership is <b>one-way</b>: linking an idea to a shape slot
            never removes it from this set, and removing it from the working set
            detaches it from any slot.
          </p>
        </section>
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-[#001524] px-4 py-3 text-sm text-[#ffecd1] shadow-lg"
          data-testid="session-toast"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
