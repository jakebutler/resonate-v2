"use client";

import { Badge } from "@/components/ui/badge";
import { AeoPanel, PanelEmpty, PanelError, PanelLoading } from "./PanelStates";
import type { CompetitorComparison, Loadable } from "./types";

/**
 * Competitor comparison for the intel step: citation share and indexed-page
 * counts for the connected target beside each tracked competitor.
 */
export function CompetitorComparisonPanel({
  comparison,
}: {
  comparison: Loadable<CompetitorComparison | null>;
}) {
  return (
    <AeoPanel
      ariaLabel="Competitor comparison"
      title="Competitor comparison"
      description="How the target's answer-engine citations and indexed pages stack up."
    >
      {comparison.status === "loading" ? (
        <PanelLoading label="Loading competitor comparison" />
      ) : comparison.status === "error" ? (
        <PanelError
          message={comparison.message}
          onRetry={comparison.onRetry}
        />
      ) : comparison.data === null ? (
        <PanelEmpty
          title="No comparison yet"
          description="Run an intel cycle after connecting the target to compare citation share."
        />
      ) : (
        (() => {
          const data = comparison.data;
          return (
            <table className="w-full text-sm">
              <caption className="sr-only">
                Citations and indexed pages by site
              </caption>
              <thead>
                <tr className="border-b border-black/10 text-left">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Site
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Pages
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Citations
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-black/5">
                  <td className="py-1 pr-3">
                    <span className="font-medium">{data.target.name}</span>{" "}
                    <Badge variant="secondary">Target</Badge>
                  </td>
                  <td className="py-1 pr-3">{data.target.pageCount}</td>
                  <td className="py-1">{data.target.citationCount}</td>
                </tr>
                {data.competitors.map((competitor) => (
                  <tr
                    key={competitor.domain}
                    className="border-b border-black/5 last:border-0"
                  >
                    <td className="py-1 pr-3">
                      <span className="font-medium">{competitor.name}</span>
                    </td>
                    <td className="py-1 pr-3">{competitor.pageCount}</td>
                    <td className="py-1">{competitor.citationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()
      )}
    </AeoPanel>
  );
}
