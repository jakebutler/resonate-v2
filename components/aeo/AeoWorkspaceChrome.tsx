"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function AeoWorkspaceChrome({ children }: { children: React.ReactNode }) {
  const [brandId, setBrandId] = useState<BrandId>("corvo");
  const pathname = usePathname();
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
            return (
              <Link
                key={flow.href}
                href={flow.href}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors",
                  active
                    ? cn(tokens.accentBg, "font-medium", tokens.accent)
                    : cn(tokens.textMuted, "hover:bg-black/5")
                )}
              >
                {flow.label}
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
