"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SlideOver({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
}: SlideOverProps) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        aria-describedby={undefined}
        className="w-full gap-0 border-l border-border/80 bg-background p-0 sm:max-w-2xl"
        side="right"
      >
        <SheetHeader className="border-b border-border/80 px-6 py-4">
          <div className="flex items-center gap-3 pr-8">
            {icon ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--papaya-whip)] text-[var(--vivid-tangerine)]">
                {icon}
              </div>
            ) : null}
            <div>
              <SheetTitle className="font-forum text-lg text-[var(--ink-black)]">
                {title}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <SheetFooter className="border-t border-border/80 px-6 py-4">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
