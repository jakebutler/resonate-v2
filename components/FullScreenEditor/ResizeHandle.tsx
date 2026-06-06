"use client";

import { useRef, useCallback } from "react";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
}

/**
 * A vertical drag handle that emits resize deltas.
 * Fires onResize(delta) where delta is the horizontal pointer movement.
 * The parent is responsible for clamping the sidebar width.
 */
export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Prevent Tiptap or other children from capturing the drag
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const delta = lastXRef.current - e.clientX; // positive = dragging left = widening sidebar
      lastXRef.current = e.clientX;
      onResize(delta);
    },
    [onResize]
  );

  const releasePointerCapture = (event: React.PointerEvent) => {
    const target = event.currentTarget as HTMLElement | null;
    if (!target?.releasePointerCapture) return;
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that already released capture.
    }
  };

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    releasePointerCapture(event);
    isDraggingRef.current = false;
  }, []);

  // Also reset on pointercancel (e.g. touch interrupted, window blur)
  // so the drag doesn't get stuck in an active state
  const handlePointerCancel = useCallback((event: React.PointerEvent) => {
    releasePointerCapture(event);
    isDraggingRef.current = false;
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      className="w-1 shrink-0 cursor-col-resize bg-gray-100 hover:bg-[#ff7d00] transition-colors active:bg-[#ff7d00] select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}
