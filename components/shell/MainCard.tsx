import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type MainCardProps = {
  children: ReactNode;
  className?: string;
  padding?: boolean;
};

export function MainCard({ children, className, padding = false }: MainCardProps) {
  return (
    <div className={cn(tokens.panel, padding && tokens.panelPadding, className)}>
      {children}
    </div>
  );
}
