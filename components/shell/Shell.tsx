import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";

export type WorkspaceSurface = "calendar" | "campaigns" | "research" | "connections";

type ShellProps = {
  activeSurface: WorkspaceSurface;
  children: React.ReactNode;
};

const bypassAuthForE2E =
  process.env.E2E_BYPASS_AUTH === "1" ||
  process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1";

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
              href="/campaigns"
              aria-current={activeSurface === "campaigns" ? "page" : undefined}
              className={navLinkClass(activeSurface === "campaigns")}
            >
              Campaigns
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
          <div className="ml-auto flex items-center">
            {bypassAuthForE2E ? (
              <span
                aria-label="Signed in (E2E bypass)"
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold",
                  tokens.accentBg,
                  tokens.accent
                )}
              >
                E2E
              </span>
            ) : (
              <UserButton
                afterSignOutUrl="/sign-in"
                appearance={{ elements: { avatarBox: "h-7 w-7" } }}
              />
            )}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
