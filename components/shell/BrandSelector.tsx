"use client";

import { FilterGroup } from "@/components/shell/FilterGroup";
import { SidebarCard } from "@/components/shell/SidebarCard";
import { tokens } from "@/components/shell/tokens";
import { BRANDS, type BrandId } from "@/lib/domain";
import { cn } from "@/lib/utils";

type VoicePack = {
  name: string;
  markdown: string;
};

type BrandSelectorProps = {
  brandId: BrandId;
  onBrandChange: (brandId: BrandId) => void;
  voicePack?: VoicePack;
};

export function BrandSelector({
  brandId,
  onBrandChange,
  voicePack,
}: BrandSelectorProps) {
  return (
    <>
      <SidebarCard>
        <FilterGroup
          label="Brands"
          mode="single"
          onChange={onBrandChange}
          options={BRANDS.map((item) => ({
            id: item.id,
            name: item.name,
          }))}
          selected={brandId}
        />
      </SidebarCard>

      {voicePack ? (
        <details className={cn(tokens.panel, "text-sm")}>
          <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-gray-500">
            Voice pack
          </summary>
          <div className="border-t border-black/5 px-4 pb-4">
            <p className="pt-2 text-sm font-medium">{voicePack.name}</p>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-[#111827] p-3 text-xs text-white">
              {voicePack.markdown}
            </pre>
          </div>
        </details>
      ) : null}
    </>
  );
}
