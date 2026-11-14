"use client";

import { Badge } from "@/components/ui/badge";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, PanelEmpty, PanelError, PanelLoading } from "./PanelStates";
import type { CitationRun, Loadable } from "./types";

/**
 * Answer-engine citation results for the intel step: per question, who got
 * cited and how extractable the connected target's answer content is.
 */
export function CitationResultsPanel({
  run,
}: {
  run: Loadable<CitationRun | null>;
}) {
  return (
    <AeoPanel
      ariaLabel="Answer-engine citations"
      title="Answer-engine citations"
      description="Who the answer engines cite for this brand's question set."
    >
      {run.status === "loading" ? (
        <PanelLoading label="Loading citation results" />
      ) : run.status === "error" ? (
        <PanelError message={run.message} onRetry={run.onRetry} />
      ) : run.data === null ? (
        <PanelEmpty
          title="No citation results yet"
          description="Run an answer-engine check to see which brands get cited and why."
        />
      ) : (
        (() => {
          const data = run.data;
          const mismatchCount = data.brandMismatchCount ?? 0;
          return (
            <div className="space-y-3">
              <p className={cn("text-sm", tokens.textMuted)}>
                {data.results.length} question
                {data.results.length === 1 ? "" : "s"} checked ·{" "}
                {new Date(data.ranAt).toLocaleString()}
              </p>
              {mismatchCount > 0 ? (
                <div role="alert" className={tokens.noticeWarning}>
                  Brand mismatch suspected: {mismatchCount} of {data.results.length} cited
                  {data.results.length === 1 ? " answer" : " answers"} may describe a different
                  product with this brand&apos;s name. Review the excerpts before acting on them.
                </div>
              ) : null}
              <ul className="space-y-2">
                {data.results.map((result) => (
                  <li
                    key={result.question}
                    className="rounded border border-black/10 px-3 py-2"
                  >
                    <p className="text-sm font-medium">{result.question}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {result.citedBrands.length > 0 ? (
                        result.citedBrands.map((brand) => (
                          <Badge
                            key={brand}
                            aria-label={
                              result.brandMatch === "suspect"
                                ? `Cited with suspected brand mismatch: ${brand}`
                                : `Cited: ${brand}`
                            }
                          >
                            {result.brandMatch === "suspect"
                              ? `Cited: ${brand} (mismatch suspected)`
                              : `Cited: ${brand}`}
                          </Badge>
                        ))
                      ) : (
                        <Badge
                          variant="outline"
                          aria-label="No citation for this brand"
                        >
                          Not cited
                        </Badge>
                      )}
                      {result.citedCompetitors.map((competitor) => (
                        <Badge
                          key={competitor}
                          variant="outline"
                          aria-label={`Competitor cited: ${competitor}`}
                        >
                          Competitor: {competitor}
                        </Badge>
                      ))}
                      {typeof result.extractabilityScore === "number" ? (
                        <span className={cn("text-xs", tokens.textSubtle)}>
                          {/* Stored scale is an integer 0–100. */}
                          Extractability {result.extractabilityScore}%
                        </span>
                      ) : null}
                    </div>
                    {result.brandMatch === "suspect" ? (
                      <div role="alert" className={cn(tokens.noticeWarning, "mt-2")}>
                        <span className="font-medium">Mismatch suspected.</span>{" "}
                        {result.brandMatchDetail ??
                          "The cited answer may describe a different product with the same name."}
                      </div>
                    ) : null}
                    {result.answerExcerpt ? (
                      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
                        “{result.answerExcerpt}”
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()
      )}
    </AeoPanel>
  );
}
