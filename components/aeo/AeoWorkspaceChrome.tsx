"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BrandSelector } from "@/components/shell/BrandSelector";
import { tokens } from "@/components/shell/tokens";
import { BRANDS, type BrandId } from "@/lib/domain";
import { cn } from "@/lib/utils";

type AeoBrandContextValue = { brandId: BrandId; brandName: string };

const AeoBrandContext = createContext<AeoBrandContextValue | null>(null);

export function useAeoBrand(): AeoBrandContextValue {
  const value = useContext(AeoBrandContext);
  if (!value) {
    throw new Error("useAeoBrand must be used inside AeoWorkspaceChrome");
  }
  return value;
}

/** The connect → intel → competitors → gaps → plan flow, in walking order. */
const FLOWS = [
  { href: "/aeo", label: "Connect" },
  { href: "/aeo/intel", label: "Intel" },
  { href: "/aeo/competitors", label: "Competitors" },
  { href: "/aeo/gaps", label: "Gaps" },
  { href: "/aeo/plan", label: "Plan" },
] as const;

/**
 * Reads the brand from a URL query string. `?brand=` is the single source of
 * truth for the selection — honored by every /aeo/* route so reloads and
 * deep links restore it instead of resetting to the default. Unknown values
 * are ignored (the caller keeps its current selection).
 */
export function brandIdFromSearch(search: string): BrandId | null {
  const param = new URLSearchParams(search).get("brand");
  return BRANDS.some((brand) => brand.id === param)
    ? (param as BrandId)
    : null;
}

/**
 * Step completion, read from the same records the flows render. A step is
 * complete only when its output exists for the selected brand — never
 * inferred from anything else.
 */
function useStepCompletion(brandId: BrandId): Record<string, boolean | undefined> {
  // undefined while the query loads: the indicator stays hidden rather than
  // flashing "incomplete". Sync transports may report a pending query as null
  // rather than undefined, so both mean "not loaded yet".
  const targetRow = useQuery(api.aeoIntel.getTarget, { brandId });
  const runRows = useQuery(api.aeoIntel.listRuns, { brandId });
  const findingRows = useQuery(api.aeoIntel.listFindings, { brandId });
  const planRow = useQuery(api.aeoIntel.getLatestStrategyPlan, { brandId });
  return {
    "/aeo": targetRow != null ? true : undefined,
    "/aeo/intel":
      runRows != null && runRows.some((run) => run.status === "complete")
        ? true
        : undefined,
    "/aeo/competitors":
      targetRow != null && targetRow.competitorUrls.length > 0
        ? true
        : undefined,
    "/aeo/gaps":
      findingRows != null && findingRows.length > 0 ? true : undefined,
    "/aeo/plan": planRow != null ? true : undefined,
  };
}

export function AeoWorkspaceChrome({ children }: { children: React.ReactNode }) {
  const [brandId, setBrandIdState] = useState<BrandId>("corvo");
  const pathname = usePathname();

  // ?brand= wins on mount: a deep link or reload restores the selection
  // instead of resetting every /aeo/* route to Corvo. This must be a
  // post-hydration sync — reading the URL during render would produce
  // markup that mismatches the server HTML whenever ?brand= is set.
  useEffect(() => {
    const fromUrl = brandIdFromSearch(window.location.search);
    if (fromUrl) {
      // One-time hydration from the URL; reading it during render would
      // produce markup that mismatches the server HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBrandIdState(fromUrl);
    }
  }, []);

  // Every selection change writes the URL, so the address bar always
  // reflects (and can restore) what is selected.
  const setBrandId = (next: BrandId) => {
    setBrandIdState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("brand", next);
    window.history.replaceState(null, "", url);
  };

  const stepCompletion = useStepCompletion(brandId);
  const brandName =
    BRANDS.find((brand) => brand.id === brandId)?.name ?? brandId;
  const value = useMemo(() => ({ brandId, brandName }), [brandId, brandName]);

  return (
    <AeoBrandContext.Provider value={value}>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <nav
          aria-label="AEO/SEO flow steps"
          className="flex flex-wrap items-center gap-3 text-sm"
        >
          {FLOWS.map((flow) => {
            const active = pathname === flow.href;
            const complete = stepCompletion[flow.href] === true;
            return (
              <Link
                key={flow.href}
                href={`${flow.href}?brand=${brandId}`}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors",
                  active
                    ? cn(tokens.accentBg, "font-medium", tokens.accent)
                    : cn(tokens.textMuted, "hover:bg-black/5")
                )}
              >
                {flow.label}
                {/* Completion is data-backed and quiet: a check only when the
                    step's output exists, nothing when the data has not loaded
                    or the step has no output yet. */}
                {complete ? (
                  <span aria-hidden="true" className="ml-1">
                    ✓
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside>
            <BrandSelector brandId={brandId} onBrandChange={setBrandId} />
          </aside>
          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      </div>
    </AeoBrandContext.Provider>
  );
}
