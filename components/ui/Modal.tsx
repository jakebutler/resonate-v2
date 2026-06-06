"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl" | "full";
  bodyClassName?: string;
  panelClassName?: string;
}

const sizeClasses = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-6xl",
  full: "w-[min(96rem,calc(100vw-2rem))] max-w-[min(96rem,calc(100vw-2rem))]",
} as const;

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  bodyClassName = "",
  panelClassName = "",
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        aria-label={title}
        aria-describedby={undefined}
        className={cn(
          "grid max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-[28px] border border-border/80 bg-background p-0 shadow-2xl",
          sizeClasses[size],
          panelClassName
        )}
      >
        <DialogHeader className="border-b border-border/80 px-6 py-4">
          <DialogTitle className="font-forum text-lg text-[var(--ink-black)]">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className={cn("min-h-0 overflow-y-auto p-6", bodyClassName)}>
          {children}
        </div>
        {footer ? (
          <DialogFooter className="rounded-none border-t border-border/80 bg-background px-6 py-4 sm:justify-between">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
