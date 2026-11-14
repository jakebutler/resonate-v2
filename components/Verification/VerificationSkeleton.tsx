import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";

/**
 * Loading skeleton for the /verification report: mirrors the loaded layout
 * (header strip + feature cards with criteria rows) instead of a bare spinner.
 */
export function VerificationSkeleton() {
  return (
    <div className="space-y-4" data-testid="verification-skeleton" aria-busy="true" aria-live="polite">
      <div className={cn(tokens.panel, "space-y-3 p-5")}>
        <SkeletonLine className="h-5 w-48" />
        <SkeletonLine className="h-4 w-96 max-w-full" />
      </div>
      {[0, 1].map((index) => (
        <div key={index} className={cn(tokens.panel, "space-y-3 p-5")}>
          <div className="flex items-center justify-between gap-3">
            <SkeletonLine className="h-6 w-64" />
            <SkeletonLine className="h-6 w-24 rounded-full" />
          </div>
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-3/4" />
          {[0, 1].map((row) => (
            <div key={row} className="space-y-2 rounded-lg border border-black/10 p-3">
              <div className="flex items-center gap-2">
                <SkeletonLine className="h-5 w-16 rounded-md" />
                <SkeletonLine className="h-5 w-32 rounded-4xl" />
              </div>
              <SkeletonLine className="h-4 w-5/6" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-black/[0.07]", className)} />;
}
