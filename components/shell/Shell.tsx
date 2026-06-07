import Link from "next/link";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";

export type WorkspaceSurface = "calendar" | "research" | "connections";

type ShellProps = {
  activeSurface: WorkspaceSurface;
  children: React.ReactNode;
};

function navLinkClass(active: boolean) {
  return cn(
    "rounded-md px-2 py-1 text-sm transition-colors",
    active
      ? cn(tokens.accentBg, "font-medium", tokens.accent)
      : cn(tokens.textMuted, "hover:bg-black/5")
  );
}

export function Shell({ activeSurface, children }: ShellProps) {
  return (
    <div className={cn("min-h-screen", tokens.canvasBg, tokens.text)}>
      <nav
        aria-label="workspace surfaces"
        className={cn("border-b bg-white", tokens.border)}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3 text-sm">
          <span className={cn("font-semibold", tokens.accent)}>Resonate</span>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              aria-current={activeSurface === "calendar" ? "page" : undefined}
              className={navLinkClass(activeSurface === "calendar")}
            >
              Calendar
            </Link>
            <Link
              href="/research"
              aria-current={activeSurface === "research" ? "page" : undefined}
              className={navLinkClass(activeSurface === "research")}
            >
              Research
            </Link>
            <Link
              href="/#connections"
              aria-current={activeSurface === "connections" ? "page" : undefined}
              className={navLinkClass(activeSurface === "connections")}
            >
              Connections
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
