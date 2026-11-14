import type { ReactNode } from "react";

/**
 * Amber advisory text with a shape-based marker so the status never rides on
 * color alone (WCAG 1.4.1). The glyph is aria-hidden; the text carries the
 * meaning for assistive technology.
 */
export function StatusNote({ children, role }: { children: ReactNode; role?: "alert" | "status" }) {
  return <p role={role} className="text-sm text-amber-700"><span aria-hidden="true" className="mr-1 font-semibold">⚠</span>{children}</p>;
}
