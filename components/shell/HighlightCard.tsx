import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type HighlightCardProps = {
  children: ReactNode;
  className?: string;
};

/** Teal-accent callout panel used for success states and selected items. */
export function HighlightCard({ children, className }: HighlightCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[#15616d]/30 bg-[#f1fbfc] p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function HighlightTitle({ children }: { children: ReactNode }) {
  return <p className={cn("text-sm font-medium", tokens.accent)}>{children}</p>;
}
