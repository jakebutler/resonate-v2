"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single toast implementation for the campaign surfaces. Replaces the six
 * near-identical local copies (which also never cleared a previous timer, so
 * two rapid toasts could cut the first one short). aria-live announcement is
 * provided by role="status" on the banner.
 */
export function useToast(durationMs = 4200) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (message: string) => {
      setToast(message);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setToast(null), durationMs);
    },
    [durationMs]
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  return { toast, showToast };
}

export function ToastBanner({
  message,
  testId,
  position = "bottom-6",
}: {
  message: string | null;
  testId: string;
  position?: "bottom-6" | "bottom-16";
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      className={`fixed ${position} right-6 z-50 max-w-sm rounded-lg bg-[#001524] px-4 py-3 text-sm text-[#ffecd1] shadow-lg`}
      data-testid={testId}
    >
      {message}
    </div>
  );
}
