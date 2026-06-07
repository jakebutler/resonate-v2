import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type WorkspaceLayoutProps = {
  header: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
  banner?: ReactNode;
};

export function WorkspaceLayout({
  header,
  sidebar,
  children,
  banner,
}: WorkspaceLayoutProps) {
  return (
    <section className={cn("border-b", tokens.border, tokens.pageBg)}>
      <div className={tokens.maxWidth}>
        {header}
        {banner ? <div className="mt-4">{banner}</div> : null}
        <div className={sidebar ? tokens.workspaceGrid : "mt-5"}>
          {sidebar ? <div className={tokens.sidebarStack}>{sidebar}</div> : null}
          <div className={sidebar ? tokens.sidebarStack : undefined}>{children}</div>
        </div>
      </div>
    </section>
  );
}
