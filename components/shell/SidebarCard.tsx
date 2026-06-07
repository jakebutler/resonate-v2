import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type SidebarCardProps = {
  children: ReactNode;
  className?: string;
};

export function SidebarCard({ children, className }: SidebarCardProps) {
  return (
    <div className={cn(tokens.panel, tokens.panelPadding, className)}>{children}</div>
  );
}
