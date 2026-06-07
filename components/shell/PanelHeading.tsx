import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tokens } from "@/components/shell/tokens";

type PanelHeadingProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PanelHeading({ title, description, actions }: PanelHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className={cn("mt-1 text-sm", tokens.textMuted)}>{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
