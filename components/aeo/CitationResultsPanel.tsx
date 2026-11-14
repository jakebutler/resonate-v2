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
          return (
            <div className="space-y-3">
              <p className={cn("text-sm", tokens.textMuted)}>
                {data.results.length} question
                {data.results.length === 1 ? "" : "s"} checked ·{" "}
                {new Date(data.ranAt).toLocaleString()}
              </p>
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
                          <Badge key={brand} aria-label={`Cited: ${brand}`}>
                            Cited: {brand}
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
                          Extractability{" "}
                          {Math.round(result.extractabilityScore * 100)}%
                        </span>
                      ) : null}
                    </div>
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
