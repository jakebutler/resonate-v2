import Link from "next/link";
import { V2ResonateApp } from "@/components/V2ResonateApp";

export const metadata = {
  title: "Resonate v2 — Research & AI",
  description: "Research briefs, claim maps, outlines, and AI-assisted drafts",
};

export default function V2ResearchPage() {
  return (
    <>
      <nav
        aria-label="v2 surfaces"
        className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3 text-sm dark:border-slate-800 dark:bg-slate-950"
      >
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          Resonate v2
        </span>
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
          <Link
            href="/v2"
            className="rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Calendar &amp; composer
          </Link>
          <Link
            href="/v2/research"
            aria-current="page"
            className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100"
          >
            Research &amp; AI
          </Link>
        </div>
      </nav>
      <V2ResonateApp />
    </>
  );
}
