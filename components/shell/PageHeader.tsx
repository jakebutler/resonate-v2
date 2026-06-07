import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type PageHeaderProps = {
  icon: ReactNode;
  label: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
};

export function PageHeader({
  icon,
  label,
  title,
  description,
  actions,
  footer,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className={cn("flex items-center gap-2 text-sm font-semibold", tokens.accent)}>
          {icon}
          {label}
        </div>
        <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        <p className={cn("mt-1 max-w-3xl text-sm", tokens.textMuted)}>{description}</p>
        {footer}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
