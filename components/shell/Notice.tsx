import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type NoticeVariant = "info" | "warning";

type NoticeProps = {
  children: ReactNode;
  variant?: NoticeVariant;
};

export function Notice({ children, variant = "info" }: NoticeProps) {
  return (
    <div
      className={cn(variant === "warning" ? tokens.noticeWarning : tokens.notice)}
      role="status"
    >
      {children}
    </div>
  );
}
